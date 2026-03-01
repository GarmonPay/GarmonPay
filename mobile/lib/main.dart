import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import 'core/api_client.dart';
import 'core/auth_service.dart';
import 'screens/main_shell.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/register_screen.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Supabase.initialize(
    url: const String.fromEnvironment('SUPABASE_URL', defaultValue: ''),
    anonKey: const String.fromEnvironment('SUPABASE_ANON_KEY', defaultValue: ''),
  );
  runApp(const GarmonPayApp());
}

class GarmonPayApp extends StatelessWidget {
  const GarmonPayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MultiProvider(
      providers: [
        ChangeNotifierProvider(create: (_) => AuthService()),
        Provider(create: (_) => ApiClient()),
      ],
      child: MaterialApp(
        title: 'GarmonPay',
        theme: ThemeData(
          colorScheme: ColorScheme.fromSeed(seedColor: Colors.blue, brightness: Brightness.dark),
          useMaterial3: true,
        ),
        home: const AuthGate(),
      ),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return Consumer<AuthService>(
      builder: (_, auth, __) {
        if (auth.isLoading) {
          return const Scaffold(body: Center(child: CircularProgressIndicator()));
        }
        if (auth.isLoggedIn) {
          return const MainShell();
        }
        return const LoginScreen();
      },
    );
  }
}
