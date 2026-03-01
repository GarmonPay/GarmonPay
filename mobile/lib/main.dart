import 'package:flutter/material.dart';
import 'package:google_mobile_ads/google_mobile_ads.dart';
import 'package:provider/provider.dart';

import 'app.dart';
import 'core/network/api_client.dart';
import 'core/storage/secure_storage_service.dart';
import 'features/ads/data/google_rewarded_ads_provider.dart';
import 'features/ads/data/reward_service.dart';
import 'features/analytics/data/analytics_repository.dart';
import 'features/auth/data/auth_repository.dart';
import 'features/user/data/user_repository.dart';
import 'features/wallet/data/wallet_repository.dart';
import 'state/session_controller.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await MobileAds.instance.initialize();

  final ApiClient apiClient = ApiClient();
  final SecureStorageService secureStorageService = SecureStorageService();
  final AuthRepository authRepository = AuthRepository(apiClient);
  final UserRepository userRepository = UserRepository(apiClient);
  final WalletRepository walletRepository = WalletRepository(apiClient);
  final AnalyticsRepository analyticsRepository = AnalyticsRepository(apiClient);
  final RewardService rewardService = RewardService(
    adsProvider: GoogleRewardedAdsProvider(),
    walletRepository: walletRepository,
    analyticsRepository: analyticsRepository,
  );

  runApp(
    MultiProvider(
      providers: [
        Provider<ApiClient>.value(value: apiClient),
        Provider<SecureStorageService>.value(value: secureStorageService),
        Provider<AuthRepository>.value(value: authRepository),
        Provider<UserRepository>.value(value: userRepository),
        Provider<WalletRepository>.value(value: walletRepository),
        Provider<AnalyticsRepository>.value(value: analyticsRepository),
        Provider<RewardService>.value(value: rewardService),
        ChangeNotifierProvider<SessionController>(
          create: (_) => SessionController(
            apiClient: apiClient,
            authRepository: authRepository,
            userRepository: userRepository,
            walletRepository: walletRepository,
            analyticsRepository: analyticsRepository,
            secureStorageService: secureStorageService,
          )..bootstrap(),
        ),
      ],
      child: const GarmonPayApp(),
    ),
  );
}
