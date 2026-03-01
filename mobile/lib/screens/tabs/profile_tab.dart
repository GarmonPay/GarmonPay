import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../core/auth_service.dart';
import '../../core/api_client.dart';

class ProfileTab extends StatelessWidget {
  const ProfileTab({super.key});

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthService>();
    return Scaffold(
      appBar: AppBar(title: const Text('Profile')),
      body: FutureBuilder<Map<String, dynamic>?>(
        future: context.read<ApiClient>().getProfile(context),
        builder: (context, snap) {
          final p = snap.data;
          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              if (p != null) ...[
                ListTile(title: const Text('Email'), trailing: Text(p['email']?.toString() ?? '')),
                ListTile(title: const Text('Balance'), trailing: Text('\$${(p['balance'] as num?)?.toStringAsFixed(2) ?? '0.00'}')),
              ],
              const Divider(),
              ListTile(
                leading: const Icon(Icons.logout),
                title: const Text('Logout'),
                onTap: () => auth.logout(),
              ),
            ],
          );
        },
      ),
    );
  }
}
