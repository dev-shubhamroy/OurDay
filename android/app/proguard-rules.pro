# kotlinx.serialization / Supabase DTOs
-keepattributes *Annotation*, InnerClasses
-dontwarn kotlinx.serialization.**
-keep,includedescriptorclasses class com.ourday.**$$serializer { *; }
-keepclassmembers class com.ourday.** { *** Companion; }
-keepclasseswithmembers class com.ourday.** { kotlinx.serialization.KSerializer serializer(...); }
-dontwarn org.slf4j.**
