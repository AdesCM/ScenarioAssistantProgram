import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:convert'; // JSON 처리를 위해 추가

import '../models/character.dart';
import '../models/location.dart';
import '../models/plot.dart';
import '../providers/universe_provider.dart';
import './character_detail_screen.dart';
import './plot_detail_screen.dart';
import './location_detail_screen.dart';
import './widgets/add_tag_dialog.dart';
import './timeline_screen.dart';

class UniverseScreen extends StatefulWidget {
  static const routeName = '/universe';

  const UniverseScreen({super.key});

  @override
  State<UniverseScreen> createState() => _UniverseScreenState();
}

class _UniverseScreenState extends State<UniverseScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabController;
  int _selectedIndex = 0;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
    _tabController.addListener(() {
      if (mounted) {
        setState(() {
          _selectedIndex = _tabController.index;
        });
      }
    });
  }

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  // --- 새 항목 추가 시 이름을 입력받는 함수 ---
  Future<void> _addItemWithName(BuildContext context, TagType type) async {
    final provider = Provider.of<UniverseProvider>(context, listen: false);
    final universeId = ModalRoute.of(context)!.settings.arguments as String;
    String? newItemName = await showDialog<String>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: Text(
            '새 ${type == TagType.character ? '캐릭터' : type == TagType.plot ? '플롯' : '장소'} 이름'),
        content: TextField(
          autofocus: true,
          decoration: const InputDecoration(hintText: '이름 입력'),
          onSubmitted: (value) => Navigator.of(ctx).pop(value),
        ),
        actions: [
          TextButton(
            child: const Text('취소'),
            onPressed: () => Navigator.of(ctx).pop(),
          ),
          TextButton(
              child: const Text('추가'),
              onPressed: () {
                Navigator.of(ctx).pop();
              }),
        ],
      ),
    );

    if (newItemName != null && newItemName.isNotEmpty) {
      if (type == TagType.character) {
        provider.addCharacter(universeId, newItemName);
      } else if (type == TagType.plot) {
        provider.addPlot(universeId, newItemName);
      } else if (type == TagType.location) {
        provider.addLocation(universeId, newItemName);
      }
    }
  }

  // --- [NEW] JSON 입력 다이얼로그 표시 함수 ---
  void _showJsonImportDialog(String universeId) {
    final TextEditingController jsonController = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('JSON 데이터 일괄 등록'),
        content: SizedBox(
          width: 400,
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              const Text(
                '캐릭터, 플롯, 장소 데이터가 포함된 JSON을 붙여넣으세요.\n이름이 같은 항목끼리 자동으로 태그가 연결됩니다.',
                style: TextStyle(fontSize: 12, color: Colors.grey),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: jsonController,
                maxLines: 10,
                decoration: const InputDecoration(
                  hintText: '{ "characters": [ ... ], "plots": [ ... ] }',
                  border: OutlineInputBorder(),
                ),
              ),
            ],
          ),
        ),
        actions: [
          TextButton(
            child: const Text('취소'),
            onPressed: () => Navigator.of(ctx).pop(),
          ),
          ElevatedButton(
            child: const Text('등록'),
            onPressed: () {
              try {
                if (jsonController.text.isNotEmpty) {
                  Provider.of<UniverseProvider>(context, listen: false)
                      .importDataFromJson(universeId, jsonController.text);

                  Navigator.of(ctx).pop();

                  ScaffoldMessenger.of(context).showSnackBar(
                    const SnackBar(content: Text('데이터가 성공적으로 등록되었습니다!')),
                  );
                }
              } catch (e) {
                ScaffoldMessenger.of(context).showSnackBar(
                  SnackBar(content: Text('오류 발생: $e')),
                );
              }
            },
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final universeId = ModalRoute.of(context)!.settings.arguments as String;
    final universe =
        Provider.of<UniverseProvider>(context).findById(universeId);

    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              decoration: BoxDecoration(
                color: const Color(0xFFC3DCF3),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.public),
            ),
            const SizedBox(width: 10),
            Text(universe.name,
                style: const TextStyle(fontWeight: FontWeight.bold)),
          ],
        ),
        backgroundColor: Colors.white,
        elevation: 0,
        actions: [
          // --- [NEW] JSON 가져오기 버튼 ---
          IconButton(
            icon: const Icon(Icons.file_download),
            tooltip: 'JSON 데이터 불러오기',
            onPressed: () => _showJsonImportDialog(universeId),
          ),

          IconButton(
            icon: const Icon(Icons.timeline),
            tooltip: '타임라인 보기',
            onPressed: () {
              Navigator.of(context).pushNamed(
                TimelineScreen.routeName,
                arguments: universeId,
              );
            },
          ),
          IconButton(icon: const Icon(Icons.menu), onPressed: () {}),
          IconButton(icon: const Icon(Icons.settings), onPressed: () {}),
          const SizedBox(width: 20),
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 40, vertical: 20),
        child: Column(
          children: [
            Container(
              height: 60,
              padding: const EdgeInsets.all(5),
              decoration: BoxDecoration(
                color: Colors.grey[200],
                borderRadius: BorderRadius.circular(10),
              ),
              child: TabBar(
                controller: _tabController,
                indicator: BoxDecoration(
                  color: Colors.white,
                  borderRadius: BorderRadius.circular(10),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.1),
                      spreadRadius: 1,
                      blurRadius: 5,
                    ),
                  ],
                ),
                labelColor: Colors.black,
                unselectedLabelColor: Colors.grey[600],
                tabs: const [
                  Tab(icon: Icon(Icons.description), text: '플롯'),
                  Tab(icon: Icon(Icons.person), text: '캐릭터'),
                  Tab(icon: Icon(Icons.location_on), text: '장소'),
                ],
              ),
            ),
            const SizedBox(height: 20),
            Align(
              alignment: Alignment.centerRight,
              child: ElevatedButton.icon(
                icon: const Icon(Icons.add),
                label: Text(
                  _selectedIndex == 0
                      ? '새 플롯 만들기'
                      : (_selectedIndex == 1 ? '새 캐릭터 만들기' : '새 장소 만들기'),
                ),
                onPressed: () {
                  final type = _selectedIndex == 0
                      ? TagType.plot
                      : (_selectedIndex == 1
                          ? TagType.character
                          : TagType.location);
                  _addItemWithName(context, type);
                },
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.black,
                  foregroundColor: Colors.white,
                  padding:
                      const EdgeInsets.symmetric(horizontal: 20, vertical: 15),
                ),
              ),
            ),
            const SizedBox(height: 20),
            Expanded(
              child: TabBarView(
                controller: _tabController,
                children: [
                  ItemGridView(
                    items: universe.plots,
                    onAdd: () => _addItemWithName(context, TagType.plot),
                    universeId: universeId,
                  ),
                  ItemGridView(
                    items: universe.characters,
                    onAdd: () => _addItemWithName(context, TagType.character),
                    universeId: universeId,
                  ),
                  ItemGridView(
                    items: universe.locations,
                    onAdd: () => _addItemWithName(context, TagType.location),
                    universeId: universeId,
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class ItemGridView extends StatelessWidget {
  final List<dynamic> items;
  final VoidCallback onAdd;
  final String universeId;

  const ItemGridView({
    super.key,
    required this.items,
    required this.onAdd,
    required this.universeId,
  });

  @override
  Widget build(BuildContext context) {
    final provider = Provider.of<UniverseProvider>(context, listen: false);
    return GridView.builder(
      gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 4,
        crossAxisSpacing: 20,
        mainAxisSpacing: 20,
        childAspectRatio: 2.5,
      ),
      itemCount: items.length + 1,
      itemBuilder: (ctx, i) {
        if (i == items.length) {
          return AddItemCard(onTap: onAdd);
        }
        final item = items[i];
        return ItemCard(
          title: item.name,
          subtitle: '마지막 수정: ${item.lastEdited}',
          onTap: () {
            if (item is Character) {
              Navigator.of(context).pushNamed(
                CharacterDetailScreen.routeName,
                arguments: {'universeId': universeId, 'characterId': item.id},
              );
            } else if (item is Plot) {
              Navigator.of(context).pushNamed(
                PlotDetailScreen.routeName,
                arguments: {'universeId': universeId, 'plotId': item.id},
              );
            } else if (item is Location) {
              Navigator.of(context).pushNamed(
                LocationDetailScreen.routeName,
                arguments: {'universeId': universeId, 'locationId': item.id},
              );
            }
          },
          onDelete: () {
            if (item is Character) {
              provider.deleteCharacter(universeId, item.id);
            } else if (item is Plot) {
              provider.deletePlot(universeId, item.id);
            } else if (item is Location) {
              provider.deleteLocation(universeId, item.id);
            }
          },
        );
      },
    );
  }
}

class ItemCard extends StatelessWidget {
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final VoidCallback onDelete;

  const ItemCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.onTap,
    required this.onDelete,
  });

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Stack(
        children: [
          Container(
            width: double.infinity,
            height: double.infinity,
            padding: const EdgeInsets.all(15),
            decoration: BoxDecoration(
              color: Colors.grey[100],
              borderRadius: BorderRadius.circular(10),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                      fontWeight: FontWeight.bold, fontSize: 16),
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 5),
                Text(
                  subtitle,
                  style: TextStyle(color: Colors.grey[600], fontSize: 12),
                ),
              ],
            ),
          ),
          Positioned(
            top: 4,
            right: 4,
            child: IconButton(
              icon: Icon(Icons.close, color: Colors.grey[600], size: 18),
              onPressed: () {
                showDialog(
                  context: context,
                  builder: (ctx) => AlertDialog(
                    title: const Text('삭제 확인'),
                    content: Text('\'$title\' 항목을 정말 삭제하시겠습니까?'),
                    actions: [
                      TextButton(
                        child: const Text('취소'),
                        onPressed: () => Navigator.of(ctx).pop(),
                      ),
                      TextButton(
                        child: const Text('삭제',
                            style: TextStyle(color: Colors.red)),
                        onPressed: () {
                          onDelete();
                          Navigator.of(ctx).pop();
                        },
                      ),
                    ],
                  ),
                );
              },
            ),
          ),
        ],
      ),
    );
  }
}

class AddItemCard extends StatelessWidget {
  final VoidCallback onTap;
  const AddItemCard({super.key, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: Colors.grey.shade300,
            style: BorderStyle.solid,
          ),
        ),
        child: Icon(Icons.add, size: 40, color: Colors.grey.shade500),
      ),
    );
  }
}
