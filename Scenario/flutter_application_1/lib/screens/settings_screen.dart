import 'package:flutter/material.dart';

class SettingsScreen extends StatelessWidget {
  static const routeName = '/settings';

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Setting'),
        backgroundColor: Colors.white,
        elevation: 0,
      ),
      body: Center(
        child: Container(
          width: 500,
          padding: const EdgeInsets.all(20),
          color: Colors.grey[200],
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const Text('Ver 1.1.0',
                  style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
              const SizedBox(height: 20),
              SettingRow('언어', '한국어'),
              SettingRow('UI 테마', 'Light'),
              SettingRow('마지막 수정 요소 표시', 'On', isToggle: true),
              SettingRow('세계관 추출 파일 저장 위치', 'G:\\Download'),
            ],
          ),
        ),
      ),
    );
  }
}

class SettingRow extends StatelessWidget {
  final String label;
  final String value;
  final bool isToggle;

  SettingRow(this.label, this.value, {this.isToggle = false});

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8.0),
      child: Row(
        children: [
          Container(
            width: 200,
            padding: const EdgeInsets.all(10),
            color: Colors.grey[700],
            child: Text(label,
                style: const TextStyle(color: Colors.white, fontSize: 16)),
          ),
          Expanded(
            child: Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey.shade400),
              ),
              child: isToggle
                  ? Align(
                      alignment: Alignment.centerRight,
                      child: Switch(value: value == 'On', onChanged: (val) {}),
                    )
                  : Text(value, style: const TextStyle(fontSize: 16)),
            ),
          )
        ],
      ),
    );
  }
}
