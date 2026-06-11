package com.sarifpro.nativebridge

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class SarifNativePackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            SarifAppConfigModule(reactContext),
            SarifSmsModule(reactContext),
            SarifUssdModule(reactContext),
            SarifAccessibilityModule(reactContext),
            SarifNotificationModule(reactContext),
            SarifSecurityModule(reactContext)
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> = emptyList()
}
