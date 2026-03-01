class TransactionRecord {
  const TransactionRecord({
    required this.id,
    required this.type,
    required this.amount,
    required this.status,
    required this.description,
    required this.createdAt,
  });

  final String id;
  final String type;
  final int amount;
  final String status;
  final String? description;
  final DateTime createdAt;

  factory TransactionRecord.fromJson(Map<String, dynamic> json) {
    return TransactionRecord(
      id: (json['id'] as String?) ?? '',
      type: (json['type'] as String?) ?? 'unknown',
      amount: (json['amount'] as num?)?.round() ?? 0,
      status: (json['status'] as String?) ?? 'pending',
      description: json['description'] as String?,
      createdAt: DateTime.tryParse((json['created_at'] as String?) ?? '') ??
          DateTime.fromMillisecondsSinceEpoch(0),
    );
  }
}
