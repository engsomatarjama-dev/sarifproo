package com.sarifpro.accessibility

import android.accessibilityservice.AccessibilityService
import android.content.SharedPreferences
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo
import android.view.accessibility.AccessibilityWindowInfo
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.sarifpro.BuildConfig

class SarifAccessibilityService : AccessibilityService() {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val scanRunnable = object : Runnable {
        override fun run() {
            tryHandleAutomation("poll")
            mainHandler.postDelayed(this, if (isAutomationArmed()) pollIntervalMs() else 1000)
        }
    }
    private var lastAutomationAt: Long = 0L
    private var confirmRetries = 0
    private var daraLastAttemptAt: Long = 0L
    private var daraRetryState = ""
    private var daraRetries = 0
    private var lastScreenFingerprint = ""
    private var lastScreenFingerprintAt: Long = 0L

    override fun onAccessibilityEvent(event: AccessibilityEvent?) {
        if (event == null) {
            return
        }

        val packageName = event.packageName?.toString().orEmpty()
        if (packageName.contains("phone", ignoreCase = true) || packageName.contains("dialer", ignoreCase = true)) {
            debugLog("Accessibility event=${eventTypeName(event.eventType)} package=$packageName armed=${isAutomationArmed()} mode=${automationMode()}")
        }
        if (isAutomationArmed()) {
            ensurePolling()
            tryHandleAutomation("event:${eventTypeName(event.eventType)}")
        }
    }

    override fun onInterrupt() = Unit

    override fun onServiceConnected() {
        super.onServiceConnected()
        instance = this
        Log.i(TAG, "Sarif accessibility service connected")
        startPollingLoop()
    }

    override fun onDestroy() {
        if (instance === this) {
            instance = null
        }
        mainHandler.removeCallbacks(scanRunnable)
        super.onDestroy()
    }

    private fun tryHandleAutomation(source: String) {
        if (!isAutomationArmed()) {
            return
        }
        if (automationMode() != MODE_BALANCE_CHECK && finalResultState() == WAITING_FINAL_RESULT) {
            tryHandleFinalResult(source)
            return
        }
        if (automationMode() == MODE_DARA) {
            tryHandleDaraSalaamFlow(source)
        } else if (automationMode() == MODE_BALANCE_CHECK) {
            tryHandleBalanceCheckFlow(source)
        } else {
            tryHandlePinEntry(source)
        }
    }

    private fun tryHandlePinEntry(source: String) {
        val now = System.currentTimeMillis()
        if (now - lastAutomationAt < actionThrottleMs()) {
            return
        }

        val pin2 = securePrefs().getString("pin2", "").orEmpty()
        if (pin2.isBlank()) {
            return
        }

        val candidateWindows = windows.orEmpty()
        val candidateRoots = buildCandidateRoots(candidateWindows, null, rootInActiveWindow)
        val likelyUssdRoots = filterLikelyUssdRoots(candidateRoots)
        val likelyScreenText = likelyUssdRoots.joinToString(" ") { collectReadableText(it) }
        val normalizedLikelyScreenText = normalizeFinalResultText(likelyScreenText)
        if (
            likelyUssdRoots.isNotEmpty() &&
            looksLikeFinalFailureResult(normalizedLikelyScreenText)
        ) {
            recoverFromUssdFailure(
                likelyUssdRoots,
                likelyScreenText,
                "direct_transfer",
                failureReasonForUnexpected(normalizedLikelyScreenText)
            )
            return
        }
        val relevantRoots = filterRelevantRoots(candidateRoots)
        val packageName = relevantRoots.firstOrNull()?.packageName?.toString().orEmpty()

        if (relevantRoots.isEmpty()) {
            debugLog("Polling source=$source did not find a relevant USSD window. roots=${candidateRoots.size} windows=${candidateWindows.size} packages=${candidateRoots.mapNotNull { it.packageName?.toString() }.distinct()}")
            return
        }

        val pinField = findInputField(relevantRoots) ?: run {
            debugLog("Relevant window found from $source but no editable PIN field was detected for package=$packageName")
            return
        }
        val screenText = relevantRoots.joinToString(" ") { collectReadableText(it) }
        if (!allowScreenAction(DIRECT_TRANSFER_RUNNING, screenText)) {
            return
        }

        val didFill = fillText(pinField, pin2)
        if (!didFill) {
            debugLog("PIN2 injection failed from $source for package=$packageName")
            return
        }

        lastAutomationAt = now
        confirmRetries = 0
        setDirectState(DIRECT_TRANSFER_RUNNING)
        debugLog("PIN2 injected from $source for package=$packageName")
        scheduleDirectConfirmAttempt(packageName)
    }

    private fun tryHandleDaraSalaamFlow(source: String) {
        val now = System.currentTimeMillis()
        if (now - daraLastAttemptAt < actionThrottleMs()) {
            return
        }

        val roots = filterLikelyUssdRoots(buildCandidateRoots(windows.orEmpty(), null, rootInActiveWindow))
        if (roots.isEmpty()) {
            debugLog("Dara flow waiting for USSD window from $source")
            return
        }

        val state = daraState()
        if (state == DARA_COMPLETE || state == DARA_FAILED) {
            disarmAutomation()
            return
        }

        val step = daraStep(state) ?: run {
            setDaraState(DARA_FAILED)
            disarmAutomation()
            return
        }

        val screenText = roots.joinToString(" ") { collectReadableText(it) }.lowercase()
        val normalizedScreenText = normalizeFinalResultText(screenText)
        if (looksLikeFinalFailureResult(normalizedScreenText)) {
            if (recoverFromUssdFailure(roots, screenText, "bank_deposit", failureReasonForUnexpected(normalizedScreenText))) {
                setDaraState(DARA_FAILED)
                return
            }
        }
        if (!step.matches(screenText)) {
            if (now - daraStateChangedAt() > DARA_TRANSITION_GRACE_MS) {
                registerDaraRetry(state, "Expected screen for $state not detected")
            }
            daraLastAttemptAt = now
            return
        }
        if (!allowScreenAction(state, screenText)) {
            return
        }

        val input = findInputField(roots) ?: run {
            registerDaraRetry(state, "No input field for $state")
            daraLastAttemptAt = now
            return
        }

        val value = step.value()
        if (!fillText(input, value)) {
            registerDaraRetry(state, "Text entry failed for $state")
            daraLastAttemptAt = now
            return
        }

        daraLastAttemptAt = now
        debugLog("Dara state=$state entered value length=${value.length}")
        mainHandler.postDelayed({
            val latestRoots = filterLikelyUssdRoots(buildCandidateRoots(windows.orEmpty(), null, rootInActiveWindow))
            val clicked = clickConfirm(latestRoots)
            debugLog("Dara state=$state send clicked=$clicked")
            if (clicked) {
                daraRetries = 0
                daraRetryState = ""
                setDaraState(step.nextState)
                if (step.nextState == WAITING_FINAL_RESULT) {
                    setFinalResultState(WAITING_FINAL_RESULT)
                    extendAutomation(75_000L)
                } else if (step.nextState == DARA_COMPLETE) {
                    disarmAutomation()
                }
            } else {
                registerDaraRetry(state, "Send action failed for $state")
            }
        }, actionDelayMs())
    }

