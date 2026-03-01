import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../../state/session_controller.dart';

class WithdrawalRequestScreen extends StatefulWidget {
  const WithdrawalRequestScreen({super.key});

  @override
  State<WithdrawalRequestScreen> createState() => _WithdrawalRequestScreenState();
}

class _WithdrawalRequestScreenState extends State<WithdrawalRequestScreen> {
  final GlobalKey<FormState> _formKey = GlobalKey<FormState>();
  final TextEditingController _amountController = TextEditingController();
  final TextEditingController _paymentAccountController = TextEditingController();
  String _paymentMethod = 'paypal';
  String? _error;

  @override
  void dispose() {
    _amountController.dispose();
    _paymentAccountController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }
    final SessionController session = context.read<SessionController>();
    final int amountCents = (double.parse(_amountController.text.trim()) * 100).round();
    setState(() {
      _error = null;
    });
    try {
      await session.submitWithdrawal(
        amount: amountCents,
        paymentMethod: _paymentMethod,
        paymentAccount: _paymentAccountController.text.trim(),
      );
      if (!mounted) return;
      Navigator.of(context).pop();
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Withdrawal request submitted')),
      );
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = error.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final SessionController session = context.watch<SessionController>();
    final int balance = session.wallet?.balance ?? 0;

    return Scaffold(
      appBar: AppBar(title: const Text('Request withdrawal')),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Form(
            key: _formKey,
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                Text('Available balance: \$${(balance / 100).toStringAsFixed(2)}'),
                const SizedBox(height: 16),
                TextFormField(
                  controller: _amountController,
                  keyboardType: const TextInputType.numberWithOptions(decimal: true),
                  decoration: const InputDecoration(
                    labelText: 'Amount (USD)',
                    border: OutlineInputBorder(),
                  ),
                  validator: (String? value) {
                    final double parsed = double.tryParse((value ?? '').trim()) ?? 0;
                    if (parsed <= 0) {
                      return 'Enter a valid amount';
                    }
                    if ((parsed * 100).round() > balance) {
                      return 'Amount exceeds available balance';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                DropdownButtonFormField<String>(
                  value: _paymentMethod,
                  decoration: const InputDecoration(
                    labelText: 'Payment method',
                    border: OutlineInputBorder(),
                  ),
                  items: const <DropdownMenuItem<String>>[
                    DropdownMenuItem<String>(value: 'paypal', child: Text('PayPal')),
                    DropdownMenuItem<String>(value: 'bank', child: Text('Bank transfer')),
                    DropdownMenuItem<String>(value: 'crypto', child: Text('Crypto wallet')),
                  ],
                  onChanged: (String? value) {
                    if (value == null) return;
                    setState(() {
                      _paymentMethod = value;
                    });
                  },
                ),
                const SizedBox(height: 12),
                TextFormField(
                  controller: _paymentAccountController,
                  decoration: const InputDecoration(
                    labelText: 'Payment account details',
                    border: OutlineInputBorder(),
                  ),
                  validator: (String? value) {
                    if ((value ?? '').trim().length < 3) {
                      return 'Enter destination account details';
                    }
                    return null;
                  },
                ),
                const SizedBox(height: 12),
                if (_error != null)
                  Text(
                    _error!,
                    style: const TextStyle(color: Colors.redAccent),
                  ),
                const Spacer(),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: session.busy ? null : _submit,
                    child: session.busy
                        ? const SizedBox(
                            width: 18,
                            height: 18,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : const Text('Submit request'),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
