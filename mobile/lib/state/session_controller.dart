import 'package:flutter/foundation.dart';

import '../core/models/auth_session.dart';
import '../core/models/transaction_record.dart';
import '../core/models/user_profile.dart';
import '../core/models/wallet_summary.dart';
import '../core/models/withdrawal_record.dart';
import '../core/network/api_client.dart';
import '../core/storage/secure_storage_service.dart';
import '../features/analytics/data/analytics_repository.dart';
import '../features/auth/data/auth_repository.dart';
import '../features/user/data/user_repository.dart';
import '../features/wallet/data/wallet_repository.dart';

class SessionController extends ChangeNotifier {
  SessionController({
    required ApiClient apiClient,
    required AuthRepository authRepository,
    required UserRepository userRepository,
    required WalletRepository walletRepository,
    required AnalyticsRepository analyticsRepository,
    required SecureStorageService secureStorageService,
  })  : _apiClient = apiClient,
        _authRepository = authRepository,
        _userRepository = userRepository,
        _walletRepository = walletRepository,
        _analyticsRepository = analyticsRepository,
        _secureStorageService = secureStorageService;

  final ApiClient _apiClient;
  final AuthRepository _authRepository;
  final UserRepository _userRepository;
  final WalletRepository _walletRepository;
  final AnalyticsRepository _analyticsRepository;
  final SecureStorageService _secureStorageService;

  bool _initializing = true;
  bool _busy = false;
  String? _errorMessage;
  AuthSession? _session;
  UserProfile? _profile;
  WalletSummary? _wallet;
  List<TransactionRecord> _transactions = <TransactionRecord>[];
  List<WithdrawalRecord> _withdrawals = <WithdrawalRecord>[];

  bool get initializing => _initializing;
  bool get busy => _busy;
  String? get errorMessage => _errorMessage;
  AuthSession? get session => _session;
  UserProfile? get profile => _profile;
  WalletSummary? get wallet => _wallet;
  List<TransactionRecord> get transactions => _transactions;
  List<WithdrawalRecord> get withdrawals => _withdrawals;
  bool get isAuthenticated => _session != null;

  Future<void> bootstrap() async {
    _initializing = true;
    notifyListeners();

    final AuthSession? persisted = await _secureStorageService.readSession();
    if (persisted == null || persisted.accessToken.isEmpty) {
      _initializing = false;
      notifyListeners();
      return;
    }

    _session = persisted;
    _apiClient.setAccessToken(persisted.accessToken);
    try {
      await refreshData();
    } catch (_) {
      await logout();
    } finally {
      _initializing = false;
      notifyListeners();
    }
  }

  Future<void> register({
    required String email,
    required String password,
  }) async {
    await _authenticate(
      action: () => _authRepository.register(email: email, password: password),
      analyticsSource: 'mobile_register',
    );
  }

  Future<void> login({
    required String email,
    required String password,
  }) async {
    await _authenticate(
      action: () => _authRepository.login(email: email, password: password),
      analyticsSource: 'mobile_login',
    );
  }

  Future<void> _authenticate({
    required Future<AuthSession> Function() action,
    required String analyticsSource,
  }) async {
    _setBusy(true);
    _clearError();
    try {
      final AuthSession newSession = await action();
      _session = newSession;
      _apiClient.setAccessToken(newSession.accessToken);
      await _secureStorageService.saveSession(newSession);
      await _analyticsRepository.trackEvent(
        userId: newSession.userId,
        eventType: 'login',
        source: analyticsSource,
      );
      await refreshData();
    } catch (error) {
      _errorMessage = error.toString();
      rethrow;
    } finally {
      _setBusy(false);
    }
  }

  Future<void> refreshData() async {
    final AuthSession? activeSession = _session;
    if (activeSession == null) return;

    _clearError();
    final List<dynamic> results = await Future.wait<dynamic>(<Future<dynamic>>[
      _userRepository.getProfile(),
      _walletRepository.getWallet(),
      _walletRepository.getTransactions(),
      _walletRepository.getWithdrawals(),
    ]);

    _profile = results[0] as UserProfile;
    _wallet = results[1] as WalletSummary;
    _transactions = (results[2] as List<TransactionRecord>);
    _withdrawals = (results[3] as List<WithdrawalRecord>);
    notifyListeners();
  }

  Future<void> submitWithdrawal({
    required int amount,
    required String paymentMethod,
    required String paymentAccount,
  }) async {
    final AuthSession? activeSession = _session;
    if (activeSession == null) {
      throw Exception('Not authenticated');
    }

    _setBusy(true);
    _clearError();
    try {
      await _walletRepository.requestWithdrawal(
        amount: amount,
        paymentMethod: paymentMethod,
        paymentAccount: paymentAccount,
      );
      await _analyticsRepository.trackEvent(
        userId: activeSession.userId,
        eventType: 'withdrawal_requested',
        source: 'mobile_withdrawal_screen',
        payload: <String, dynamic>{
          'amount': amount,
          'paymentMethod': paymentMethod,
        },
      );
      await refreshData();
    } catch (error) {
      _errorMessage = error.toString();
      rethrow;
    } finally {
      _setBusy(false);
    }
  }

  Future<void> logout() async {
    _session = null;
    _profile = null;
    _wallet = null;
    _transactions = <TransactionRecord>[];
    _withdrawals = <WithdrawalRecord>[];
    _apiClient.setAccessToken(null);
    await _secureStorageService.clearSession();
    notifyListeners();
  }

  void _setBusy(bool value) {
    _busy = value;
    notifyListeners();
  }

  void _clearError() {
    _errorMessage = null;
  }
}
