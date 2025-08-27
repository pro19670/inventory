import 'package:flutter/material.dart';
class StorageListScreen extends StatelessWidget {
  const StorageListScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('보관 장소')), body: const Center(child: Text('Storage List')));
  }
}