    private fun daraStep(state: String): DaraStep? {
        return when (state) {
            DARA_WAIT_PIN -> DaraStep(
                state,
                DARA_MAIN_MENU,
                { securePrefs().getString("pin2", "").orEmpty() },
                { text -> text.contains("zaad") && text.contains("pin") }
            )
            DARA_MAIN_MENU -> DaraStep(
                state,
                DARA_BANK_MENU,
                { "5" },
                { text -> text.contains("adeega sarifka") && (text.contains("dara-salaam") || text.contains("dara salaam")) }
            )
            DARA_BANK_MENU -> DaraStep(
                state,
                DARA_AMOUNT,
                { "2" },
                { text -> (text.contains("dara-salaam") || text.contains("dara salaam")) && text.contains("lacag dhigasho") }
            )
            DARA_AMOUNT -> DaraStep(
                state,
                DARA_INFO,
                { prefs().getString("dara_amount", "").orEmpty() },
                { text -> text.contains("fadlan geli lacagta") }
            )
            DARA_INFO -> DaraStep(
                state,
                DARA_BANK_PIN,
                { "m" },
                { text -> text.contains("fadlan geli macluumaad") }
            )
            DARA_BANK_PIN -> DaraStep(
                state,
                DARA_CONFIRM,
                { securePrefs().getString("bank_pin", "").orEmpty() },
                { text -> text.contains("bangiga") && (text.contains("sirta") || text.contains("pin")) }
            )
            DARA_CONFIRM -> DaraStep(
                state,
                WAITING_FINAL_RESULT,
                { "1" },
                { text -> text.contains("ma hubtaa") && (text.contains("dhigatid") || text.contains("bangiga")) }
            )
            else -> null
        }
    }

    private fun registerDaraRetry(state: String, reason: String) {
        if (daraRetryState != state) {
            daraRetryState = state
            daraRetries = 0
        }
        daraRetries += 1
        debugLog("Dara retry state=$state attempt=$daraRetries reason=$reason")
        if (daraRetries >= MAX_DARA_RETRIES) {
            setDaraState(DARA_FAILED)
            disarmAutomation()
        }
    }

    private fun tryHandleFinalResult(source: String): Boolean {
        val roots = filterLikelyUssdRoots(buildCandidateRoots(windows.orEmpty(), null, rootInActiveWindow))
        if (roots.isEmpty()) {
            debugLog("Final result waiting for USSD window from $source")
            return false
        }

        val screenText = roots.joinToString(" ") { collectReadableText(it) }.trim()
        val normalized = normalizeFinalResultText(screenText)
        if (!looksLikeFinalResult(normalized)) {
            if (
                System.currentTimeMillis() - finalResultStateChangedAt() > FINAL_RESULT_UNKNOWN_GRACE_MS &&
                hasDismissButton(roots) &&
                isLikelyUssdResultShell(normalized)
            ) {
                debugLog("Unknown final result text=${redactFinalResultForDebug(screenText)}")
                storeFinalResult(screenText, "unknown_result", "unknown", UNKNOWN_USSD_RESULT_REASON, UNKNOWN_USSD_RESULT_REASON)
            } else {
                return false
            }
        } else {
            val status = classifyFinalStatus(normalized)
            val transactionType = classifyFinalTransactionType(normalized)
            val failureReason = if (status == "failed") extractFailureReason(normalized) else ""
            val errorCode = if (status == "failed") extractErrorCode(normalized) else ""
            storeFinalResult(screenText, status, transactionType, failureReason, errorCode)
        }

        if (!allowScreenAction(WAITING_FINAL_RESULT, normalized)) {
            return false
        }
        val clicked = clickResultDismiss(roots)
        debugLog("Final result dismiss clicked=$clicked")
        if (clicked) {
            val state = when (prefs().getString("final_result_status", "").orEmpty()) {
                "completed" -> FINAL_RESULT_SUCCESS
                "failed" -> FINAL_RESULT_ERROR
                else -> FINAL_RESULT_UNKNOWN
            }
            prefs().edit()
                .putString("final_result_state", FINAL_RESULT_DISMISSED)
                .putBoolean("final_result_dismissed", true)
                .apply()
            if (automationMode() == MODE_DARA) {
                setDaraState(if (state == FINAL_RESULT_ERROR) DARA_FAILED else DARA_COMPLETE)
            } else {
                setDirectState(FINAL_RESULT_DISMISSED)
            }
            disarmAutomation()
            debugLog("Automation reset to IDLE after final result")
            return true
        }
        return false
    }

