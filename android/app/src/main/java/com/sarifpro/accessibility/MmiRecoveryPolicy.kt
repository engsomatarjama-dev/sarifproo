package com.sarifpro.accessibility

/**
 * Pure, side-effect-free decision logic for the narrow terminal MMI/network
 * error recovery path. Deliberately kept free of any Android framework
 * dependency (no AccessibilityNodeInfo, no SharedPreferences) so it can be
 * unit tested with plain JUnit -- the previous MMI investigation showed that
 * mocking the native Accessibility bridge in Jest gave false confidence
 * about behavior that only a real AccessibilityService can exercise. Moving
 * what actually can be tested without the Android framework into its own
 * pure functions, and testing it directly, is a small step against that gap
 * without claiming these tests prove the full on-device behavior.
 */
object MmiRecoveryPolicy {
    /**
     * A bare "isAutomationArmed() is false" is not proof a USSD interaction
     * has ended -- only proof the short (20-90s) arm window has expired.
     * This narrow recovery path is allowed to act only when BOTH:
     *   1. `automationMode` is non-blank -- some flow was armed and has not
     *      yet reached one of the existing disarm points (success, a
     *      recognized failure, or retry exhaustion). disarmAutomation()
     *      clears this on every one of those genuine completion paths, so a
     *      non-blank mode reflects an actually-unresolved flow, not stale
     *      leftover state from a session that already concluded.
     *   2. `armedUntil` is in the past (the normal arm window has expired)
     *      but not too far in the past -- bounded by `windowMs` so a
     *      long-abandoned or crashed session (or, in non-continuous balance
     *      check mode, the idle gap between scheduled cycles) can never be
     *      mistaken for an active one and used to justify clicking an
     *      unrelated dialog.
     */
    fun isWithinOwnershipWindow(automationMode: String, armedUntil: Long, nowMs: Long, windowMs: Long = OWNED_SESSION_RECOVERY_WINDOW_MS): Boolean {
        if (automationMode.isBlank()) {
            return false
        }
        if (armedUntil <= 0L) {
            return false
        }
        val ageSinceArmExpired = nowMs - armedUntil
        return ageSinceArmExpired in 0..windowMs
    }

    /**
     * Deliberately narrow: only the exact confirmed physical text and the
     * existing, already-shipped MMI/network error-code patterns this app's
     * own extractErrorCode() already classifies as invalid_mmi,
     * network_error, or connection_problem. Excludes every other existing
     * ERROR_PATTERNS entry (invalid PIN, insufficient balance, timeout,
     * session expired, generic "failed"/"error", ...) on purpose -- those
     * are different failure classes that could plausibly appear in dialogs
     * unrelated to this specific MMI/network condition, and this path must
     * never become a generic dialog clicker.
     */
    fun looksLikeOwnedMmiNetworkError(normalizedText: String): Boolean {
        return MMI_NETWORK_PATTERN.containsMatchIn(normalizedText)
    }

    const val OWNED_SESSION_RECOVERY_WINDOW_MS = 5 * 60 * 1000L

    private val MMI_NETWORK_PATTERN = Regex(
        """connection\s+problem\s+or\s+invalid\s+mmi\s+code|invalid\s+mmi(?:\s+code)?|mmi\s+code|connection\s+problem|network\s+error"""
    )
}
