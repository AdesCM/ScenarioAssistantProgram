import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'dart:convert';
import 'package:uuid/uuid.dart';
import '../../providers/universe_provider.dart';
import '../character_detail_screen.dart';
import '../plot_detail_screen.dart';
import '../location_detail_screen.dart';
import './add_tag_dialog.dart';

class TagElementWidget extends StatefulWidget {
  final String universeId;
  final TextEditingController keyController;
  final TextEditingController valueController;
  // initialTags 제거됨
  final VoidCallback onRemove;

  const TagElementWidget({
    super.key,
    required this.universeId,
    required this.keyController,
    required this.valueController,
    required this.onRemove,
  });

  @override
  State<TagElementWidget> createState() => _TagElementWidgetState();
}

class _TagElementWidgetState extends State<TagElementWidget> {
  // --- late 제거하고 빈 리스트로 즉시 초기화 ---
  List<TagLink> _tags = [];

  @override
  void initState() {
    super.initState();
    _parseTagsFromController(); // initState에서 파싱 시도
    widget.valueController.addListener(_parseTagsFromController);
  }

  void _parseTagsFromController() {
    if (!mounted) return;

    List<TagLink> newTags = []; // 임시 리스트
    try {
      final text = widget.valueController.text;
      if (text.isNotEmpty && text != '[]') {
        var decoded = jsonDecode(text) as List;
        newTags = decoded
            .where((item) => item is Map<String, dynamic>)
            .map((item) => TagLink.fromJson(item as Map<String, dynamic>))
            .toList();
      }
      // 이전 상태와 비교 (listEquals는 이제 필요 없음, 직접 할당)
      // listEquals 로직은 TagLink 객체 비교가 복잡하므로, 무조건 setState 호출 (단순화)
      // if (!listEquals(_tags, newTags)) {
      //     setState(() { _tags = newTags; });
      // }
      // 파싱 성공 시에만 setState 호출하도록 변경
      if (mounted) {
        // 비동기 작업 후에도 위젯이 유효한지 확인
        setState(() {
          _tags = newTags;
        });
      }
    } catch (e) {
      print("Error decoding tags from controller: $e");
      print("Value being decoded: ${widget.valueController.text}");
      // 오류 발생 시 빈 리스트 유지 (이미 _tags = []로 초기화됨)
      if (mounted && _tags.isNotEmpty) {
        // 오류 발생했는데 _tags가 비어있지 않다면 비움
        setState(() {
          _tags = [];
        });
      }
    }
  }

  // listEquals 함수 제거

  @override
  void dispose() {
    widget.valueController.removeListener(_parseTagsFromController);
    super.dispose();
  }

  void _updateValueController() {
    String jsonString = jsonEncode(_tags.map((tag) => tag.toJson()).toList());
    if (widget.valueController.text != jsonString) {
      widget.valueController.text = jsonString;
      print("Updated valueController: ${widget.valueController.text}");
    }
  }

  void _addTag(TagLink newTag) {
    if (!_tags.any((tag) => tag.linkedItemId == newTag.linkedItemId)) {
      // setState 내부에서 리스트 수정 및 컨트롤러 업데이트
      setState(() {
        _tags.add(newTag);
        _updateValueController(); // 컨트롤러 업데이트 동기화
      });
    } else {
      print("Tag already exists: ${newTag.displayName}");
    }
  }

  void _removeTag(String tagLinkId) {
    // setState 내부에서 리스트 수정 및 컨트롤러 업데이트
    setState(() {
      _tags.removeWhere((tag) => tag.id == tagLinkId);
      _updateValueController(); // 컨트롤러 업데이트 동기화
    });
  }

