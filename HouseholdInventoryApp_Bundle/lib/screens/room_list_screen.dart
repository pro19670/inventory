import 'package:flutter/material.dart';
class RoomListScreen extends StatelessWidget {
  const RoomListScreen({super.key});
  @override
  Widget build(BuildContext context) {
    return Scaffold(appBar: AppBar(title: const Text('방 목록')), body: const Center(child: Text('Room List')));
  }
}