package com.sarifpro.nativebridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.sarifpro.R

class SarifNotificationModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "SarifNotificationModule"

    private fun ensureChannel(channelId: String, channelName: String) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            val channel = NotificationChannel(channelId, channelName, NotificationManager.IMPORTANCE_DEFAULT)
            manager.createNotificationChannel(channel)
        }
    }

    @ReactMethod
    fun showNotification(title: String, message: String, channel: String?, promise: Promise) {
        try {
            val channelId = if (channel.isNullOrBlank()) "sarifpro_general" else channel
            ensureChannel(channelId, "SarifPro Alerts")
            val notification = NotificationCompat.Builder(reactContext, channelId)
                .setSmallIcon(R.mipmap.ic_launcher)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(NotificationCompat.BigTextStyle().bigText(message))
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .build()

            NotificationManagerCompat.from(reactContext).notify((System.currentTimeMillis() % 100000).toInt(), notification)
            promise.resolve(null)
        } catch (error: Exception) {
            promise.reject("NOTIFICATION_ERROR", error)
        }
    }
}
