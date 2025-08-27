import 'package:flutter/material.dart';
class LocationListScreen extends StatelessWidget {
  const LocationListScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('위치 목록')), body: const Center(child: Text('Location List')));
  }
}