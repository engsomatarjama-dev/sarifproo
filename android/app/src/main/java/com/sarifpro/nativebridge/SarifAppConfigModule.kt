package com.sarifpro.nativebridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.sarifpro.BuildConfig

class SarifAppConfigModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SarifAppConfigModule"

    @ReactMethod
    fun getConfig(promise: Promise) {
        try {
            val config = Arguments.createMap().apply {
                putString("supabaseUrl", BuildConfig.SUPABASE_URL)
                putString("supabasePublishableKey", BuildConfig.SUPABASE_PUBLISHABLE_KEY)
                putString("authRedirectBaseUrl", BuildConfig.AUTH_REDIRECT_BASE_URL)
                putBoolean("supabaseUseAnonymousAuth", BuildConfig.SUPABASE_USE_ANONYMOUS_AUTH)
                putString("appVersion", BuildConfig.VERSION_NAME)
            }
            promise.resolve(config)
        } catch (error: Exception) {
            promise.reject("APP_CONFIG_ERROR", error)
        }
    }
}
