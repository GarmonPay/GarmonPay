import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../../../state/session_controller.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final SessionController session = context.watch<SessionController>();
    final NumberFormat currency = NumberFormat.currency(symbol: '\$', decimalDigits: 2);
    final int balance = session.wallet?.balance ?? 0;
    final int rewardsEarned = session.wallet?.rewardsEarned ?? 0;
    final int totalWithdrawn = session.wallet?.totalWithdrawn ?? 0;

    return RefreshIndicator(
      onRefresh: session.refreshData,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: <Widget>[
          Text(
            'Hello, ${session.profile?.email ?? 'Member'}',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 4),
          const Text('Track your earnings and wallet activity in real time.'),
          const SizedBox(height: 18),
          Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: <Widget>[
                  const Text('Current balance'),
                  const SizedBox(height: 6),
                  Text(
                    currency.format(balance / 100),
                    style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.bold),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 12),
          Row(
            children: <Widget>[
              Expanded(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        const Text('Rewards earned'),
                        const SizedBox(height: 8),
                        Text(currency.format(rewardsEarned / 100)),
                      ],
                    ),
                  ),
                ),
              ),
              Expanded(
                child: Card(
                  child: Padding(
                    padding: const EdgeInsets.all(14),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: <Widget>[
                        const Text('Withdrawn'),
                        const SizedBox(height: 8),
                        Text(currency.format(totalWithdrawn / 100)),
                      ],
                    ),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),
          FilledButton.icon(
            onPressed: session.busy ? null : () => session.refreshData(),
            icon: const Icon(Icons.refresh),
            label: const Text('Refresh'),
          ),
        ],
      ),
    );
  }
}
