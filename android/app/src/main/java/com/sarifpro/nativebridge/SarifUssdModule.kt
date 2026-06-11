package com.sarifpro.nativebridge

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SarifUssdModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SarifUssdModule"

    @ReactMethod
    fun dialUssd(ussd: String, promise: Promise) {
        try {
            val permissionGranted = ContextCompat.checkSelfPermission(
                reactContext,
                Manifest.permission.CALL_PHONE
            ) == PackageManager.PERMISSION_GRANTED

            if (!permissionGranted) {
                promise.reject("CALL_PERMISSION_DENIED", "CALL_PHONE permission not granted")
                return
            }

            val encoded = Uri.encode(ussd)
            val intent = Intent(Intent.ACTION_CALL).apply {
                data = Uri.parse("tel:$encoded")
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            reactContext.startActivity(intent)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("USSD_DIAL_ERROR", error)
        }
    }
}
