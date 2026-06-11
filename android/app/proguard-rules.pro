# Keep Android entry points and React Native bridge methods stable while still
# allowing R8 to shrink and obfuscate ordinary implementation classes.
-keep class com.sarifpro.MainActivity { *; }
-keep class com.sarifpro.MainApplication { *; }
-keep class com.sarifpro.accessibility.SarifAccessibilityService { *; }
-keep class com.sarifpro.sms.IncomingSmsReceiver { *; }
-keep class com.sarifpro.sms.SarifSmsHeadlessService { *; }
-keep class * extends com.facebook.react.bridge.ReactContextBaseJavaModule { *; }
-keepclassmembers class * {
  @com.facebook.react.bridge.ReactMethod <methods>;
}
