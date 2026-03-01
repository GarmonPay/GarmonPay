import 'package:flutter/material.dart';

import 'features/auth/presentation/auth_gate.dart';

class GarmonPayApp extends StatelessWidget {
  const GarmonPayApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GarmonPay',
      theme: ThemeData(
        colorScheme: ColorScheme.fromSeed(seedColor: const Color(0xFF3B82F6)),
        useMaterial3: true,
      ),
      debugShowCheckedModeBanner: false,
      home: const AuthGate(),
    );
  }
}
