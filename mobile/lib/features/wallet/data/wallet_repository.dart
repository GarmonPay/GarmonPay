import '../../../core/models/reward_credit_result.dart';
import '../../../core/models/transaction_record.dart';
import '../../../core/models/wallet_summary.dart';
import '../../../core/models/withdrawal_record.dart';
import '../../../core/network/api_client.dart';

class WalletRepository {
  WalletRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<WalletSummary> getWallet() => _apiClient.getWallet();

  Future<List<TransactionRecord>> getTransactions() => _apiClient.getTransactions();

  Future<List<WithdrawalRecord>> getWithdrawals() => _apiClient.getWithdrawals();

  Future<WithdrawalRecord> requestWithdrawal({
    required int amount,
    required String paymentMethod,
    required String paymentAccount,
  }) {
    return _apiClient.requestWithdrawal(
      amount: amount,
      paymentMethod: paymentMethod,
      paymentAccount: paymentAccount,
    );
  }

  Future<RewardCreditResult> creditReward({
    required String userId,
    required int amount,
    required String eventType,
    String? idempotencyKey,
    Map<String, dynamic>? metadata,
  }) {
    return _apiClient.creditReward(
      userId: userId,
      amount: amount,
      eventType: eventType,
      idempotencyKey: idempotencyKey,
      metadata: metadata,
    );
  }
}
