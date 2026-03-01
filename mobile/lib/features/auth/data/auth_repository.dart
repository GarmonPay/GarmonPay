import '../../../core/models/auth_session.dart';
import '../../../core/network/api_client.dart';

class AuthRepository {
  AuthRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<AuthSession> register({
    required String email,
    required String password,
  }) {
    return _apiClient.register(email: email, password: password);
  }

  Future<AuthSession> login({
    required String email,
    required String password,
  }) {
    return _apiClient.login(email: email, password: password);
  }
}
