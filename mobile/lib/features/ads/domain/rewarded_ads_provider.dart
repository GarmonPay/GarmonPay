class RewardedAdResult {
  const RewardedAdResult({
    required this.completed,
    required this.adNetworkRewardAmount,
    this.impressionId,
  });

  final bool completed;
  final int adNetworkRewardAmount;
  final String? impressionId;
}

abstract class RewardedAdsProvider {
  Future<RewardedAdResult> showRewardedAd();
}
