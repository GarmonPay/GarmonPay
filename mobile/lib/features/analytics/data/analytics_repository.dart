import '../../../core/network/api_client.dart';

class AnalyticsRepository {
  AnalyticsRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<void> trackEvent({
    String? userId,
    required String eventType,
    required String source,
    Map<String, dynamic>? payload,
  }) {
    return _apiClient.trackAnalyticsEvent(
      userId: userId,
      eventType: eventType,
      source: source,
      payload: payload,
    );
  }
}
