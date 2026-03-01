# GarmonPay Mobile (Flutter)

iOS and Android app: auth, wallet, earn (rewards/ads), withdrawals.

## Prerequisites

- Flutter SDK (3.2+)
- Backend running (see `/backend/README.md`)

## Setup

```bash
cd mobile
flutter pub get
```

Configure Supabase (for auth) and API base URL:

- **Supabase**: Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in your environment or via `--dart-define` when running.
- **API**: Set `ApiClient.baseUrl` in code or pass base URL (e.g. `https://your-api.com`) before calling APIs.

Example run:

```bash
flutter run --dart-define=SUPABASE_URL=https://xxx.supabase.co --dart-define=SUPABASE_ANON_KEY=your-anon-key
```

Update `lib/main.dart` to read from environment:

```dart
// In main():
await Supabase.initialize(
  url: const String.fromEnvironment('SUPABASE_URL', defaultValue: 'YOUR_URL'),
  anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: 'YOUR_KEY'),
);
// Before run: ApiClient.baseUrl = 'https://your-backend.com';
```

## Tabs

- **Home** — balance summary
- **Earn** — watch ads / earn rewards (demo credit button)
- **Wallet** — balance, transaction history, withdraw button
- **Profile** — email, balance, logout

## Build

```bash
flutter build apk
flutter build ios
```
