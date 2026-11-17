# Retrofit & OkHttp
-keepattributes Signature,InnerClasses,EnclosingMethod
-keepattributes RuntimeVisibleAnnotations,RuntimeVisibleParameterAnnotations
-keepclassmembers,allowshrinking,allowobfuscation interface * {
    @retrofit2.http.* <methods>;
}
-dontwarn org.codehaus.mojo.animal_sniffer.IgnoreJRERequirement
-dontwarn javax.annotation.**
-dontwarn okhttp3.**

# Moshi Codegen & Kotlin Reflect Fallback
-keepclassmembers class * {
    @com.squareup.moshi.Json <fields>;
}
-keep @com.squareup.moshi.JsonClass class * { *; }
-keep class com.example.data.remote.** { *; }
-keepclassmembers class com.example.data.remote.** { *; }
-keepclassmembers class com.example.core.security.SessionTokens { *; }
