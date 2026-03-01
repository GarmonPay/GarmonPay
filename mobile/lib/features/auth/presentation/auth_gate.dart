import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../navigation/presentation/main_tabs_screen.dart';
import '../../../state/session_controller.dart';
import 'login_screen.dart';
import 'register_screen.dart';

class AuthGate extends StatefulWidget {
  const AuthGate({super.key});

  @override
  State<AuthGate> createState() => _AuthGateState();
}

class _AuthGateState extends State<AuthGate> {
  bool _showLogin = true;

  @override
  Widget build(BuildContext context) {
    final SessionController session = context.watch<SessionController>();

    if (session.initializing) {
      return const Scaffold(
        body: Center(
          child: CircularProgressIndicator(),
        ),
      );
    }

    if (session.isAuthenticated) {
      return const MainTabsScreen();
    }

    return Scaffold(
      body: SafeArea(
        child: AnimatedSwitcher(
          duration: const Duration(milliseconds: 250),
          child: _showLogin
              ? LoginScreen(
                  key: const ValueKey<String>('login'),
                  onSwitchToRegister: () {
                    setState(() {
                      _showLogin = false;
                    });
                  },
                )
              : RegisterScreen(
                  key: const ValueKey<String>('register'),
                  onSwitchToLogin: () {
                    setState(() {
                      _showLogin = true;
                    });
                  },
                ),
        ),
      ),
    );
  }
}
