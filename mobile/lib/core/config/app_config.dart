import 'dart:io';

class AppConfig {
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000/api',
  );

  static const String androidRewardedAdUnitId = String.fromEnvironment(
    'ANDROID_REWARDED_AD_UNIT_ID',
    defaultValue: '',
  );

  static const String iosRewardedAdUnitId = String.fromEnvironment(
    'IOS_REWARDED_AD_UNIT_ID',
    defaultValue: '',
  );

  static String get rewardedAdUnitId {
    if (Platform.isIOS) {
      return iosRewardedAdUnitId;
    }
    return androidRewardedAdUnitId;
  }
}
