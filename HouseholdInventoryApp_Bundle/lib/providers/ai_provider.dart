import 'package:flutter/material.dart';
import '../models/item.dart';

class AiProvider extends ChangeNotifier {
  List<Item> _recommendations = [];

  List<Item> get recommendations => _recommendations;

  void setRecommendations(List<Item> items) {
    _recommendations = items;
    notifyListeners();
  }

  void clearRecommendations() {
    _recommendations.clear();
    notifyListeners();
  }
}