    private fun tryHandleBalanceCheckFlow(source: String) {
        val now = System.currentTimeMillis()
        if (now - daraLastAttemptAt < actionThrottleMs()) {
            return
        }

        val roots = filterLikelyUssdRoots(buildCandidateRoots(windows.orEmpty(), null, rootInActiveWindow))
        if (roots.isEmpty()) {
            debugLog("Balance check waiting for USSD window from $source")
            return
        }

        val state = balanceState()
        if (state == BALANCE_COMPLETE || state == BALANCE_FAILED) {
            disarmAutomation()
            return
        }

        val rawScreenText = roots.joinToString(" ") { collectReadableText(it) }
        val screenText = rawScreenText.lowercase()
        val normalizedScreenText = normalizeFinalResultText(rawScreenText)
        if (
            looksLikeFinalFailureResult(normalizedScreenText) ||
            ((state == BALANCE_WAIT_RESULT || state == BALANCE_RESULT) && looksLikeUnexpectedFinalShell(normalizedScreenText, roots))
        ) {
            if (recoverFromUssdFailure(roots, rawScreenText, "unknown", failureReasonForUnexpected(normalizedScreenText))) {
                setBalanceState(BALANCE_FAILED)
                return
            }
        }
        if (state == BALANCE_WAIT_RESULT || state == BALANCE_RESULT) {
            if (looksLikeTransferSuccessResult(normalizedScreenText)) {
                if (!allowScreenAction(BALANCE_TRIGGER_TRANSFER, normalizedScreenText)) {
                    return
                }
                val transactionType = classifyFinalTransactionType(normalizedScreenText)
                storeFinalResult(rawScreenText, "completed", transactionType, "", "")
                val dismissed = clickResultDismiss(roots)
                debugLog("Transfer success result detected during balance flow and dismiss clicked=$dismissed")
                if (dismissed) {
                    prefs().edit()
                        .putString("final_result_state", FINAL_RESULT_DISMISSED)
                        .putBoolean("final_result_dismissed", true)
                        .apply()
                    setBalanceState(BALANCE_COMPLETE)
                    disarmAutomation()
                    return
                }
                registerBalanceRetry(state, "Transfer success result dismiss failed")
                daraLastAttemptAt = now
                return
            }
            val balance = extractBalanceResult(screenText)
            if (balance != null) {
                if (!allowScreenAction(BALANCE_RESULT_EXTRACTED, normalizedScreenText)) {
                    return
                }
                setBalanceState(BALANCE_RESULT_DETECTED)
                prefs().edit()
                    .putString("balance_result", balance)
                    .putString("balance_result_message", screenText)
                    .apply()
                val dismissed = clickResultDismiss(roots)
                debugLog("Balance result detected and dismiss clicked=$dismissed")
                if (dismissed) {
                    setBalanceState(BALANCE_RESULT_DISMISSED)
                    setBalanceState(BALANCE_COMPLETE)
                    disarmAutomation()
                    return
                }
                registerBalanceRetry(state, "Balance result dismiss failed")
                daraLastAttemptAt = now
                return
            }
            if (now - balanceStateChangedAt() > DARA_TRANSITION_GRACE_MS) {
                registerBalanceRetry(state, "Balance result not detected")
            }
            daraLastAttemptAt = now
            return
        }

        val step = balanceStep(state) ?: run {
            setBalanceState(BALANCE_FAILED)
            disarmAutomation()
            return
        }

        if (!step.matches(screenText)) {
            if (now - balanceStateChangedAt() > DARA_TRANSITION_GRACE_MS) {
                registerBalanceRetry(state, "Expected screen for $state not detected")
            }
            daraLastAttemptAt = now
            return
        }
        if (!allowScreenAction(state, screenText)) {
            return
        }

        val input = findInputField(roots) ?: run {
            registerBalanceRetry(state, "No input field for $state")
            daraLastAttemptAt = now
            return
        }

        val value = step.value()
        if (!fillText(input, value)) {
            registerBalanceRetry(state, "Text entry failed for $state")
            daraLastAttemptAt = now
            return
        }

        daraLastAttemptAt = now
        mainHandler.postDelayed({
            val latestRoots = filterLikelyUssdRoots(buildCandidateRoots(windows.orEmpty(), null, rootInActiveWindow))
            val clicked = clickConfirm(latestRoots)
            debugLog("Balance state=$state send clicked=$clicked")
            if (clicked) {
                daraRetries = 0
                daraRetryState = ""
                setBalanceState(step.nextState)
            } else {
                registerBalanceRetry(state, "Send action failed for $state")
            }
        }, actionDelayMs())
    }

    private fun balanceStep(state: String): DaraStep? {
        return when (state) {
            BALANCE_WAIT_PIN -> DaraStep(
                state,
                BALANCE_MAIN_MENU,
                { securePrefs().getString("pin2", "").orEmpty() },
                { text -> text.contains("zaad") && text.contains("pin") }
            )
            BALANCE_MAIN_MENU -> DaraStep(
                state,
                BALANCE_WAIT_RESULT,
                { "1" },
                { text -> text.contains("adeega sarifka") && text.contains("itus hadhaaga") }
            )
            else -> null
        }
    }

    private fun registerBalanceRetry(state: String, reason: String) {
        if (daraRetryState != state) {
            daraRetryState = state
            daraRetries = 0
        }
        daraRetries += 1
        debugLog("Balance retry state=$state attempt=$daraRetries reason=$reason")
        if (daraRetries >= MAX_DARA_RETRIES) {
            setBalanceState(BALANCE_FAILED)
            disarmAutomation()
        }
    }

    private fun extractBalanceResult(text: String): String? {
        val patterns = listOf(
            Regex("""hadhaageedu\s+waa\s*\$?\s*([0-9]+(?:\.[0-9]+)?)""", RegexOption.IGNORE_CASE),
            Regex("""hadhaagaag(?:a|u)?(?:\s+waa)?\s*[:=]?\s*\$?\s*([0-9]+(?:\.[0-9]+)?)""", RegexOption.IGNORE_CASE)
        )
        for (pattern in patterns) {
            val match = pattern.find(text)
            if (match != null) {
                return match.groupValues[1]
            }
        }
        return null
    }

    private fun looksLikeFinalResult(text: String): Boolean {
        return matchesAny(text, SUCCESS_PATTERNS) ||
            matchesAny(text, BANK_SUCCESS_PATTERNS) ||
            matchesAny(text, ERROR_PATTERNS)
    }

    private fun looksLikeTransferSuccessResult(text: String): Boolean {
        return matchesAny(text, SUCCESS_PATTERNS) || matchesAny(text, BANK_SUCCESS_PATTERNS)
    }

    private fun looksLikeFinalFailureResult(text: String): Boolean {
        return matchesAny(text, ERROR_PATTERNS)
    }

    private fun looksLikeUnexpectedFinalShell(text: String, roots: List<AccessibilityNodeInfo>): Boolean {
        return hasDismissButton(roots) &&
            isLikelyUssdResultShell(text) &&
            !looksLikeFinalResult(text) &&
            !looksLikeBalanceResult(text)
    }

    private fun classifyFinalStatus(text: String): String {
        return when {
            matchesAny(text, ERROR_PATTERNS) -> "failed"
            matchesAny(text, SUCCESS_PATTERNS) || matchesAny(text, BANK_SUCCESS_PATTERNS) -> "completed"
            else -> "unknown_result"
        }
    }

    private fun classifyFinalTransactionType(text: String): String {
        return when {
            matchesAny(text, BANK_SUCCESS_PATTERNS) -> "bank_deposit"
            matchesAny(text, SUCCESS_PATTERNS) -> "direct_transfer"
            automationMode() == MODE_DARA -> "bank_deposit"
            automationMode() == MODE_DIRECT -> "direct_transfer"
            else -> "unknown"
        }
    }

    private fun extractFailureReason(text: String): String {
        return ERROR_KEYWORDS.firstOrNull { keyword -> text.contains(keyword) } ?: UNKNOWN_USSD_RESULT_REASON
    }

