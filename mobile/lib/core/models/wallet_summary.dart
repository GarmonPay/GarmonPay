class WalletSummary {
  const WalletSummary({
    required this.userId,
    required this.balance,
    required this.rewardsEarned,
    required this.totalWithdrawn,
    required this.pendingWithdrawals,
    required this.updatedAt,
  });

  final String userId;
  final int balance;
  final int rewardsEarned;
  final int totalWithdrawn;
  final int pendingWithdrawals;
  final DateTime updatedAt;

  factory WalletSummary.fromJson(Map<String, dynamic> json) {
    return WalletSummary(
      userId: (json['userId'] as String?) ?? '',
      balance: (json['balance'] as num?)?.round() ?? 0,
      rewardsEarned: (json['rewardsEarned'] as num?)?.round() ?? 0,
      totalWithdrawn: (json['totalWithdrawn'] as num?)?.round() ?? 0,
      pendingWithdrawals: (json['pendingWithdrawals'] as num?)?.round() ?? 0,
      updatedAt:
          DateTime.tryParse((json['updatedAt'] as String?) ?? '') ?? DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}
