import 'package:flutter/material.dart';
class ItemListScreen extends StatelessWidget {
  const ItemListScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('물품 목록')), body: const Center(child: Text('Item List')));
  }
}