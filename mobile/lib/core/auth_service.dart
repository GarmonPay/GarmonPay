import 'package:flutter/foundation.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

class AuthService extends ChangeNotifier {
  bool _loading = true;
  bool get isLoading => _loading;

  bool _loggedIn = false;
  bool get isLoggedIn => _loggedIn;

  String? get userId => Supabase.instance.client.auth.currentUser?.id;
  String? get accessToken => Supabase.instance.client.auth.currentSession?.accessToken;

  AuthService() {
    _init();
  }

  Future<void> _init() async {
    Supabase.instance.client.auth.onAuthStateChange.listen((data) {
      _loggedIn = data.session != null;
      notifyListeners();
    });
    _loggedIn = Supabase.instance.client.auth.currentSession != null;
    _loading = false;
    notifyListeners();
  }

  Future<void> login(String email, String password) async {
    await Supabase.instance.client.auth.signInWithPassword(email: email, password: password);
  }

  Future<void> register(String email, String password) async {
    await Supabase.instance.client.auth.signUp(email: email, password: password);
  }

  Future<void> logout() async {
    await Supabase.instance.client.auth.signOut();
  }
}