    private fun extractErrorCode(text: String): String {
        return when {
            Regex("""invalid\s+pin""").containsMatchIn(text) -> "invalid_pin"
            Regex("""pin\s+incorrect""").containsMatchIn(text) -> "pin_incorrect"
            Regex("""connection\s+problem\s+or\s+invalid\s+mmi\s+code|invalid\s+mmi(?:\s+code)?|mmi\s+code""").containsMatchIn(text) -> "invalid_mmi"
            Regex("""network\s+error""").containsMatchIn(text) -> "network_error"
            Regex("""connection\s+problem""").containsMatchIn(text) -> "connection_problem"
            Regex("""service\s+unavailable""").containsMatchIn(text) -> "service_unavailable"
            Regex("""request\s+timed\s+out|timed\s+out|time\s+out|timeout""").containsMatchIn(text) -> "timeout"
            Regex("""session\s+expired""").containsMatchIn(text) -> "session_expired"
            Regex("""invalid\s+input""").containsMatchIn(text) -> "invalid_input"
            Regex("""invalid\s+menu|please\s+select\s+valid\s+option""").containsMatchIn(text) -> "invalid_menu"
            Regex("""transaction\s+failed""").containsMatchIn(text) -> "transaction_failed"
            Regex("""transfer\s+failed""").containsMatchIn(text) -> "transfer_failed"
            Regex("""hadhaagaagu\s+kuguma\s+filna|lacagta\s+kuguma\s+filna|kuguma\s+filna|kuma\s+filna|insufficient\s+funds|balance\s+insufficient|not\s+enough\s+balance|insufficient""").containsMatchIn(text) -> "insufficient_balance"
            Regex("""failed""").containsMatchIn(text) -> "generic_failed"
            Regex("""error""").containsMatchIn(text) -> "generic_error"
            Regex("""qalad|khalad""").containsMatchIn(text) -> "somali_error"
            Regex("""ma\s+dhicin|lama\s+fulin""").containsMatchIn(text) -> "not_completed"
            Regex("""try\s+again|isku\s+day\s+mar\s+kale""").containsMatchIn(text) -> "try_again"
            else -> UNKNOWN_USSD_RESULT_REASON
        }
    }

    private fun failureReasonForUnexpected(text: String): String {
        return if (looksLikeFinalFailureResult(text)) extractFailureReason(text) else UNKNOWN_USSD_RESULT_REASON
    }

    private fun errorCodeForUnexpected(text: String): String {
        return if (looksLikeFinalFailureResult(text)) extractErrorCode(text) else UNKNOWN_USSD_RESULT_REASON
    }

    private fun looksLikeBalanceResult(text: String): Boolean {
        return text.contains("hadhaageedu waa") && (text.contains("xisaabtaada") || text.contains("adeega sarifka"))
    }

    private fun recoverFromUssdFailure(
        roots: List<AccessibilityNodeInfo>,
        screenText: String,
        transactionType: String,
        failureReason: String
    ): Boolean {
        val normalized = normalizeFinalResultText(screenText)
        storeFinalResult(screenText, "failed", transactionType, failureReason, errorCodeForUnexpected(normalized))
        if (!allowScreenAction(RECOVERY_RESET, normalized)) {
            return false
        }
        val clicked = clickResultDismiss(roots)
        debugLog("USSD error recovery reason=$failureReason dismiss clicked=$clicked")
        if (clicked) {
            prefs().edit()
                .putString("final_result_state", RESULT_DISMISSED)
                .putBoolean("final_result_dismissed", true)
                .apply()
            disarmAutomation()
            debugLog("Automation state reset to IDLE after USSD error")
            return true
        }
        return false
    }

    private fun normalizeFinalResultText(text: String): String {
        return text
            .lowercase()
            .replace('\u2010', '-')
            .replace('\u2011', '-')
            .replace('\u2012', '-')
            .replace('\u2013', '-')
            .replace('\u2014', '-')
            .replace(Regex("""[\r\n\t]+"""), " ")
            .replace(Regex("""\s{2,}"""), " ")
            .trim()
    }

    private fun isLikelyUssdResultShell(text: String): Boolean {
        return text.contains("adeega sarifka") ||
            text.contains("zaad") ||
            text.contains("tar:") ||
            text.contains("$") ||
            text.contains("account")
    }

    private fun matchesAny(text: String, patterns: Set<Regex>): Boolean {
        return patterns.any { pattern -> pattern.containsMatchIn(text) }
    }

    private fun redactFinalResultForDebug(text: String): String {
        return text
            .replace(Regex("""\b\d{10,15}\b""")) { match ->
                val digits = match.value
                "${digits.take(5)}****${digits.takeLast(3)}"
            }
            .replace(Regex("""\b\d{6,}\b"""), "REF****")
            .replace(Regex("""(?i)\b(pin|pin1|pin2|password|token)\b\s*[:=]?\s*[\w.-]+""")) { match ->
                match.value.replace(Regex("""[:=]?\s*[\w.-]+$"""), ": ****")
            }
    }

    private fun extractFirstAmount(text: String): String {
        val dollarAmount = Regex("""\$\s*([0-9]+(?:\.[0-9]+)?)""").find(text)?.groupValues?.getOrNull(1)
        if (!dollarAmount.isNullOrBlank()) {
            return dollarAmount
        }
        return Regex("""\b([0-9]+(?:\.[0-9]+)?)\b""").find(text)?.groupValues?.getOrNull(1).orEmpty()
    }

    private fun extractReceiverPhone(text: String): String {
        return Regex("""\((\d{7,15})\)""").find(text)?.groupValues?.getOrNull(1).orEmpty()
    }

    private fun extractReceiverName(text: String): String {
        val match = Regex("""u\s+dirtay\s+(.+?)\(\d{7,15}\)""", RegexOption.IGNORE_CASE).find(text)
        return match?.groupValues?.getOrNull(1)?.trim().orEmpty()
    }

    private fun extractBankAccount(text: String): String {
        return Regex("""bank\s+account-kaaga\s*:?\s*([0-9xX*]+)""", RegexOption.IGNORE_CASE)
            .find(text)
            ?.groupValues
            ?.getOrNull(1)
            .orEmpty()
    }

    private fun stripTransferBalanceFragments(text: String): String {
        return text
            .replace(
                Regex("""hadhaagaag(?:a|u)?(?:\s+waa)?\s*[:=]?\s*\$?\s*[0-9]+(?:\.[0-9]+)?\.?""", RegexOption.IGNORE_CASE),
                ""
            )
            .replace(
                Regex("""balance\s*(?:is|=|waa)?\s*\$?\s*[0-9]+(?:\.[0-9]+)?\.?""", RegexOption.IGNORE_CASE),
                ""
            )
            .replace(Regex("""\s{2,}"""), " ")
            .trim()
    }

