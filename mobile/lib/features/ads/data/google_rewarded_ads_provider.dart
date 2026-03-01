import 'dart:async';

import 'package:google_mobile_ads/google_mobile_ads.dart';

import '../../../core/config/app_config.dart';
import '../domain/rewarded_ads_provider.dart';

class GoogleRewardedAdsProvider implements RewardedAdsProvider {
  GoogleRewardedAdsProvider({String? adUnitId})
      : _adUnitId = adUnitId ?? AppConfig.rewardedAdUnitId;

  final String _adUnitId;

  @override
  Future<RewardedAdResult> showRewardedAd() {
    if (_adUnitId.isEmpty) {
      return Future<RewardedAdResult>.error(
        Exception('Rewarded ad unit ID is not configured'),
      );
    }

    final Completer<RewardedAdResult> completer = Completer<RewardedAdResult>();

    RewardedAd.load(
      adUnitId: _adUnitId,
      request: const AdRequest(),
      rewardedAdLoadCallback: RewardedAdLoadCallback(
        onAdLoaded: (RewardedAd ad) {
          bool rewardGranted = false;
          int rewardAmount = 0;
          String? impressionId;

          ad.fullScreenContentCallback = FullScreenContentCallback(
            onAdImpression: (Ad adInstance) {
              impressionId = adInstance.responseInfo?.responseId;
            },
            onAdDismissedFullScreenContent: (Ad adInstance) {
              adInstance.dispose();
              if (!completer.isCompleted) {
                completer.complete(
                  RewardedAdResult(
                    completed: rewardGranted,
                    adNetworkRewardAmount: rewardAmount,
                    impressionId: impressionId,
                  ),
                );
              }
            },
            onAdFailedToShowFullScreenContent: (Ad adInstance, AdError error) {
              adInstance.dispose();
              if (!completer.isCompleted) {
                completer.completeError(
                  Exception('Failed to show rewarded ad: ${error.message}'),
                );
              }
            },
          );

          ad.show(
            onUserEarnedReward: (_ad, RewardItem reward) {
              rewardGranted = true;
              rewardAmount = reward.amount.round();
            },
          );
        },
        onAdFailedToLoad: (LoadAdError error) {
          if (!completer.isCompleted) {
            completer.completeError(
              Exception('Failed to load rewarded ad: ${error.message}'),
            );
          }
        },
      ),
    );

    return completer.future.timeout(
      const Duration(minutes: 2),
      onTimeout: () {
        throw Exception('Rewarded ad timeout');
      },
    );
  }
}
