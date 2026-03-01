# GarmonPay Mobile (Flutter)

Flutter mobile client for iOS and Android, backed by the Express API in `/backend`.

## Implemented features

- Register / login / logout
- User profile screen
- Bottom tab navigation: Home, Earn, Wallet, Profile
- Wallet summary: balance, rewards earned, withdrawals
- Transaction and withdrawal history views
- Withdrawal request flow (`POST /api/withdrawals/request`)
- Rewarded ads provider abstraction in `lib/features/ads/`
- Reward credit flow (`POST /api/rewards/credit`)
- Analytics event submission (`POST /api/analytics/event`)

## Runtime configuration

Use `--dart-define` at build/run time:

- `API_BASE_URL` (for example `https://api.garmonpay.com/api`)
- `ANDROID_REWARDED_AD_UNIT_ID`
- `IOS_REWARDED_AD_UNIT_ID`

Example:

```bash
flutter run \
  --dart-define=API_BASE_URL=https://api.garmonpay.com/api \
  --dart-define=ANDROID_REWARDED_AD_UNIT_ID=ca-app-pub-xxxx/yyyy \
  --dart-define=IOS_REWARDED_AD_UNIT_ID=ca-app-pub-xxxx/zzzz
```

## Build

```bash
flutter build apk --release --dart-define=API_BASE_URL=https://api.garmonpay.com/api
flutter build ios --release --dart-define=API_BASE_URL=https://api.garmonpay.com/api
```