    private fun storeFinalResult(message: String, status: String, transactionType: String, failureReason: String, errorCode: String) {
        val state = when (status) {
            "completed" -> FINAL_RESULT_SUCCESS
            "failed" -> FINAL_RESULT_ERROR
            "unknown_result" -> FINAL_RESULT_UNKNOWN
            else -> FINAL_RESULT_UNKNOWN
        }
        val classification = when {
            status == "completed" && transactionType == "direct_transfer" -> DIRECT_TRANSFER_SUCCESS
            status == "completed" && transactionType == "bank_deposit" -> BANK_DEPOSIT_SUCCESS
            status == "failed" && transactionType == "bank_deposit" -> BANK_DEPOSIT_FAILED
            status == "failed" -> DIRECT_TRANSFER_FAILED
            status == "unknown_result" -> RESULT_UNEXPECTED
            else -> RESULT_UNEXPECTED
        }
        val storedMessage = if (transactionType == "direct_transfer" || transactionType == "bank_deposit") {
            stripTransferBalanceFragments(message)
        } else {
            message
        }
        prefs().edit()
            .putString("final_result_state", state)
            .putString("final_result_status", status)
            .putString("final_result_classification", classification)
            .putString("final_result_transaction_type", transactionType)
            .putString("final_result_message", storedMessage)
            .putString("final_result_failure_reason", failureReason)
            .putString("final_result_error_code", errorCode)
            .putString("final_result_amount", extractFirstAmount(message))
            .putString("final_result_receiver_name", extractReceiverName(message))
            .putString("final_result_receiver_phone", extractReceiverPhone(message))
            .putString("final_result_bank_account", extractBankAccount(message))
            .putBoolean("final_result_dismissed", false)
            .putLong("final_result_timestamp", System.currentTimeMillis())
            .apply()
    }

    private fun ensurePolling() {
        startPollingLoop()
    }

    private fun startPollingLoop() {
        mainHandler.removeCallbacks(scanRunnable)
        mainHandler.post(scanRunnable)
    }

    private fun isAutomationArmed(): Boolean {
        return prefs().getLong("armed_until", 0L) > System.currentTimeMillis()
    }

    private fun automationMode(): String {
        return prefs().getString("automation_mode", MODE_DIRECT).orEmpty()
    }

    private fun daraState(): String {
        return prefs().getString("dara_state", DARA_WAIT_PIN).orEmpty()
    }

    private fun balanceState(): String {
        return prefs().getString("balance_state", BALANCE_WAIT_PIN).orEmpty()
    }

    private fun finalResultState(): String {
        return prefs().getString("final_result_state", "").orEmpty()
    }

    private fun setFinalResultState(state: String) {
        prefs().edit()
            .putString("final_result_state", state)
            .putLong("final_result_state_changed_at", System.currentTimeMillis())
            .apply()
    }

    private fun finalResultStateChangedAt(): Long {
        return prefs().getLong("final_result_state_changed_at", 0L)
    }

    private fun setDirectState(state: String) {
        prefs().edit()
            .putString("direct_state", state)
            .apply()
    }

    private fun setDaraState(state: String) {
        prefs().edit()
            .putString("dara_state", state)
            .putLong("dara_state_changed_at", System.currentTimeMillis())
            .apply()
    }

    private fun daraStateChangedAt(): Long {
        return prefs().getLong("dara_state_changed_at", 0L)
    }

    private fun setBalanceState(state: String) {
        prefs().edit()
            .putString("balance_state", state)
            .putLong("balance_state_changed_at", System.currentTimeMillis())
            .apply()
    }

    private fun balanceStateChangedAt(): Long {
        return prefs().getLong("balance_state_changed_at", 0L)
    }

    private fun disarmAutomation() {
        resetScreenFingerprint()
        prefs().edit().putLong("armed_until", 0L).apply()
    }

    private fun extendAutomation(durationMs: Long) {
        prefs().edit().putLong("armed_until", System.currentTimeMillis() + durationMs).apply()
    }

    private fun prefs() = getSharedPreferences("sarifpro_accessibility", MODE_PRIVATE)

    private fun automationSpeed(): String {
        return prefs().getString("automation_speed", "FAST").orEmpty()
    }

    private fun isFastMode(): Boolean {
        return automationSpeed() != "SAFE"
    }

    private fun actionThrottleMs(): Long {
        return if (isFastMode()) 120L else 2000L
    }

    private fun actionDelayMs(): Long {
        return if (isFastMode()) 60L else 450L
    }

    private fun pollIntervalMs(): Long {
        return if (isFastMode()) 120L else 300L
    }

    private fun fingerprintWindowMs(): Long {
        return if (isFastMode()) 900L else 2400L
    }

    private fun allowScreenAction(state: String, visibleText: String): Boolean {
        val normalized = normalizeFinalResultText(visibleText)
        val fingerprint = "$state:${normalized.hashCode()}"
        val now = System.currentTimeMillis()
        if (fingerprint == lastScreenFingerprint && now - lastScreenFingerprintAt < fingerprintWindowMs()) {
            debugLog("Duplicate USSD screen action ignored state=$state")
            return false
        }
        lastScreenFingerprint = fingerprint
        lastScreenFingerprintAt = now
        return true
    }

    private fun resetScreenFingerprint() {
        lastScreenFingerprint = ""
        lastScreenFingerprintAt = 0L
    }

    private fun securePrefs(): SharedPreferences =
        EncryptedSharedPreferences.create(
            this,
            "sarifpro_accessibility_secure",
            MasterKey.Builder(this)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

    private fun debugLog(message: String) {
        if (BuildConfig.DEBUG) {
            Log.d(TAG, message)
        }
    }

    private fun filterRelevantRoots(roots: List<AccessibilityNodeInfo>): List<AccessibilityNodeInfo> {
        return roots.filter { root ->
            val packageName = root.packageName?.toString().orEmpty()
            if (!isLikelyUssdPackage(packageName)) {
                return@filter false
            }

            val hasExactInput = findByViewId(root, INPUT_FIELD_VIEW_IDS) != null
            val hasPrompt = containsPrompt(root)
            val hasEditableField = findInputFieldRecursive(root) != null
            hasExactInput || (hasPrompt && hasEditableField)
        }
    }

    private fun filterLikelyUssdRoots(roots: List<AccessibilityNodeInfo>): List<AccessibilityNodeInfo> {
        return roots.filter { root -> isLikelyUssdPackage(root.packageName?.toString().orEmpty()) }
    }

    private fun isLikelyUssdPackage(packageName: String): Boolean {
        val normalized = packageName.lowercase()
        return normalized.contains("phone") ||
            normalized.contains("dialer") ||
            normalized.contains("telecom") ||
            normalized.contains("incallui")
    }

    private fun containsPrompt(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) {
            return false
        }
        if (containsKeyword(readableText(node), PROMPT_KEYWORDS)) {
            return true
        }
        for (index in 0 until node.childCount) {
            if (containsPrompt(node.getChild(index))) {
                return true
            }
        }
        return false
    }

