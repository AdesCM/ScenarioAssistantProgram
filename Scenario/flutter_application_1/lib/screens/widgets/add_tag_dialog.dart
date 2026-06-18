import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../../providers/universe_provider.dart';

class AddTagDialog extends StatefulWidget {
  final String universeId;
  final Function(dynamic item, TagType type, String? name) onTagSelected;

  const AddTagDialog({
    super.key,
    required this.universeId,
    required this.onTagSelected,
  });

  @override
  State<AddTagDialog> createState() => _AddTagDialogState();
}

class _AddTagDialogState extends State<AddTagDialog> {
  TagType? _selectedType;
  dynamic _selectedItem;
  String _newItemName = '';
  final _textController = TextEditingController();

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  Widget _buildStep1_SelectType() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: [
        ListTile(
          title: const Text('캐릭터 태그 추가'),
          onTap: () => setState(() => _selectedType = TagType.character),
        ),
        ListTile(
          title: const Text('플롯 태그 추가'),
          onTap: () => setState(() => _selectedType = TagType.plot),
        ),
        ListTile(
          title: const Text('장소 태그 추가'),
          onTap: () => setState(() => _selectedType = TagType.location),
        ),
      ],
    );
  }

  Widget _buildStep2_SelectItem() {
    final provider = Provider.of<UniverseProvider>(context, listen: false);
    final universe = provider.findById(widget.universeId);
    List<dynamic> items;
    String title;

    switch (_selectedType!) {
      case TagType.character:
        items = universe.characters;
        title = '캐릭터 선택';
        break;
      case TagType.plot:
        items = universe.plots;
        title = '플롯 선택';
        break;
      case TagType.location:
        items = universe.locations;
        title = '장소 선택';
        break;
    }

    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleLarge),
        const SizedBox(height: 10),
        // 새 항목 생성 필드
        TextField(
          controller: _textController,
          decoration: InputDecoration(
            labelText: '새 $title 생성',
            suffixIcon: IconButton(
              icon: const Icon(Icons.add_box),
              onPressed: () {
                if (_textController.text.isNotEmpty) {
                  widget.onTagSelected(
                      null, _selectedType!, _textController.text);
                  Navigator.of(context).pop();
                }
              },
            ),
          ),
          onChanged: (value) => _newItemName = value,
        ),
        const SizedBox(height: 10),
        const Text('또는 기존 항목에서 선택:'),
        // 기존 항목 리스트
        SizedBox(
          height: 200, // 리스트 높이 제한
          width: 300, // 다이얼로그 너비
          child: ListView.builder(
            itemCount: items.length,
            itemBuilder: (ctx, index) {
              final item = items[index];
              return ListTile(
                title: Text(item.name),
                onTap: () {
                  widget.onTagSelected(item, _selectedType!, null);
                  Navigator.of(context).pop();
                },
              );
            },
          ),
        ),
      ],
    );
  }

  @override
  Widget build(BuildContext context) {
    return AlertDialog(
      title: const Text('태그 추가'),
      content: _selectedType == null
          ? _buildStep1_SelectType()
          : _buildStep2_SelectItem(),
      actions: [
        TextButton(
          child: Text(_selectedType == null ? '취소' : '뒤로'),
          onPressed: () {
            if (_selectedType == null) {
              Navigator.of(context).pop();
            } else {
              setState(() => _selectedType = null);
            }
          },
        ),
      ],
    );
  }
}
