package com.sarifpro.sms

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig
import org.json.JSONObject

class SarifSmsHeadlessService : HeadlessJsTaskService() {
    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val payload = intent?.getStringExtra(EXTRA_PAYLOAD) ?: return null
        val json = JSONObject(payload)
        val data = Arguments.createMap().apply {
            putString("sender", json.optString("sender"))
            putString("body", json.optString("body"))
            putDouble("timestamp", json.optLong("timestamp").toDouble())
        }

        return HeadlessJsTaskConfig(
            "SarifSmsHeadlessTask",
            data,
            45_000,
            true,
        )
    }

    companion object {
        const val EXTRA_PAYLOAD = "com.sarifpro.sms.EXTRA_PAYLOAD"
    }
}
