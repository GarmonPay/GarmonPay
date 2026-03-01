import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../state/session_controller.dart';
import 'withdrawal_request_screen.dart';

class WalletScreen extends StatelessWidget {
  const WalletScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final SessionController session = context.watch<SessionController>();
    final NumberFormat currency = NumberFormat.currency(symbol: '\$', decimalDigits: 2);

    final int balance = session.wallet?.balance ?? 0;
    final int rewards = session.wallet?.rewardsEarned ?? 0;
    final int withdrawn = session.wallet?.totalWithdrawn ?? 0;
    final int pending = session.wallet?.pendingWithdrawals ?? 0;

    return RefreshIndicator(
      onRefresh: session.refreshData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(
            'Wallet',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text('Current balance'),
                  const SizedBox(height: 4),
                  Text(
                    currency.format(balance / 100),
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 16),
                  Wrap(
                    spacing: 12,
                    runSpacing: 12,
                    children: <Widget>[
                      _MetricTile(label: 'Rewards earned', value: currency.format(rewards / 100)),
                      _MetricTile(label: 'Withdrawn', value: currency.format(withdrawn / 100)),
                      _MetricTile(label: 'Pending withdrawals', value: currency.format(pending / 100)),
                    ],
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          FilledButton.icon(
            onPressed: () async {
              await Navigator.of(context).push<void>(
                MaterialPageRoute<void>(
                  builder: (_) => const WithdrawalRequestScreen(),
                ),
              );
              if (!context.mounted) return;
              await context.read<SessionController>().refreshData();
            },
            icon: const Icon(Icons.outbound),
            label: const Text('Request withdrawal'),
          ),
          const SizedBox(height: 20),
          Text(
            'Transactions',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (session.transactions.isEmpty)
            const Text('No transactions yet.')
          else
            ...session.transactions.take(30).map(
                  (tx) => Card(
                    child: ListTile(
                      dense: true,
                      title: Text(tx.type),
                      subtitle: Text(
                        '${tx.status} • ${DateFormat.yMMMd().add_jm().format(tx.createdAt.toLocal())}',
                      ),
                      trailing: Text(currency.format(tx.amount / 100)),
                    ),
                  ),
                ),
          const SizedBox(height: 20),
          Text(
            'Withdrawals',
            style: Theme.of(context).textTheme.titleMedium?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 8),
          if (session.withdrawals.isEmpty)
            const Text('No withdrawals yet.')
          else
            ...session.withdrawals.take(20).map(
                  (item) => Card(
                    child: ListTile(
                      dense: true,
                      title: Text(
                        '${currency.format(item.amount / 100)} • ${item.paymentMethod}',
                      ),
                      subtitle: Text(DateFormat.yMMMd().format(item.requestedAt.toLocal())),
                      trailing: Text(item.status),
                    ),
                  ),
                ),
        ],
      ),
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({
    required this.label,
    required this.value,
  });

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 160,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: Theme.of(context).colorScheme.surfaceContainerHighest,
        borderRadius: BorderRadius.circular(10),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Text(label, style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: 6),
          Text(value, style: Theme.of(context).textTheme.titleMedium),
        ],
      ),
    );
  }
}
