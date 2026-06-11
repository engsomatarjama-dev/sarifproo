package com.sarifpro.sms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Telephony
import android.util.Log
import com.facebook.react.HeadlessJsTaskService
import com.sarifpro.nativebridge.SarifSmsEventBridge
import com.sarifpro.nativebridge.SmsQueueStore
import org.json.JSONObject

class IncomingSmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
        if (messages.isEmpty()) {
            return
        }

        val firstMessage = messages.first()
        val combinedBody = buildString {
            messages.forEach { smsPart ->
                append(smsPart.messageBody.orEmpty())
            }
        }
        val sender = firstMessage.originatingAddress?.trim().orEmpty()
        if (!isSupportedMessage(sender, combinedBody)) {
            return
        }

        val payload = JSONObject().apply {
            put("sender", sender)
            put("body", combinedBody)
            put("timestamp", firstMessage.timestampMillis)
        }
        SmsQueueStore.enqueue(context, payload)
        SarifSmsEventBridge.emit(payload)

        try {
            val serviceIntent = Intent(context, SarifSmsHeadlessService::class.java).apply {
                putExtra(SarifSmsHeadlessService.EXTRA_PAYLOAD, payload.toString())
            }
            context.startService(serviceIntent)
            HeadlessJsTaskService.acquireWakeLockNow(context)
        } catch (error: Exception) {
            Log.e("SarifSmsReceiver", "Unable to start headless SMS processing", error)
        }
    }

    private fun isSupportedMessage(sender: String, body: String): Boolean {
        val normalizedSenderDigits = sender.filter { it.isDigit() }
        if (sender.trim() == "898" || normalizedSenderDigits == "898" || normalizedSenderDigits.endsWith("898")) {
            return true
        }

        val normalizedBody = body.lowercase()
        return normalizedBody.contains("ka heshay") ||
            normalizedBody.contains("u sariftay") ||
            normalizedBody.contains("you have exchanged")
    }
}
