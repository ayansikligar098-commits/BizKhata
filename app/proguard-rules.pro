# BizKhata — ProGuard / R8 rules.
#
# Added in the 2026-11-27 handover: app/build.gradle.kts references this
# file in the release build type, but it did not exist in the project.
# Minification is currently OFF (isMinifyEnabled = false), so these rules
# are not applied today; they exist so a future release with minify
# enabled does not break. Room, Navigation and DataStore ship their own
# consumer rules inside their libraries, so no extra -keep lines are
# needed for them.
#
# Keep the data layer intact if minification is ever turned on:
-keep class com.alfalah.business.data.entity.** { *; }
-keep class com.alfalah.business.domain.** { *; }
