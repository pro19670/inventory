import 'package:flutter/material.dart';
class ItemDetailScreen extends StatelessWidget {
  const ItemDetailScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('물품 상세')), body: const Center(child: Text('Item Detail')));
  }
}