    private fun findInputField(roots: List<AccessibilityNodeInfo>, vararg nodes: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        for (root in roots) {
            val exact = findByViewId(root, INPUT_FIELD_VIEW_IDS)
            if (exact != null) {
                return exact
            }
        }
        for (node in nodes) {
            val exact = findByViewId(node, INPUT_FIELD_VIEW_IDS)
            if (exact != null) {
                return exact
            }
        }
        for (root in roots) {
            val exact = findInputFieldRecursive(root)
            if (exact != null) {
                return exact
            }
        }
        for (node in nodes) {
            val exact = findInputFieldRecursive(node)
            if (exact != null) {
                return exact
            }
        }
        return null
    }

    private fun findInputFieldRecursive(node: AccessibilityNodeInfo?): AccessibilityNodeInfo? {
        if (node == null) {
            return null
        }
        val className = node.className?.toString().orEmpty()
        if (node.isEditable || className.contains("EditText", ignoreCase = true) || node.isPassword) {
            return node
        }
        for (index in 0 until node.childCount) {
            val candidate = findInputFieldRecursive(node.getChild(index))
            if (candidate != null) {
                return candidate
            }
        }
        return null
    }

    private fun fillText(node: AccessibilityNodeInfo?, value: String): Boolean {
        if (node == null || value.isBlank()) {
            return false
        }

        node.performAction(AccessibilityNodeInfo.ACTION_FOCUS)
        val args = Bundle().apply {
            putCharSequence(
                AccessibilityNodeInfo.ACTION_ARGUMENT_SET_TEXT_CHARSEQUENCE,
                value
            )
        }
        return node.performAction(AccessibilityNodeInfo.ACTION_SET_TEXT, args)
    }

