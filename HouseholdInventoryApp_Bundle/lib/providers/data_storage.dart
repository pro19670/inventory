import 'dart:convert';
import 'package:shared_preferences/shared_preferences.dart';
import '../models/item.dart';

class DataStorage {
  static const _itemsKey = 'inventory_items';

  Future<void> saveItems(List<Item> items) async {
    final prefs = await SharedPreferences.getInstance();
    final jsonList = items.map((item) => jsonEncode({
      'id': item.id,
      'name': item.name,
      'category': item.category,
      'color': item.color,
      'brand': item.brand,
      'quantity': item.quantity,
    })).toList();
    await prefs.setStringList(_itemsKey, jsonList);
  }

  Future<List<Item>> loadItems() async {
    final prefs = await SharedPreferences.getInstance();
    final jsonList = prefs.getStringList(_itemsKey) ?? [];
    return jsonList.map((jsonStr) {
      final jsonMap = jsonDecode(jsonStr);
      return Item(
        id: jsonMap['id'],
        name: jsonMap['name'],
        category: jsonMap['category'],
        color: jsonMap['color'],
        brand: jsonMap['brand'],
        quantity: jsonMap['quantity'],
      );
    }).toList();
  }
}