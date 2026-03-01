import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:provider/provider.dart';
import 'package:flutter/material.dart';

import 'auth_service.dart';

class ApiClient {
  static String? baseUrl;

  String get _base => baseUrl ?? 'http://localhost:4000';

  Future<Map<String, String>> _headers(BuildContext context) async {
    final auth = context.read<AuthService>();
    final token = auth.accessToken;
    return {
      'Content-Type': 'application/json',
      if (token != null) 'Authorization': 'Bearer $token',
    };
  }

  Future<Map<String, dynamic>?> getWallet(BuildContext context) async {
    final res = await http.get(
      Uri.parse('$_base/api/wallet'),
      headers: await _headers(context),
    );
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>?> getProfile(BuildContext context) async {
    final res = await http.get(
      Uri.parse('$_base/api/user/profile'),
      headers: await _headers(context),
    );
    if (res.statusCode != 200) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<List<dynamic>?> getTransactions(BuildContext context) async {
    final res = await http.get(
      Uri.parse('$_base/api/transactions?limit=50'),
      headers: await _headers(context),
    );
    if (res.statusCode != 200) return null;
    final data = jsonDecode(res.body) as Map<String, dynamic>;
    return data['transactions'] as List<dynamic>? ?? [];
  }

  Future<bool> creditReward(BuildContext context, {required int amountCents, String eventType = 'ad_view'}) async {
    final res = await http.post(
      Uri.parse('$_base/api/rewards/credit'),
      headers: await _headers(context),
      body: jsonEncode({'amount': amountCents, 'eventType': eventType}),
    );
    return res.statusCode == 200;
  }

  Future<Map<String, dynamic>?> requestWithdrawal(
    BuildContext context, {
    required int amountCents,
    required String paymentMethod,
    String? walletAddress,
  }) async {
    final res = await http.post(
      Uri.parse('$_base/api/withdrawals/request'),
      headers: await _headers(context),
      body: jsonEncode({
        'amount': amountCents,
        'paymentMethod': paymentMethod,
        'wallet_address': walletAddress ?? '',
      }),
    );
    if (res.statusCode != 201) return null;
    return jsonDecode(res.body) as Map<String, dynamic>;
  }

  Future<void> trackEvent(BuildContext context, String eventType, [Map<String, dynamic>? payload]) async {
    await http.post(
      Uri.parse('$_base/api/analytics/event'),
      headers: await _headers(context),
      body: jsonEncode({'eventType': eventType, 'payload': payload ?? {}}),
    );
  }
}
