class WithdrawalRecord {
  const WithdrawalRecord({
    required this.id,
    required this.amount,
    required this.status,
    required this.paymentMethod,
    required this.requestedAt,
  });

  final String id;
  final int amount;
  final String status;
  final String paymentMethod;
  final DateTime requestedAt;

  factory WithdrawalRecord.fromJson(Map<String, dynamic> json) {
    return WithdrawalRecord(
      id: (json['id'] as String?) ?? '',
      amount: (json['amount'] as num?)?.round() ?? 0,
      status: (json['status'] as String?) ?? 'pending',
      paymentMethod: (json['payment_method'] as String?) ?? (json['method'] as String?) ?? 'unknown',
      requestedAt: DateTime.tryParse(
            (json['requested_at'] as String?) ?? (json['created_at'] as String?) ?? '',
          ) ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}
