import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../models/universe.dart'; // universe 모델을 import 해야 합니다.
import '../providers/universe_provider.dart';
import './universe_screen.dart';
import './settings_screen.dart';

class MainScreen extends StatelessWidget {
  const MainScreen({super.key});

  @override
  Widget build(BuildContext context) {
    // listen: true로 변경하여 데이터 변경 시 화면이 다시 그려지도록 합니다.
    final universeProvider = Provider.of<UniverseProvider>(context);
    final universes = universeProvider.universes;

    return Scaffold(
      appBar: AppBar(
        title: const Text(
          '세계관 편집기',
          style: TextStyle(fontSize: 30, fontWeight: FontWeight.bold),
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        actions: [
          IconButton(icon: const Icon(Icons.menu), onPressed: () {}),
          IconButton(
            icon: const Icon(Icons.settings),
            onPressed: () =>
                Navigator.of(context).pushNamed(SettingsScreen.routeName),
          ),
          const SizedBox(width: 20),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(20.0),
        child: Wrap(
          // Wrap 위젯을 사용하여 카드를 자동으로 줄바꿈합니다.
          spacing: 20.0, // 카드 사이의 가로 간격
          runSpacing: 20.0, // 카드 사이의 세로 간격
          children: [
            ...universes.map((uni) => UniverseCard(universe: uni)),
            const AddUniverseCard(), // '새 세계관 추가' 카드는 항상 마지막에 표시
          ],
        ),
      ),
    );
  }
}

// 세계관 정보를 보여주는 카드 위젯
class UniverseCard extends StatelessWidget {
  final Universe universe;
  const UniverseCard({super.key, required this.universe});

  @override
  Widget build(BuildContext context) {
    // Provider.of 사용 시 listen: false는 build 메서드 밖이나 콜백 함수 내에서 사용합니다.
    final provider = Provider.of<UniverseProvider>(context, listen: false);

    return Container(
      width: 370, // 카드의 고정 너비
      height: 180, // 카드의 고정 높이
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        border: Border.all(color: Colors.grey.shade400),
        borderRadius: BorderRadius.circular(15),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                // 아이콘 배경
                width: 50,
                height: 50,
                decoration: BoxDecoration(
                  color: const Color(0xFFC3DCF3),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.public, size: 30), // 임시 아이콘
              ),
              const SizedBox(width: 15),
              Column(
                // 세계관 이름 및 최종 수정자
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    universe.name,
                    style: const TextStyle(
                        fontSize: 20, fontWeight: FontWeight.bold),
                  ),
                  Text(
                    '최종 수정: ${universe.lastEditedBy}',
                    style: const TextStyle(color: Colors.grey),
                  ),
                ],
              ),
              const Spacer(), // 삭제 버튼을 오른쪽 끝으로 밀기
              IconButton(
                // 삭제 버튼
                icon: const Icon(Icons.delete_outline),
                onPressed: () {
                  // 삭제 확인 다이얼로그 표시
                  showDialog(
                    context: context,
                    builder: (ctx) => AlertDialog(
                      title: const Text('삭제 확인'),
                      content: Text('\'${universe.name}\' 세계관을 정말 삭제하시겠습니까?'),
                      actions: [
                        TextButton(
                          child: const Text('취소'),
                          onPressed: () => Navigator.of(ctx).pop(),
                        ),
                        TextButton(
                          child: const Text('삭제',
                              style: TextStyle(color: Colors.red)),
                          onPressed: () {
                            // <<< --- deleteUniverse 호출 확인 --- >>>
                            provider.deleteUniverse(universe.id);
                            Navigator.of(ctx).pop(); // 다이얼로그 닫기
                          },
                        ),
                      ],
                    ),
                  );
                },
              ),
            ],
          ),
          const SizedBox(height: 10),
          // 요소 개수 표시
          Text(
            '플롯: ${universe.plots.length}  캐릭터: ${universe.characters.length}  장소: ${universe.locations.length}',
            style: TextStyle(color: Colors.grey.shade600),
          ),
          const Spacer(), // 편집 버튼을 맨 아래로 밀기
          SizedBox(
            // 편집 버튼
            width: double.infinity,
            child: ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: Colors.grey.shade700,
                foregroundColor: Colors.white,
              ),
              onPressed: () {
                // 상세 화면으로 이동
                Navigator.of(context).pushNamed(UniverseScreen.routeName,
                    arguments: universe.id);
              },
              child: const Text('편집하기'),
            ),
          ),
        ],
      ),
    );
  }
}

// '새로운 세계관 만들기' 카드 위젯
class AddUniverseCard extends StatelessWidget {
  const AddUniverseCard({super.key});

  @override
  Widget build(BuildContext context) {
    // Provider.of 사용 시 listen: false는 build 메서드 밖이나 콜백 함수 내에서 사용합니다.
    final provider = Provider.of<UniverseProvider>(context, listen: false);

    return GestureDetector(
      onTap: () {
        // <<< --- addUniverse 호출 확인 --- >>>
        provider.addUniverse();
      },
      child: Container(
        width: 370, // 다른 카드와 동일한 너비
        height: 180, // 다른 카드와 동일한 높이
        decoration: BoxDecoration(
          // 점선 테두리 스타일 (실선으로 대체)
          border:
              Border.all(color: Colors.grey.shade400, style: BorderStyle.solid),
          borderRadius: BorderRadius.circular(15),
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add, size: 50, color: Colors.grey.shade600),
            const SizedBox(height: 10),
            Text(
              '새로운 세계관 만들기',
              style: TextStyle(color: Colors.grey.shade700),
            ),
          ],
        ),
      ),
    );
  }
}
