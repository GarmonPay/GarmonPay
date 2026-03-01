import '../../../core/models/user_profile.dart';
import '../../../core/network/api_client.dart';

class UserRepository {
  UserRepository(this._apiClient);

  final ApiClient _apiClient;

  Future<UserProfile> getProfile() => _apiClient.getProfile();
}
