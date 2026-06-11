package com.sarifpro.nativebridge

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class SarifSmsModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        SarifSmsEventBridge.register(reactContext)
    }

    override fun getName(): String = "SarifSmsModule"

    @ReactMethod
    fun getPendingMessages(promise: Promise) {
        try {
            val items = SmsQueueStore.drain(reactContext.applicationContext)
            val array = Arguments.createArray()
            for (index in 0 until items.length()) {
                val item = items.getJSONObject(index)
                val map = Arguments.createMap().apply {
                    putString("sender", item.optString("sender"))
                    putString("body", item.optString("body"))
                    putDouble("timestamp", item.optLong("timestamp").toDouble())
                }
                array.pushMap(map)
            }
            promise.resolve(array)
        } catch (error: Exception) {
            promise.reject("SMS_QUEUE_ERROR", error)
        }
    }

    @ReactMethod
    fun addListener(eventName: String) {
        // Required by NativeEventEmitter on Android.
    }

    @ReactMethod
    fun removeListeners(count: Int) {
        // Required by NativeEventEmitter on Android.
    }
}
