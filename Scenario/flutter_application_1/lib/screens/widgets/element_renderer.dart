import 'package:flutter/material.dart';
import 'dart:convert';
import '../../providers/universe_provider.dart'; // TagLink 클래스를 위해 필요
import './text_element_widget.dart';
import './tag_element_widget.dart';

class ElementRenderer extends StatelessWidget {
  final String universeId;
  final TextEditingController keyController;
  final TextEditingController valueController;
  final VoidCallback onRemove;

  const ElementRenderer({
    super.key,
    required this.universeId,
    required this.keyController,
    required this.valueController,
    required this.onRemove,
  });

  @override
  Widget build(BuildContext context) {
    if (!_isControllerValid(keyController) ||
        !_isControllerValid(valueController)) {
      return const SizedBox.shrink();
    }

    // --- 수정된 부분 시작 ---
    // 값이 비어있으면 바로 텍스트 위젯 반환 (일반 텍스트 요소 추가 시 빈 상태로 시작하므로)
    if (valueController.text.trim().isEmpty) {
      return TextElementWidget(
        keyController: keyController,
        valueController: valueController,
        onRemove: onRemove,
      );
    }
    // --- 수정된 부분 끝 ---

    try {
      // 값이 있는 경우에만 JSON 파싱 시도
      var decodedValue = jsonDecode(valueController.text);

      // 디코딩 결과가 리스트이고, 첫 항목이 TagLink 구조인지 확인
      if (decodedValue is List) {
        // 빈 리스트([])인 경우에도 태그 위젯으로 간주 (태그 요소 추가 시 '[]'로 시작하므로)
        if (decodedValue.isEmpty) {
          return TagElementWidget(
            universeId: universeId,
            keyController: keyController,
            valueController: valueController,
            // initialTags 제거됨
            onRemove: onRemove,
          );
        }
        // 리스트 내용물이 TagLink 구조인지 확인
        if (decodedValue.isNotEmpty &&
            decodedValue.first is Map &&
            decodedValue.first.containsKey('linkedItemId')) {
          return TagElementWidget(
            universeId: universeId,
            keyController: keyController,
            valueController: valueController,
            // initialTags 제거됨
            onRemove: onRemove,
          );
        }
      }

      // 위 조건에 맞지 않으면 텍스트로 간주하고 예외 발생시켜 catch 블록으로 이동
      throw const FormatException('Not a TagLink list');
    } catch (e) {
      // 디코딩 실패 또는 TagLink 리스트가 아닐 경우 텍스트 편집기 반환
      return TextElementWidget(
        keyController: keyController,
        valueController: valueController,
        onRemove: onRemove,
      );
    }
  }

  // 컨트롤러가 유효한지 확인하는 헬퍼 함수
  bool _isControllerValid(TextEditingController controller) {
    try {
      // ignore: unnecessary_statements
      controller.text;
      return true;
    } catch (e) {
      return false;
    }
  }
}