    private fun clickConfirm(roots: List<AccessibilityNodeInfo>): Boolean {
        for (root in roots) {
            val exactButton = findByViewId(root, CONFIRM_BUTTON_VIEW_IDS)
            if (exactButton != null && exactButton.isClickable) {
                return exactButton.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
        }

        for (root in roots) {
            if (clickConfirmRecursive(root)) {
                return true
            }
        }
        return false
    }

    private fun hasDismissButton(roots: List<AccessibilityNodeInfo>): Boolean {
        return roots.any { root -> findDismissButton(root, RESULT_OK_KEYWORDS) != null || findDismissButton(root, RESULT_FALLBACK_KEYWORDS) != null }
    }

    private fun clickResultDismiss(roots: List<AccessibilityNodeInfo>): Boolean {
        for (root in roots) {
            val exactButton = findByViewId(root, CONFIRM_BUTTON_VIEW_IDS)
            if (exactButton != null && exactButton.isClickable) {
                return exactButton.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
        }
        for (root in roots) {
            val ok = findDismissButton(root, RESULT_OK_KEYWORDS)
            if (ok != null && ok.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true
            }
        }
        for (root in roots) {
            val fallback = findDismissButton(root, RESULT_FALLBACK_KEYWORDS)
            if (fallback != null && fallback.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true
            }
        }
        return false
    }

    private fun clickSafeIdleDismiss(roots: List<AccessibilityNodeInfo>): Boolean {
        for (root in roots) {
            val exactButton = findByViewId(root, CONFIRM_BUTTON_VIEW_IDS)
            if (exactButton != null && exactButton.isClickable) {
                return exactButton.performAction(AccessibilityNodeInfo.ACTION_CLICK)
            }
        }
        for (root in roots) {
            val ok = findDismissButton(root, RESULT_OK_KEYWORDS)
            if (ok != null && ok.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true
            }
        }
        for (root in roots) {
            val fallback = findDismissButton(root, IDLE_DISMISS_KEYWORDS)
            if (fallback != null && fallback.performAction(AccessibilityNodeInfo.ACTION_CLICK)) {
                return true
            }
        }
        return false
    }

    private fun scheduleDirectConfirmAttempt(packageName: String) {
        mainHandler.postDelayed({
            val latestRoots = filterRelevantRoots(buildCandidateRoots(windows.orEmpty(), null, rootInActiveWindow))
            val clicked = clickConfirm(latestRoots)
            debugLog("PIN2 confirm action result=$clicked package=$packageName attempt=${confirmRetries + 1}")

            if (clicked) {
                setDirectState(WAITING_FINAL_RESULT)
                setFinalResultState(WAITING_FINAL_RESULT)
                extendAutomation(65_000L)
                confirmRetries = 0
                return@postDelayed
            }

            confirmRetries += 1
            if (confirmRetries < 4 && isAutomationArmed()) {
                lastAutomationAt = System.currentTimeMillis() - actionThrottleMs()
                scheduleDirectConfirmAttempt(packageName)
            } else {
                disarmAutomation()
                confirmRetries = 0
            }
        }, actionDelayMs())
    }

    private fun clickConfirmRecursive(node: AccessibilityNodeInfo?): Boolean {
        if (node == null) {
            return false
        }
        val text = readableText(node)
        val className = node.className?.toString().orEmpty()
        val looksLikeButton =
            className.contains("Button", ignoreCase = true) ||
                className.contains("TextView", ignoreCase = true) ||
                className.contains("ImageView", ignoreCase = true)

        if (node.isClickable && looksLikeButton && containsKeyword(text, CONFIRM_KEYWORDS)) {
            return node.performAction(AccessibilityNodeInfo.ACTION_CLICK)
        }

        for (index in 0 until node.childCount) {
            if (clickConfirmRecursive(node.getChild(index))) {
                return true
            }
        }
        return false
    }

    private fun findDismissButton(node: AccessibilityNodeInfo?, keywords: Set<String>): AccessibilityNodeInfo? {
        if (node == null) {
            return null
        }
        val text = readableText(node)
        val className = node.className?.toString().orEmpty()
        val looksLikeButton =
            className.contains("Button", ignoreCase = true) ||
                className.contains("TextView", ignoreCase = true)

        if (node.isClickable && looksLikeButton && containsKeyword(text, keywords)) {
            return node
        }

        for (index in 0 until node.childCount) {
            val candidate = findDismissButton(node.getChild(index), keywords)
            if (candidate != null) {
                return candidate
            }
        }
        return null
    }

    private fun readableText(node: AccessibilityNodeInfo): String {
        return listOf(
            node.text?.toString().orEmpty(),
            node.contentDescription?.toString().orEmpty(),
            node.hintText?.toString().orEmpty(),
            node.viewIdResourceName?.toString().orEmpty(),
        )
            .joinToString(" ")
            .lowercase()
    }

    private fun collectReadableText(node: AccessibilityNodeInfo?): String {
        if (node == null) {
            return ""
        }
        val values = mutableListOf(readableText(node))
        for (index in 0 until node.childCount) {
            values.add(collectReadableText(node.getChild(index)))
        }
        return values.joinToString(" ")
    }

    private fun containsKeyword(value: String, keywords: Set<String>): Boolean {
        return keywords.any { keyword -> value.contains(keyword) }
    }

    private fun buildCandidateRoots(
        serviceWindows: List<AccessibilityWindowInfo>,
        eventSource: AccessibilityNodeInfo?,
        activeRoot: AccessibilityNodeInfo?
    ): List<AccessibilityNodeInfo> {
        val roots = mutableListOf<AccessibilityNodeInfo>()
        serviceWindows
            .sortedByDescending { window ->
                when {
                    window.isFocused -> 3
                    window.isActive -> 2
                    else -> 1
                }
            }
            .forEach { window ->
                val root = window.root ?: return@forEach
                roots.add(root)
            }
        if (eventSource != null) {
            roots.add(eventSource)
        }
        if (activeRoot != null) {
            roots.add(activeRoot)
        }
        return roots
    }

    private fun visibleUssdRoots(): List<AccessibilityNodeInfo> {
        return filterLikelyUssdRoots(buildCandidateRoots(windows.orEmpty(), null, rootInActiveWindow))
    }

    private fun isVisibleUssdWindowPresent(): Boolean {
        return visibleUssdRoots().isNotEmpty()
    }

    private fun dismissVisibleUssdWindowSafely(): Boolean {
        val roots = visibleUssdRoots()
        if (roots.isEmpty()) {
            return false
        }
        if (clickSafeIdleDismiss(roots)) {
            return true
        }
        return performGlobalAction(GLOBAL_ACTION_BACK)
    }

    private fun eventTypeName(eventType: Int): String {
        return when (eventType) {
            AccessibilityEvent.TYPE_VIEW_CLICKED -> "TYPE_VIEW_CLICKED"
            AccessibilityEvent.TYPE_VIEW_FOCUSED -> "TYPE_VIEW_FOCUSED"
            AccessibilityEvent.TYPE_VIEW_TEXT_CHANGED -> "TYPE_VIEW_TEXT_CHANGED"
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> "TYPE_WINDOW_STATE_CHANGED"
            AccessibilityEvent.TYPE_WINDOW_CONTENT_CHANGED -> "TYPE_WINDOW_CONTENT_CHANGED"
            else -> eventType.toString()
        }
    }

    private fun findByViewId(node: AccessibilityNodeInfo?, viewIds: Set<String>): AccessibilityNodeInfo? {
        if (node == null) {
            return null
        }
        for (viewId in viewIds) {
            val matches = node.findAccessibilityNodeInfosByViewId(viewId)
            if (!matches.isNullOrEmpty()) {
                return matches.firstOrNull()
            }
        }
        return null
    }

    private data class DaraStep(
        val state: String,
        val nextState: String,
        val value: () -> String,
        val matches: (String) -> Boolean
    )

    companion object {
        private const val TAG = "SarifAccessibility"
        private const val MODE_DIRECT = "DIRECT_TRANSFER"
        private const val MODE_DARA = "DARA_SALAAM_BANK"
        private const val MODE_BALANCE_CHECK = "PERIODIC_BALANCE_CHECKER"
        private const val IDLE = "IDLE"
        private const val DIRECT_WAIT_PIN = "DIRECT_WAIT_PIN"
        private const val DIRECT_TRANSFER_RUNNING = "DIRECT_TRANSFER_RUNNING"
        private const val DIRECT_TRANSFER_SUCCESS = "DIRECT_TRANSFER_SUCCESS"
        private const val DIRECT_TRANSFER_FAILED = "DIRECT_TRANSFER_FAILED"
        private const val DARA_WAIT_PIN = "DARA_WAIT_PIN"
        private const val DARA_MAIN_MENU = "DARA_MAIN_MENU"
        private const val DARA_BANK_MENU = "DARA_BANK_MENU"
        private const val DARA_AMOUNT = "DARA_AMOUNT"
        private const val DARA_INFO = "DARA_INFO"
        private const val DARA_BANK_PIN = "DARA_BANK_PIN"
        private const val DARA_CONFIRM = "DARA_CONFIRM"
        private const val DARA_COMPLETE = "DARA_COMPLETE"
        private const val DARA_FAILED = "DARA_FAILED"
        private const val BANK_DEPOSIT_RUNNING = "BANK_DEPOSIT_RUNNING"
        private const val BANK_DEPOSIT_SUCCESS = "BANK_DEPOSIT_SUCCESS"
        private const val BANK_DEPOSIT_FAILED = "BANK_DEPOSIT_FAILED"
        private const val BALANCE_CHECK_START = "BALANCE_CHECK_START"
        private const val BALANCE_CONTINUOUS_MODE_ACTIVE = "BALANCE_CONTINUOUS_MODE_ACTIVE"
        private const val BALANCE_CYCLE_RUNNING = "BALANCE_CYCLE_RUNNING"
        private const val BALANCE_WAIT_PIN = "BALANCE_WAIT_PIN"
        private const val BALANCE_MAIN_MENU = "BALANCE_MAIN_MENU"
        private const val BALANCE_WAIT_RESULT = "BALANCE_WAIT_RESULT"
        private const val BALANCE_RESULT = "BALANCE_RESULT"
        private const val BALANCE_RESULT_EXTRACTED = "BALANCE_RESULT_EXTRACTED"
        private const val BALANCE_RESULT_DETECTED = "BALANCE_RESULT_DETECTED"
        private const val BALANCE_RESULT_DISMISSED = "BALANCE_RESULT_DISMISSED"
        private const val BALANCE_TRIGGER_TRANSFER = "BALANCE_TRIGGER_TRANSFER"
        private const val BALANCE_WAITING_FOR_IDLE = "BALANCE_WAITING_FOR_IDLE"
        private const val BALANCE_RESTART_IMMEDIATELY = "BALANCE_RESTART_IMMEDIATELY"
        private const val BALANCE_COMPLETE = "BALANCE_COMPLETE"
        private const val BALANCE_FAILED = "BALANCE_FAILED"
        private const val WAITING_RESULT = "WAITING_RESULT"
        private const val RESULT_SUCCESS = "RESULT_SUCCESS"
        private const val RESULT_FAILED = "RESULT_FAILED"
        private const val RESULT_UNEXPECTED = "RESULT_UNEXPECTED"
        private const val RESULT_DISMISSED = "RESULT_DISMISSED"
        private const val RECOVERY_RESET = "RECOVERY_RESET"
        private const val WAITING_FINAL_RESULT = "WAITING_FINAL_RESULT"
        private const val FINAL_RESULT_SUCCESS = "FINAL_RESULT_SUCCESS"
        private const val FINAL_RESULT_ERROR = "FINAL_RESULT_ERROR"
        private const val FINAL_RESULT_UNKNOWN = "FINAL_RESULT_UNKNOWN"
        private const val FINAL_RESULT_DISMISSED = "FINAL_RESULT_DISMISSED"
        private const val MAX_DARA_RETRIES = 3
        private const val DARA_TRANSITION_GRACE_MS = 12_000L
        private const val FINAL_RESULT_UNKNOWN_GRACE_MS = 12_000L
        private const val UNKNOWN_USSD_RESULT_REASON = "unknown_or_unexpected_ussd_result"
        @Volatile
        private var instance: SarifAccessibilityService? = null

        fun notifyAutomationArmed() {
            instance?.resetScreenFingerprint()
            instance?.ensurePolling()
        }

        fun isUssdWindowVisible(): Boolean {
            return instance?.isVisibleUssdWindowPresent() ?: false
        }

        fun dismissVisibleUssdWindow(): Boolean {
            return instance?.dismissVisibleUssdWindowSafely() ?: false
        }

        private val INPUT_FIELD_VIEW_IDS = setOf(
            "com.android.phone:id/input_field"
        )
        private val CONFIRM_BUTTON_VIEW_IDS = setOf(
            "android:id/button1"
        )
        private val PROMPT_KEYWORDS = setOf(
            "pin",
            "pin2",
            "password",
            "secret",
            "geli",
            "sir",
        )
        private val CONFIRM_KEYWORDS = setOf(
            "send",
            "ok",
            "confirm",
            "next",
            "continue",
            "submit",
            "dir",
            "u dir",
            "hagaag",
            "yes",
        )
        private val RESULT_OK_KEYWORDS = setOf(
            "ok",
            "hagaag",
        )
        private val RESULT_FALLBACK_KEYWORDS = setOf(
            "send",
            "cancel",
            "close",
            "xir",
        )
        private val IDLE_DISMISS_KEYWORDS = setOf(
            "cancel",
            "close",
            "xir",
            "maya",
            "kabax",
        )
        private val SUCCESS_KEYWORDS = setOf(
            "ayaad u dirtay",
            "waad dirtay",
            "waa la diray",
            "lacagta waa la diray",
            "transfer completed",
            "transaction completed",
            "successfully sent",
            "successful",
            "completed",
        )
        private val BANK_SUCCESS_KEYWORDS = setOf(
            "ayaad ku shubtay bank account-kaaga",
            "ayaad ku shubtey bank account-kaaga",
            "waxaad ku shubtay bank account-kaaga",
            "waxaad ku shubtey bank account-kaaga",
            "ku shubtay bank account-kaaga",
            "ku shubtey bank account-kaaga",
        )
        private val ERROR_KEYWORDS = setOf(
            "invalid pin",
            "pin incorrect",
            "network error",
            "connection problem",
            "connection problem or invalid mmi code",
            "service unavailable",
            "timeout",
            "time out",
            "timed out",
            "request timed out",
            "try again",
            "session expired",
            "invalid input",
            "invalid menu",
            "please select valid option",
            "invalid mmi",
            "invalid mmi code",
            "mmi code",
            "transaction failed",
            "transfer failed",
            "failed",
            "error",
            "qalad",
            "khalad",
            "ma dhicin",
            "lama fulin",
            "insufficient",
            "insufficient funds",
            "balance insufficient",
            "not enough balance",
            "hadhaagaagu kuguma filna",
            "lacagta kuguma filna",
            "kuguma filna",
            "kuma filna",
            "isku day mar kale",
        )
        private val SUCCESS_PATTERNS = setOf(
            Regex("""ayaad\s+u\s+dirtay"""),
            Regex("""waad\s+dirtay"""),
            Regex("""waa\s+la\s+diray"""),
            Regex("""lacagta\s+waa\s+la\s+diray"""),
            Regex("""transfer\s+completed"""),
            Regex("""transaction\s+completed"""),
            Regex("""successfully\s+sent"""),
            Regex("""successful"""),
            Regex("""completed"""),
        )
        private val BANK_SUCCESS_PATTERNS = setOf(
            Regex("""ayaad\s+ku\s+shubt[ae]y\s+bank\s+account[-\s]?kaaga"""),
            Regex("""waxaad\s+\$?\s*[0-9]+(?:\.[0-9]+)?\s+ku\s+shubt[ae]y\s+bank\s+account[-\s]?kaaga"""),
            Regex("""ku\s+shubt[ae]y\s+bank\s+account[-\s]?kaaga"""),
        )
        private val ERROR_PATTERNS = setOf(
            Regex("""invalid\s+pin"""),
            Regex("""pin\s+incorrect"""),
            Regex("""network\s+error"""),
            Regex("""connection\s+problem"""),
            Regex("""connection\s+problem\s+or\s+invalid\s+mmi\s+code"""),
            Regex("""service\s+unavailable"""),
            Regex("""request\s+timed\s+out|timed\s+out|time\s+out|timeout"""),
            Regex("""try\s+again"""),
            Regex("""session\s+expired"""),
            Regex("""invalid\s+input"""),
            Regex("""invalid\s+menu"""),
            Regex("""please\s+select\s+valid\s+option"""),
            Regex("""invalid\s+mmi(?:\s+code)?"""),
            Regex("""mmi\s+code"""),
            Regex("""transaction\s+failed"""),
            Regex("""transfer\s+failed"""),
            Regex("""failed"""),
            Regex("""error"""),
            Regex("""qalad"""),
            Regex("""khalad"""),
            Regex("""ma\s+dhicin"""),
            Regex("""lama\s+fulin"""),
            Regex("""hadhaagaagu\s+kuguma\s+filna|lacagta\s+kuguma\s+filna|kuguma\s+filna|kuma\s+filna|insufficient\s+funds|balance\s+insufficient|not\s+enough\s+balance|insufficient"""),
            Regex("""isku\s+day\s+mar\s+kale"""),
        )
    }
}
