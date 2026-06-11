package com.sarifpro.nativebridge

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import org.json.JSONArray
import org.json.JSONObject

object SmsQueueStore {
    private const val PREFS = "sarifpro_sms_queue"
    private const val KEY_QUEUE = "pending_messages"

    @Synchronized
    fun enqueue(context: Context, payload: JSONObject) {
        val prefs = securePrefs(context)
        val queue = JSONArray(prefs.getString(KEY_QUEUE, "[]"))
        queue.put(payload)
        prefs.edit().putString(KEY_QUEUE, queue.toString()).apply()
    }

    @Synchronized
    fun drain(context: Context): JSONArray {
        val prefs = securePrefs(context)
        val queue = JSONArray(prefs.getString(KEY_QUEUE, "[]"))
        prefs.edit().putString(KEY_QUEUE, "[]").apply()
        return queue
    }

    private fun securePrefs(context: Context): SharedPreferences =
        EncryptedSharedPreferences.create(
            context,
            PREFS,
            MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
}
