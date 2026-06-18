import 'package:flutter/material.dart';
import 'dart:convert';
import 'dart:io';
import '../../providers/universe_provider.dart';

class SummaryViewWidget extends StatelessWidget {
  final String title;
  final String? imageUrl;
  final String leftTitle; // 왼쪽 목록 제목 (예: 참여 플롯)
  final String? leftTagsJson; // 왼쪽 목록 데이터 (JSON 문자열)
  final String rightTitle; // 오른쪽 목록 제목 (예: 핵심 내용)
  final String? rightContent; // 오른쪽 데이터 (미정, 일단 텍스트로 받음)

  const SummaryViewWidget({
    super.key,
    required this.title,
    this.imageUrl,
    required this.leftTitle,
    this.leftTagsJson,
    required this.rightTitle,
    this.rightContent,
  });

  @override
  Widget build(BuildContext context) {
    // 왼쪽 태그 데이터 파싱
    List<TagLink> leftTags = [];
    if (leftTagsJson != null && leftTagsJson!.isNotEmpty) {
      try {
        var decoded = jsonDecode(leftTagsJson!);
        if (decoded is List) {
          leftTags = decoded
              .where((item) => item is Map<String, dynamic>)
              .map((item) => TagLink.fromJson(item as Map<String, dynamic>))
              .toList();
        }
      } catch (e) {
        print('SummaryView parsing error: $e');
      }
    }

    return Center(
      child: SingleChildScrollView(
        // 화면이 작을 때를 대비한 스크롤
        scrollDirection: Axis.horizontal,
        child: Container(
          padding: const EdgeInsets.all(32.0),
          // 가로로 넓게 배치하기 위해 Row 사용 (최소 너비 보장)
          constraints: const BoxConstraints(minWidth: 800),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start, // 위쪽 정렬
            mainAxisAlignment: MainAxisAlignment.spaceEvenly, // 간격 균등 분배
            children: [
              // --- [왼쪽] 관계 데이터 (참여 플롯 등) ---
              _buildSideColumn(
                  leftTitle, leftTags.map((e) => e.displayName).toList()),

              // --- [중앙] 이미지 및 이름 ---
              Padding(
                padding: const EdgeInsets.symmetric(horizontal: 40.0),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // 이미지 박스
                    Container(
                      width: 300,
                      height: 300,
                      decoration: BoxDecoration(
                        color: Colors.grey[200],
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(color: Colors.grey[400]!),
                        boxShadow: [
                          BoxShadow(
                            color: Colors.black.withOpacity(0.2),
                            blurRadius: 10,
                            offset: const Offset(0, 5),
                          ),
                        ],
                      ),
                      clipBehavior: Clip.antiAlias,
                      child: _buildImage(),
                    ),
                    const SizedBox(height: 30),
                    // 이름 박스
                    _buildInfoBox(title,
                        fontSize: 24, fontWeight: FontWeight.bold),
                  ],
                ),
              ),

              // --- [오른쪽] 핵심 내용 (미정) ---
              // 현재는 임시 데이터 리스트를 보여줌
              _buildSideColumn(rightTitle, ["핵심 요소 1", "핵심 요소 2", "..."]),
            ],
          ),
        ),
      ),
    );
  }

  // 측면 컬럼 (제목 박스 + 리스트 아이템들) 빌더
  Widget _buildSideColumn(String title, List<String> items) {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        _buildInfoBox(title, width: 180, color: Colors.grey[300]),
        const SizedBox(height: 20),
        // 아이템 리스트 연결선 느낌을 위한 점선 (선택 사항)
        // Container(height: 20, width: 2, color: Colors.grey),
        ...items.map((item) => Padding(
              padding: const EdgeInsets.only(bottom: 10.0),
              child: _buildInfoBox(item, width: 220),
            )),
        if (items.isNotEmpty)
          const Padding(
            padding: EdgeInsets.only(top: 10),
            child: Icon(Icons.more_vert, size: 30, color: Colors.black54),
          ),
      ],
    );
  }

  // 둥근 사각형 텍스트 박스 위젯
  Widget _buildInfoBox(String text,
      {double? width,
      double fontSize = 16,
      FontWeight fontWeight = FontWeight.normal,
      Color? color}) {
    return Container(
      width: width, // width가 null이면 내용물에 맞춤 (가운데 이름 박스 등)
      padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
      decoration: BoxDecoration(
        color: color ?? Colors.grey[200],
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.grey[600]!, width: 1.5),
      ),
      child: Text(
        text,
        textAlign: TextAlign.center,
        style: TextStyle(
          fontSize: fontSize,
          fontWeight: fontWeight,
          color: Colors.black87,
        ),
      ),
    );
  }

  // 이미지 렌더링 헬퍼
  Widget _buildImage() {
    if (imageUrl != null && imageUrl!.isNotEmpty) {
      if (imageUrl!.startsWith('http')) {
        return Image.network(imageUrl!, fit: BoxFit.cover);
      } else {
        return Image.file(File(imageUrl!), fit: BoxFit.cover);
      }
    }
    return const Center(child: Icon(Icons.image, size: 50, color: Colors.grey));
  }
}
