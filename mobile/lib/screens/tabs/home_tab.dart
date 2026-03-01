import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/api_client.dart';

class HomeTab extends StatelessWidget {
  const HomeTab({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Home')),
      body: FutureBuilder<Map<String, dynamic>?>(
        future: context.read<ApiClient>().getWallet(context),
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final w = snap.data!;
          final balance = (w['balance'] as num?)?.toDouble() ?? 0.0;
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                const Text('Balance', style: TextStyle(fontSize: 16)),
                Text('\$${balance.toStringAsFixed(2)}', style: Theme.of(context).textTheme.headlineMedium),
                const SizedBox(height: 24),
                TextButton(
                  onPressed: () => context.read<AuthService>().logout(),
                  child: const Text('Logout'),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}
