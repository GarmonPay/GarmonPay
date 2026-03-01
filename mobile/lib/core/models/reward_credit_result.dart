class RewardCreditResult {
  const RewardCreditResult({
    required this.rewardEventId,
    required this.transactionId,
    required this.balance,
    required this.rewardsEarned,
  });

  final String rewardEventId;
  final String transactionId;
  final int balance;
  final int rewardsEarned;

  factory RewardCreditResult.fromJson(Map<String, dynamic> json) {
    return RewardCreditResult(
      rewardEventId: (json['rewardEventId'] as String?) ?? '',
      transactionId: (json['transactionId'] as String?) ?? '',
      balance: (json['balance'] as num?)?.round() ?? 0,
      rewardsEarned: (json['rewardsEarned'] as num?)?.round() ?? 0,
    );
  }
}
