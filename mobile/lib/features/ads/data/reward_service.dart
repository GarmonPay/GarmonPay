import '../../analytics/data/analytics_repository.dart';
import '../../wallet/data/wallet_repository.dart';
import '../domain/rewarded_ads_provider.dart';

class RewardService {
  RewardService({
    required RewardedAdsProvider adsProvider,
    required WalletRepository walletRepository,
    required AnalyticsRepository analyticsRepository,
  })  : _adsProvider = adsProvider,
        _walletRepository = walletRepository,
        _analyticsRepository = analyticsRepository;

  final RewardedAdsProvider _adsProvider;
  final WalletRepository _walletRepository;
  final AnalyticsRepository _analyticsRepository;

  Future<void> watchAdAndClaimReward({
    required String userId,
    required int amount,
    required String eventType,
  }) async {
    final RewardedAdResult adResult = await _adsProvider.showRewardedAd();
    if (!adResult.completed) {
      throw Exception('Reward was not granted by ad network');
    }

    final String idempotencyKey =
        '${adResult.impressionId ?? 'ad'}-$userId-${DateTime.now().millisecondsSinceEpoch}';

    await _analyticsRepository.trackEvent(
      userId: userId,
      eventType: 'ad_view',
      source: 'mobile_ads',
      payload: <String, dynamic>{
        'impressionId': adResult.impressionId,
      },
    );

    await _walletRepository.creditReward(
      userId: userId,
      amount: amount,
      eventType: eventType,
      idempotencyKey: idempotencyKey,
      metadata: <String, dynamic>{
        'adNetworkRewardAmount': adResult.adNetworkRewardAmount,
        'impressionId': adResult.impressionId,
      },
    );
  }
}
