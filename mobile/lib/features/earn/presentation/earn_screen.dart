import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../ads/data/reward_service.dart';
import '../../../state/session_controller.dart';

class EarnScreen extends StatefulWidget {
  const EarnScreen({super.key});

  @override
  State<EarnScreen> createState() => _EarnScreenState();
}

class _EarnScreenState extends State<EarnScreen> {
  bool _claiming = false;
  String? _error;

  static const int _rewardAmountCents = 50;

  Future<void> _watchAd() async {
    final SessionController session = context.read<SessionController>();
    final RewardService rewardService = context.read<RewardService>();
    final String? userId = session.session?.userId;
    if (userId == null || userId.isEmpty) return;

    setState(() {
      _claiming = true;
      _error = null;
    });
    try {
      await rewardService.watchAdAndClaimReward(
        userId: userId,
        amount: _rewardAmountCents,
        eventType: 'rewarded_ad_watch',
      );
      await session.refreshData();
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Reward credited to wallet')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
      });
    } finally {
      if (mounted) {
        setState(() {
          _claiming = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final SessionController session = context.watch<SessionController>();
    final int balance = session.wallet?.balance ?? 0;

    return ListView(
      padding: const EdgeInsets.all(16),
      children: <Widget>[
        Text(
          'Earn',
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w700),
        ),
        const SizedBox(height: 6),
        const Text('Watch verified rewarded ads and earn direct wallet credits.'),
        const SizedBox(height: 20),
        Card(
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                const Text('Current wallet balance'),
                const SizedBox(height: 8),
                Text(
                  '\$${(balance / 100).toStringAsFixed(2)}',
                  style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 20),
        FilledButton.icon(
          onPressed: _claiming ? null : _watchAd,
          icon: const Icon(Icons.play_circle_fill),
          label: Text(
            _claiming
                ? 'Loading ad...'
                : 'Watch rewarded ad (+\$${(_rewardAmountCents / 100).toStringAsFixed(2)})',
          ),
        ),
        const SizedBox(height: 12),
        if (_error != null)
          Text(
            _error!,
            style: const TextStyle(color: Colors.redAccent),
          ),
      ],
    );
  }
}
