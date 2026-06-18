import 'package:flutter/material.dart';

class TextElementWidget extends StatelessWidget {
  final TextEditingController keyController;
  final TextEditingController valueController;
  final VoidCallback onRemove;

  const TextElementWidget({
    super.key,
    required this.keyController,
    required this.valueController,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: TextFormField(
              controller: keyController,
              decoration: const InputDecoration(
                  labelText: '요소 이름', border: OutlineInputBorder()),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 3,
            child: TextFormField(
              controller: valueController,
              decoration: const InputDecoration(
                  labelText: '내용', border: OutlineInputBorder()),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.remove_circle_outline),
            onPressed: onRemove,
          ),
        ],
      ),
    );
  }
}
