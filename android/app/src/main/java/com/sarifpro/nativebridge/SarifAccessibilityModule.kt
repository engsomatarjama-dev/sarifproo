package com.sarifpro.nativebridge

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import android.provider.Settings
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.sarifpro.accessibility.SarifAccessibilityService

class SarifAccessibilityModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SarifAccessibilityModule"

    @ReactMethod
    fun updatePin2(pin2: String, promise: Promise) {
        securePrefs()
            .edit()
            .putString("pin2", pin2)
            .apply()
        reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .edit()
            .remove("pin2")
            .apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun updateBankPin(bankPin: String, promise: Promise) {
        securePrefs()
            .edit()
            .putString("bank_pin", bankPin)
            .apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun setAutomationSpeed(speed: String, promise: Promise) {
        val safeSpeed = if (speed.equals("SAFE", ignoreCase = true)) "SAFE" else "FAST"
        reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .edit()
            .putString("automation_speed", safeSpeed)
            .apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun armPinAutomation(durationMs: Double?, promise: Promise) {
        val now = System.currentTimeMillis()
        val safeDuration = durationMs?.toLong()?.coerceIn(3_000L, 60_000L) ?: 20_000L
        reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .edit()
            .putString("automation_mode", "DIRECT_TRANSFER")
            .putString("direct_state", "DIRECT_WAIT_PIN")
            .putString("final_result_state", "")
            .putString("final_result_status", "")
            .putString("final_result_classification", "")
            .putString("final_result_transaction_type", "")
            .putString("final_result_message", "")
            .putString("final_result_failure_reason", "")
            .putString("final_result_error_code", "")
            .putString("final_result_amount", "")
            .putString("final_result_receiver_name", "")
            .putString("final_result_receiver_phone", "")
            .putString("final_result_bank_account", "")
            .putBoolean("final_result_dismissed", false)
            .putLong("final_result_timestamp", 0L)
            .putLong("armed_until", now + safeDuration)
            .apply()
        SarifAccessibilityService.notifyAutomationArmed()
        promise.resolve(null)
    }

    @ReactMethod
    fun armDaraSalaamAutomation(amount: String, durationMs: Double?, promise: Promise) {
        val now = System.currentTimeMillis()
        val safeDuration = durationMs?.toLong()?.coerceIn(30_000L, 120_000L) ?: 90_000L
        reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .edit()
            .putString("automation_mode", "DARA_SALAAM_BANK")
            .putString("dara_state", "DARA_WAIT_PIN")
            .putString("dara_amount", amount)
            .putString("final_result_state", "")
            .putString("final_result_status", "")
            .putString("final_result_classification", "")
            .putString("final_result_transaction_type", "")
            .putString("final_result_message", "")
            .putString("final_result_failure_reason", "")
            .putString("final_result_error_code", "")
            .putString("final_result_amount", "")
            .putString("final_result_receiver_name", "")
            .putString("final_result_receiver_phone", "")
            .putString("final_result_bank_account", "")
            .putBoolean("final_result_dismissed", false)
            .putLong("final_result_timestamp", 0L)
            .putLong("dara_state_changed_at", now)
            .putLong("armed_until", now + safeDuration)
            .apply()
        SarifAccessibilityService.notifyAutomationArmed()
        promise.resolve(null)
    }

    @ReactMethod
    fun armBalanceCheckAutomation(durationMs: Double?, promise: Promise) {
        val now = System.currentTimeMillis()
        val safeDuration = durationMs?.toLong()?.coerceIn(20_000L, 90_000L) ?: 60_000L
        reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .edit()
            .putString("automation_mode", "PERIODIC_BALANCE_CHECKER")
            .putString("balance_state", "BALANCE_WAIT_PIN")
            .putString("balance_result", "")
            .putString("balance_result_message", "")
            .putString("final_result_state", "")
            .putString("final_result_status", "")
            .putString("final_result_classification", "")
            .putString("final_result_transaction_type", "")
            .putString("final_result_message", "")
            .putString("final_result_failure_reason", "")
            .putString("final_result_error_code", "")
            .putString("final_result_amount", "")
            .putString("final_result_receiver_name", "")
            .putString("final_result_receiver_phone", "")
            .putString("final_result_bank_account", "")
            .putBoolean("final_result_dismissed", false)
            .putLong("final_result_timestamp", 0L)
            .putLong("balance_state_changed_at", now)
            .putLong("armed_until", now + safeDuration)
            .apply()
        SarifAccessibilityService.notifyAutomationArmed()
        promise.resolve(null)
    }

    @ReactMethod
    fun resetAutomation(promise: Promise) {
        reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .edit()
            .putString("automation_mode", "")
            .putString("direct_state", "IDLE")
            .putString("dara_state", "IDLE")
            .putString("balance_state", "IDLE")
            .putString("final_result_state", "")
            .putString("final_result_status", "")
            .putString("final_result_classification", "")
            .putString("final_result_transaction_type", "")
            .putString("final_result_message", "")
            .putString("final_result_failure_reason", "")
            .putString("final_result_error_code", "")
            .putString("balance_result", "")
            .putString("balance_result_message", "")
            .putLong("armed_until", 0L)
            .apply()
        promise.resolve(null)
    }

    @ReactMethod
    fun getDaraSalaamAutomationState(promise: Promise) {
        val state = reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .getString("dara_state", "")
            .orEmpty()
        promise.resolve(state)
    }

    @ReactMethod
    fun getBalanceCheckAutomationState(promise: Promise) {
        val state = reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .getString("balance_state", "")
            .orEmpty()
        promise.resolve(state)
    }

    @ReactMethod
    fun getBalanceCheckResult(promise: Promise) {
        val result = reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .getString("balance_result", "")
            .orEmpty()
        promise.resolve(result)
    }

    @ReactMethod
    fun getBalanceCheckResultMessage(promise: Promise) {
        val result = reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .getString("balance_result_message", "")
            .orEmpty()
        promise.resolve(result)
    }

    @ReactMethod
    fun getFinalUssdResult(promise: Promise) {
        val prefs = reactContext.getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
        val map = Arguments.createMap()
        map.putString("state", prefs.getString("final_result_state", "").orEmpty())
        map.putString("status", prefs.getString("final_result_status", "").orEmpty())
        map.putString("classification", prefs.getString("final_result_classification", "").orEmpty())
        map.putString("transactionType", prefs.getString("final_result_transaction_type", "").orEmpty())
        map.putString("message", prefs.getString("final_result_message", "").orEmpty())
        map.putString("failureReason", prefs.getString("final_result_failure_reason", "").orEmpty())
        map.putString("errorCode", prefs.getString("final_result_error_code", "").orEmpty())
        map.putDouble("amount", prefs.getString("final_result_amount", "")?.toDoubleOrNull() ?: 0.0)
        map.putString("receiverName", prefs.getString("final_result_receiver_name", "").orEmpty())
        map.putString("receiverPhone", prefs.getString("final_result_receiver_phone", "").orEmpty())
        map.putString("bankAccount", prefs.getString("final_result_bank_account", "").orEmpty())
        map.putBoolean("dismissed", prefs.getBoolean("final_result_dismissed", false))
        map.putDouble("timestamp", prefs.getLong("final_result_timestamp", 0L).toDouble())
        promise.resolve(map)
    }

    @ReactMethod
    fun isAutomationActive(promise: Promise) {
        val active = reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .getLong("armed_until", 0L) > System.currentTimeMillis()
        promise.resolve(active)
    }

    @ReactMethod
    fun isUssdWindowVisible(promise: Promise) {
        promise.resolve(SarifAccessibilityService.isUssdWindowVisible())
    }

    @ReactMethod
    fun dismissVisibleUssdWindow(promise: Promise) {
        promise.resolve(SarifAccessibilityService.dismissVisibleUssdWindow())
    }

    @ReactMethod
    fun getAutomationHealth(promise: Promise) {
        val health = SarifAccessibilityService.automationHealth()
        val map = Arguments.createMap()
        map.putBoolean("connected", health["connected"] as? Boolean ?: false)
        map.putBoolean("active", health["active"] as? Boolean ?: false)
        map.putString("mode", health["mode"] as? String ?: "")
        map.putDouble("lastAccessibilityEventAt", ((health["lastAccessibilityEventAt"] as? Long) ?: 0L).toDouble())
        map.putDouble("lastScreenProcessedAt", ((health["lastScreenProcessedAt"] as? Long) ?: 0L).toDouble())
        promise.resolve(map)
    }

    @ReactMethod
    fun extendAutomation(durationMs: Double?, promise: Promise) {
        val safeDuration = durationMs?.toLong()?.coerceIn(5_000L, 45_000L) ?: 30_000L
        reactContext
            .getSharedPreferences("sarifpro_accessibility", Context.MODE_PRIVATE)
            .edit()
            .putLong("armed_until", System.currentTimeMillis() + safeDuration)
            .apply()
        SarifAccessibilityService.notifyAutomationArmed()
        promise.resolve(null)
    }

    private fun securePrefs() =
        EncryptedSharedPreferences.create(
            reactContext,
            "sarifpro_accessibility_secure",
            MasterKey.Builder(reactContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )

    @ReactMethod
    fun isEnabled(promise: Promise) {
        try {
            val enabledServices = Settings.Secure.getString(
                reactContext.contentResolver,
                Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
            ) ?: ""
            promise.resolve(enabledServices.contains("${reactContext.packageName}/com.sarifpro.accessibility.SarifAccessibilityService"))
        } catch (error: Exception) {
            promise.reject("ACCESSIBILITY_ERROR", error)
        }
    }
}
