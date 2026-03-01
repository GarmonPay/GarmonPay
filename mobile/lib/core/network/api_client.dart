import 'package:dio/dio.dart';

import '../config/app_config.dart';
import '../models/auth_session.dart';
import '../models/reward_credit_result.dart';
import '../models/transaction_record.dart';
import '../models/user_profile.dart';
import '../models/wallet_summary.dart';
import '../models/withdrawal_record.dart';

class ApiException implements Exception {
  ApiException(this.message);
  final String message;

  @override
  String toString() => message;
}

class ApiClient {
  ApiClient()
      : _dio = Dio(
          BaseOptions(
            baseUrl: AppConfig.apiBaseUrl,
            connectTimeout: const Duration(seconds: 15),
            receiveTimeout: const Duration(seconds: 20),
            headers: <String, String>{
              'Content-Type': 'application/json',
            },
          ),
        );

  final Dio _dio;
  String? _accessToken;

  void setAccessToken(String? token) {
    _accessToken = token;
  }

  Future<Map<String, dynamic>> _request(
    String method,
    String path, {
    Map<String, dynamic>? data,
    Map<String, dynamic>? queryParameters,
  }) async {
    try {
      final Response<dynamic> response = await _dio.request<dynamic>(
        path,
        data: data,
        queryParameters: queryParameters,
        options: Options(
          method: method,
          headers: _accessToken == null
              ? null
              : <String, String>{
                  'Authorization': 'Bearer $_accessToken',
                },
        ),
      );

      final dynamic payload = response.data;
      if (payload is Map<String, dynamic>) {
        return payload;
      }
      return <String, dynamic>{};
    } on DioException catch (error) {
      final dynamic responseData = error.response?.data;
      if (responseData is Map<String, dynamic>) {
        final dynamic message = responseData['message'];
        if (message is String && message.isNotEmpty) {
          throw ApiException(message);
        }
      }
      throw ApiException(error.message ?? 'Network request failed');
    }
  }

  Future<AuthSession> register({
    required String email,
    required String password,
  }) async {
    final Map<String, dynamic> data = await _request(
      'POST',
      '/auth/register',
      data: <String, dynamic>{
        'email': email,
        'password': password,
      },
    );
    return _parseAuthSession(data);
  }

  Future<AuthSession> login({
    required String email,
    required String password,
  }) async {
    final Map<String, dynamic> data = await _request(
      'POST',
      '/auth/login',
      data: <String, dynamic>{
        'email': email,
        'password': password,
      },
    );
    return _parseAuthSession(data);
  }

  Future<UserProfile> getProfile() async {
    final Map<String, dynamic> data = await _request('GET', '/user/profile');
    return UserProfile.fromJson(data);
  }

  Future<WalletSummary> getWallet() async {
    final Map<String, dynamic> data = await _request('GET', '/wallet');
    return WalletSummary.fromJson(data);
  }

  Future<List<TransactionRecord>> getTransactions() async {
    final Map<String, dynamic> data = await _request('GET', '/transactions');
    final dynamic raw = data['transactions'];
    if (raw is! List) return <TransactionRecord>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(TransactionRecord.fromJson)
        .toList(growable: false);
  }

  Future<List<WithdrawalRecord>> getWithdrawals() async {
    final Map<String, dynamic> data = await _request('GET', '/withdrawals');
    final dynamic raw = data['withdrawals'];
    if (raw is! List) return <WithdrawalRecord>[];
    return raw
        .whereType<Map<String, dynamic>>()
        .map(WithdrawalRecord.fromJson)
        .toList(growable: false);
  }

  Future<WithdrawalRecord> requestWithdrawal({
    required int amount,
    required String paymentMethod,
    required String paymentAccount,
  }) async {
    final Map<String, dynamic> data = await _request(
      'POST',
      '/withdrawals/request',
      data: <String, dynamic>{
        'amount': amount,
        'paymentMethod': paymentMethod,
        'metadata': <String, dynamic>{
          'account': paymentAccount,
        },
      },
    );
    final dynamic withdrawalMap = data['withdrawal'];
    if (withdrawalMap is! Map<String, dynamic>) {
      throw ApiException('Withdrawal response is invalid');
    }
    return WithdrawalRecord.fromJson(withdrawalMap);
  }

  Future<RewardCreditResult> creditReward({
    required String userId,
    required int amount,
    required String eventType,
    String? idempotencyKey,
    Map<String, dynamic>? metadata,
  }) async {
    final Map<String, dynamic> data = await _request(
      'POST',
      '/rewards/credit',
      data: <String, dynamic>{
        'userId': userId,
        'amount': amount,
        'eventType': eventType,
        if (idempotencyKey != null && idempotencyKey.isNotEmpty) 'idempotencyKey': idempotencyKey,
        if (metadata != null) 'metadata': metadata,
      },
    );
    return RewardCreditResult.fromJson(data);
  }

  Future<void> trackAnalyticsEvent({
    String? userId,
    required String eventType,
    required String source,
    Map<String, dynamic>? payload,
  }) async {
    await _request(
      'POST',
      '/analytics/event',
      data: <String, dynamic>{
        if (userId != null && userId.isNotEmpty) 'userId': userId,
        'eventType': eventType,
        'source': source,
        if (payload != null) 'payload': payload,
      },
    );
  }

  AuthSession _parseAuthSession(Map<String, dynamic> data) {
    final dynamic user = data['user'];
    if (user is! Map<String, dynamic>) {
      throw ApiException('Auth response is invalid');
    }
    final AuthSession session = AuthSession(
      userId: (user['id'] as String?) ?? '',
      email: (user['email'] as String?) ?? '',
      accessToken: (data['accessToken'] as String?) ?? '',
      refreshToken: (data['refreshToken'] as String?) ?? '',
      expiresAt: DateTime.tryParse((data['expiresAt'] as String?) ?? ''),
    );
    if (session.accessToken.isEmpty) {
      throw ApiException('Missing access token');
    }
    return session;
  }
}
