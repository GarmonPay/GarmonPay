import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';
import 'withdrawal_screen.dart';

class WalletTab extends StatefulWidget {
  const WalletTab({super.key});

  @override
  State<WalletTab> createState() => _WalletTabState();
}

class _WalletTabState extends State<WalletTab> {
  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Wallet'),
        actions: [
          IconButton(
            icon: const Icon(Icons.send),
            onPressed: () => Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const WithdrawalScreen()),
            ),
          ),
        ],
      ),
      body: FutureBuilder<Map<String, dynamic>?>(
        future: context.read<ApiClient>().getWallet(context),
        builder: (context, snap) {
          if (!snap.hasData) {
            return const Center(child: CircularProgressIndicator());
          }
          final w = snap.data!;
          final balance = (w['balance'] as num?)?.toDouble() ?? 0.0;
          return RefreshIndicator(
            onRefresh: () async => setState(() {}),
            child: FutureBuilder<List<dynamic>?>(
              future: context.read<ApiClient>().getTransactions(context),
              builder: (context, txSnap) {
                final list = txSnap.data ?? [];
                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(24),
                        child: Column(
                          children: [
                            const Text('Available balance'),
                            Text('\$${balance.toStringAsFixed(2)}', style: Theme.of(context).textTheme.headlineMedium),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 16),
                    Text('Recent transactions', style: Theme.of(context).textTheme.titleMedium),
                    const SizedBox(height: 8),
                    ...list.take(20).map((t) => ListTile(
                          title: Text((t['type'] ?? '').toString()),
                          subtitle: Text((t['createdAt'] ?? '').toString()),
                          trailing: Text('\$${((t['amount'] ?? 0) as num).toStringAsFixed(2)}'),
                        )),
                  ],
                );
              },
            ),
          );
        },
      ),
    );
  }
}