  void _navigateToTag(TagLink tag) {
    // ... (기존 내비게이션 로직)
    String routeName;
    Object arguments;

    switch (tag.type) {
      case TagType.character:
        routeName = CharacterDetailScreen.routeName;
        arguments = {
          'universeId': widget.universeId,
          'characterId': tag.linkedItemId
        };
        break;
      case TagType.plot:
        routeName = PlotDetailScreen.routeName;
        arguments = {
          'universeId': widget.universeId,
          'plotId': tag.linkedItemId
        };
        break;
      case TagType.location:
        routeName = LocationDetailScreen.routeName;
        arguments = {
          'universeId': widget.universeId,
          'locationId': tag.linkedItemId
        };
        break;
    }
    final currentRoute = ModalRoute.of(context)?.settings.name;
    final currentArgs =
        ModalRoute.of(context)?.settings.arguments as Map<String, String>?;

    bool shouldNavigate = true;
    if (currentRoute == routeName && currentArgs != null) {
      if (tag.type == TagType.character &&
          currentArgs['characterId'] == tag.linkedItemId)
        shouldNavigate = false;
      if (tag.type == TagType.plot && currentArgs['plotId'] == tag.linkedItemId)
        shouldNavigate = false;
      if (tag.type == TagType.location &&
          currentArgs['locationId'] == tag.linkedItemId) shouldNavigate = false;
    }

    if (shouldNavigate) {
      Navigator.of(context).pushNamed(routeName, arguments: arguments);
    } else {
      print(
          "Navigation prevented: Already on the target page (${tag.displayName}).");
    }
  }

  void _openAddTagDialog() {
    // ... (기존 다이얼로그 로직)
    showDialog(
      context: context,
      builder: (ctx) => AddTagDialog(
        universeId: widget.universeId,
        onTagSelected: (item, type, name) {
          late TagLink newTag;
          if (item != null) {
            newTag = TagLink(
              id: const Uuid().v4(),
              linkedItemId: item.id,
              displayName: item.name,
              type: type,
            );
            _addTag(newTag);
          } else {
            final provider =
                Provider.of<UniverseProvider>(context, listen: false);
            String newItemId = '';
            if (name != null && name.isNotEmpty) {
              if (type == TagType.character) {
                newItemId = provider.addCharacter(widget.universeId, name).id;
              } else if (type == TagType.plot) {
                newItemId = provider.addPlot(widget.universeId, name).id;
              } else if (type == TagType.location) {
                newItemId = provider.addLocation(widget.universeId, name).id;
              }
              newTag = TagLink(
                id: const Uuid().v4(),
                linkedItemId: newItemId,
                displayName: name,
                type: type,
              );
              _addTag(newTag);
            } else {
              print("New item name cannot be empty.");
              return;
            }
          }
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    // build 메서드에서는 _tags 상태를 직접 사용
    return Padding(
      padding: const EdgeInsets.only(bottom: 12.0),
      child: Row(
        children: [
          Expanded(
            flex: 2,
            child: TextFormField(
              controller: widget.keyController,
              decoration: const InputDecoration(
                  labelText: '요소 이름', border: OutlineInputBorder()),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            flex: 3,
            child: Container(
              padding: const EdgeInsets.all(8),
              decoration: BoxDecoration(
                border: Border.all(color: Colors.grey),
                borderRadius: BorderRadius.circular(4),
              ),
              child: Wrap(
                spacing: 6.0,
                runSpacing: 4.0,
                crossAxisAlignment: WrapCrossAlignment.center,
                children: [
                  ..._tags.map((tag) {
                    // _tags 상태 사용
                    return InputChip(
                      label: Text(tag.displayName),
                      onPressed: () => _navigateToTag(tag),
                      onDeleted: () => _removeTag(tag.id),
                      deleteIcon: const Icon(Icons.close, size: 18),
                      materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      padding: const EdgeInsets.symmetric(horizontal: 4.0),
                    );
                  }).toList(),
                  IconButton(
                    icon: const Icon(Icons.add_circle_outline, size: 24),
                    padding: EdgeInsets.zero,
                    constraints: const BoxConstraints(),
                    tooltip: '태그 추가',
                    onPressed: _openAddTagDialog,
                  ),
                ],
              ),
            ),
          ),
          IconButton(
            icon: const Icon(Icons.remove_circle_outline),
            tooltip: '요소 삭제',
            onPressed: widget.onRemove,
          ),
        ],
      ),
    );
  }
}
