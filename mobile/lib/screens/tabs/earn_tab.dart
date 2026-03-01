import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';

class EarnTab extends StatelessWidget {
  const EarnTab({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Earn')),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.play_circle_fill, size: 80),
            const SizedBox(height: 16),
            const Text('Watch rewarded ads to earn'),
            const SizedBox(height: 24),
            FilledButton.icon(
              onPressed: () async {
                final api = context.read<ApiClient>();
                final ok = await api.creditReward(context, amountCents: 10, eventType: 'ad_view');
                if (context.mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(content: Text(ok ? 'Reward credited!' : 'Failed')),
                  );
                }
              },
              icon: const Icon(Icons.play_arrow),
              label: const Text('Watch ad (demo +10¢)'),
            ),
          ],
        ),
      ),
    );
  }
}
