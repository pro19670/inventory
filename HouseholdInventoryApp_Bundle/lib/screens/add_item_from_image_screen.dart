import 'package:flutter/material.dart';
class AddItemFromImageScreen extends StatelessWidget {
  const AddItemFromImageScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('사진으로 추가')), body: const Center(child: Text('Image Upload')));
  }
}