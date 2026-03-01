import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../core/auth_service.dart';
import 'tabs/home_tab.dart';
import 'tabs/earn_tab.dart';
import 'tabs/wallet_tab.dart';
import 'tabs/profile_tab.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell> {
  int _index = 0;

  static const _tabs = [
    ('Home', Icons.home),
    ('Earn', Icons.play_circle_outline),
    ('Wallet', Icons.account_balance_wallet),
    ('Profile', Icons.person),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: IndexedStack(
        index: _index,
        children: const [
          HomeTab(),
          EarnTab(),
          WalletTab(),
          ProfileTab(),
        ],
      ),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _index,
        onDestinationSelected: (i) => setState(() => _index = i),
        destinations: _tabs
            .map((e) => NavigationDestination(
                  icon: Icon(e.$2),
                  label: e.$1,
                ))
            .toList(),
      ),
    );
  }
}
