package com.sarifpro.nativebridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import org.json.JSONObject

object SarifSmsEventBridge {
    private var reactContext: ReactApplicationContext? = null

    fun register(reactApplicationContext: ReactApplicationContext) {
        reactContext = reactApplicationContext
    }

    fun emit(payload: JSONObject) {
        val context = reactContext ?: return
        if (!context.hasActiveCatalystInstance()) {
            return
        }
        val map = Arguments.createMap().apply {
            putString("sender", payload.optString("sender"))
            putString("body", payload.optString("body"))
            putDouble("timestamp", payload.optLong("timestamp").toDouble())
        }
        context
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit("SarifSmsReceived", map)
    }
}
