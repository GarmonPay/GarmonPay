import 'wallet_summary.dart';

class UserProfile {
  const UserProfile({
    required this.id,
    required this.email,
    required this.role,
    required this.isSuperAdmin,
    required this.createdAt,
    required this.wallet,
  });

  final String id;
  final String email;
  final String role;
  final bool isSuperAdmin;
  final DateTime createdAt;
  final WalletSummary wallet;

  factory UserProfile.fromJson(Map<String, dynamic> json) {
    final dynamic walletMap = json['wallet'];
    return UserProfile(
      id: (json['id'] as String?) ?? '',
      email: (json['email'] as String?) ?? '',
      role: (json['role'] as String?) ?? 'user',
      isSuperAdmin: (json['isSuperAdmin'] as bool?) ?? false,
      createdAt: DateTime.tryParse((json['createdAt'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
      wallet: walletMap is Map<String, dynamic>
          ? WalletSummary.fromJson(walletMap)
          : WalletSummary(
              userId: '',
              balance: 0,
              rewardsEarned: 0,
              totalWithdrawn: 0,
              pendingWithdrawals: 0,
              updatedAt: DateTime.fromMillisecondsSinceEpoch(0),
            ),
    );
  }
}
