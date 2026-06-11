package com.sarifpro

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeHost
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.load
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.facebook.react.defaults.DefaultReactNativeHost
import com.facebook.react.soloader.OpenSourceMergedSoMapping
import com.facebook.soloader.SoLoader
import com.sarifpro.nativebridge.SarifNativePackage
import kotlin.jvm.functions.Function0

class MainApplication : Application(), ReactApplication {

    override val reactNativeHost: ReactNativeHost =
        object : DefaultReactNativeHost(this) {
            override fun getPackages() =
                PackageList(this).packages.apply {
                    add(SarifNativePackage())
                }

            override fun getJSMainModuleName(): String = "index"

            override fun getUseDeveloperSupport(): Boolean = BuildConfig.DEBUG

            override val isNewArchEnabled: Boolean = BuildConfig.IS_NEW_ARCHITECTURE_ENABLED
            override val isHermesEnabled: Boolean = BuildConfig.IS_HERMES_ENABLED
        }

    override val reactHost: ReactHost
        get() = getDefaultReactHost(applicationContext, reactNativeHost)

    override fun onCreate() {
        super.onCreate()
        forceLocalFeatureFlagsAccessor()
        SoLoader.init(this, OpenSourceMergedSoMapping)
        if (BuildConfig.IS_NEW_ARCHITECTURE_ENABLED) {
            load()
        }
    }

    private fun forceLocalFeatureFlagsAccessor() {
        try {
            val flagsClass = Class.forName("com.facebook.react.internal.featureflags.ReactNativeFeatureFlags")
            val localAccessorClass = Class.forName("com.facebook.react.internal.featureflags.ReactNativeFeatureFlagsLocalAccessor")
            val instance = flagsClass.getField("INSTANCE").get(null)
            val providerField = flagsClass.getDeclaredField("accessorProvider")
            val accessorField = flagsClass.getDeclaredField("accessor")

            providerField.isAccessible = true
            accessorField.isAccessible = true

            val provider = object : Function0<Any> {
                override fun invoke(): Any = localAccessorClass.getDeclaredConstructor().newInstance()
            }

            providerField.set(instance, provider)
            accessorField.set(instance, localAccessorClass.getDeclaredConstructor().newInstance())
        } catch (_: Throwable) {
            // Fall through and let React Native use its default accessor when reflection changes.
        }
    }
}
