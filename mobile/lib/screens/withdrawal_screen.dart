import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/api_client.dart';

class WithdrawalScreen extends StatefulWidget {
  const WithdrawalScreen({super.key});

  @override
  State<WithdrawalScreen> createState() => _WithdrawalScreenState();
}

class _WithdrawalScreenState extends State<WithdrawalScreen> {
  final _amount = TextEditingController();
  final _wallet = TextEditingController();
  String _method = 'crypto';
  String? _error;
  bool _loading = false;

  @override
  void dispose() {
    _amount.dispose();
    _wallet.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final amountCents = (double.tryParse(_amount.text) ?? 0) * 100;
    if (amountCents < 100) {
      setState(() => _error = 'Minimum \$1.00');
      return;
    }
    setState(() {
      _error = null;
      _loading = true;
    });
    final result = await context.read<ApiClient>().requestWithdrawal(
          context,
          amountCents: amountCents.round(),
          paymentMethod: _method,
          walletAddress: _wallet.text.trim(),
        );
    if (!mounted) return;
    setState(() => _loading = false);
    if (result != null) {
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Withdrawal submitted')));
    } else {
      setState(() => _error = 'Request failed');
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Withdraw')),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          children: [
            TextField(
              controller: _amount,
              decoration: const InputDecoration(labelText: 'Amount (\$)'),
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
            ),
            const SizedBox(height: 12),
            DropdownButton<String>(
              value: _method,
              items: const [
                DropdownMenuItem(value: 'crypto', child: Text('Crypto')),
                DropdownMenuItem(value: 'paypal', child: Text('PayPal')),
                DropdownMenuItem(value: 'bank', child: Text('Bank')),
              ],
              onChanged: (v) => setState(() => _method = v ?? 'crypto'),
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _wallet,
              decoration: const InputDecoration(labelText: 'Wallet / PayPal / Account'),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Text(_error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
            ],
            const SizedBox(height: 24),
            FilledButton(
              onPressed: _loading ? null : _submit,
              child: _loading ? const SizedBox(height: 20, width: 20, child: CircularProgressIndicator(strokeWidth: 2)) : const Text('Submit'),
            ),
          ],
        ),
      ),
    );
  }
}
