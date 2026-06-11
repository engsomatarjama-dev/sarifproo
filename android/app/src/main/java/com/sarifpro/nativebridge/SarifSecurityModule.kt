package com.sarifpro.nativebridge

import android.provider.Settings
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import java.security.MessageDigest

class SarifSecurityModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SarifSecurityModule"

    @ReactMethod
    fun getAndroidId(promise: Promise) {
        try {
            val androidId = Settings.Secure.getString(
                reactContext.contentResolver,
                Settings.Secure.ANDROID_ID
            ) ?: ""
            promise.resolve(androidId)
        } catch (error: Exception) {
            promise.reject("ANDROID_ID_ERROR", error)
        }
    }

    @ReactMethod
    fun sha256(value: String, promise: Promise) {
        try {
            val digest = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
            val hash = digest.joinToString("") { "%02x".format(it) }
            promise.resolve(hash)
        } catch (error: Exception) {
            promise.reject("SHA256_ERROR", error)
        }
    }
}
