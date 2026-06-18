import 'dart:io';
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';
import 'package:provider/provider.dart';
import 'dart:convert';
import '../models/location.dart';
import '../providers/universe_provider.dart';
import './widgets/element_renderer.dart';

class LocationDetailScreen extends StatefulWidget {
  static const routeName = '/location-detail';
  const LocationDetailScreen({super.key});

  @override
  State<LocationDetailScreen> createState() => _LocationDetailScreenState();
}

class _LocationDetailScreenState extends State<LocationDetailScreen> {
  late String _universeId;
  late Location _location;
  bool _isInit = true;

  final List<TextEditingController> _keyControllers = [];
  final List<TextEditingController> _valueControllers = [];

  final TextEditingController _searchController = TextEditingController();
  String _searchQuery = '';
  List<int> _filteredIndices = [];

  File? _pickedImage;
  String? _currentImageUrl;

  @override
  void initState() {
    super.initState();
    _searchController.addListener(() {
      if (_searchQuery != _searchController.text) {
        _searchQuery = _searchController.text;
        _filterElements();
      }
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_isInit) {
      final args =
          ModalRoute.of(context)!.settings.arguments as Map<String, String>;
      _universeId = args['universeId']!;
      final locationId = args['locationId']!;
      final universe = Provider.of<UniverseProvider>(context, listen: false)
          .findById(_universeId);
      _location = universe.locations.firstWhere((loc) => loc.id == locationId);
      _currentImageUrl = _location.imageUrl;

      _location.details.forEach((key, value) {
        _keyControllers.add(TextEditingController(text: key));
        _valueControllers.add(TextEditingController(text: value));
      });
      _filterElements();
      _isInit = false;
    }
  }

  void _filterElements() {
    final query = _searchController.text.toLowerCase();
    setState(() {
      if (query.isEmpty) {
        _filteredIndices =
            List.generate(_keyControllers.length, (index) => index);
      } else {
        _filteredIndices = [];
        for (int i = 0; i < _keyControllers.length; i++) {
          if (i < _keyControllers.length && i < _valueControllers.length) {
            final key = _keyControllers[i].text.toLowerCase();
            final value = _valueControllers[i].text.toLowerCase();
            if (key.contains(query) || value.contains(query)) {
              _filteredIndices.add(i);
            }
          }
        }
      }
    });
  }

  @override
  void dispose() {
    _searchController.dispose();
    for (var controller in _keyControllers) {
      controller.dispose();
    }
    for (var controller in _valueControllers) {
      controller.dispose();
    }
    super.dispose();
  }

  Future<void> _pickImage() async {
    final picker = ImagePicker();
    final pickedImageFile = await picker.pickImage(
        source: ImageSource.gallery, imageQuality: 80, maxWidth: 800);
    if (pickedImageFile != null) {
      setState(() {
        _pickedImage = File(pickedImageFile.path);
      });
    }
  }

  void _addNewElement() {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('새 요소 추가'),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              title: const Text('일반 텍스트 요소'),
              onTap: () {
                setState(() {
                  _keyControllers.add(TextEditingController());
                  _valueControllers.add(TextEditingController());
                });
                _filterElements();
                Navigator.of(ctx).pop();
              },
            ),
            ListTile(
              title: const Text('태그 요소'),
              onTap: () {
                setState(() {
                  _keyControllers.add(TextEditingController());
                  _valueControllers.add(TextEditingController(text: '[]'));
                });
                _filterElements();
                Navigator.of(ctx).pop();
              },
            ),
          ],
        ),
      ),
    );
  }

  void _removeElement(int index) {
    if (index < 0 || index >= _keyControllers.length) return;
    _keyControllers[index].dispose();
    _valueControllers[index].dispose();
    setState(() {
      _keyControllers.removeAt(index);
      _valueControllers.removeAt(index);
    });
    _filterElements();
  }

  void _saveForm() {
    final Map<String, String> updatedDetails = {};
    for (int i = 0; i < _keyControllers.length; i++) {
      if (i < _keyControllers.length && i < _valueControllers.length) {
        final key = _keyControllers[i].text;
        final value = _valueControllers[i].text;
        if (key.isNotEmpty) {
          updatedDetails[key] = value;
        }
      }
    }

    final updatedLocation = Location(
      id: _location.id,
      name: updatedDetails['이름'] ?? _location.name,
      lastEdited: DateTime.now()
          .toIso8601String()
          .substring(0, 10)
          .replaceAll('-', '/'),
      imageUrl: _pickedImage?.path ?? _currentImageUrl!,
      details: updatedDetails,
    );

    Provider.of<UniverseProvider>(context, listen: false)
        .updateLocation(_universeId, updatedLocation);
    Navigator.of(context).pop();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('${_location.name} 정보'),
        actions: [
          IconButton(icon: const Icon(Icons.save), onPressed: _saveForm)
        ],
      ),
      body: Padding(
        padding: const EdgeInsets.all(24.0),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(
              flex: 3,
              child: Padding(
                padding: const EdgeInsets.only(right: 24.0),
                child: GestureDetector(
                  onTap: _pickImage,
                  child: AspectRatio(
                    aspectRatio: 3 / 2,
                    child: Container(
                      decoration: BoxDecoration(
                          border: Border.all(color: Colors.grey.shade300),
                          borderRadius: BorderRadius.circular(12)),
                      clipBehavior: Clip.antiAlias,
                      child: _buildImageWidget(),
                    ),
                  ),
                ),
              ),
            ),
            Expanded(
              flex: 5,
              child: Column(
                children: [
                  TextField(
                    controller: _searchController,
                    decoration: InputDecoration(
                      hintText: '요소 검색...',
                      prefixIcon: const Icon(Icons.search),
                      border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(12),
                          borderSide: BorderSide.none),
                      filled: true,
                      fillColor: Colors.grey[200],
                    ),
                  ),
                  const SizedBox(height: 16),
                  Row(
                    mainAxisAlignment: MainAxisAlignment.end,
                    children: [
                      ElevatedButton.icon(
                        onPressed: _addNewElement,
                        icon: const Icon(Icons.add),
                        label: const Text('커스텀 요소 추가'),
                        style: ElevatedButton.styleFrom(
                            backgroundColor: Colors.black,
                            foregroundColor: Colors.white,
                            padding: const EdgeInsets.symmetric(
                                horizontal: 16, vertical: 12)),
                      ),
                    ],
                  ),
                  const SizedBox(height: 16),
                  Expanded(
                    child: ListView.builder(
                      itemCount: _filteredIndices.length,
                      itemBuilder: (ctx, index) {
                        final originalIndex = _filteredIndices[index];
                        if (originalIndex < 0 ||
                            originalIndex >= _keyControllers.length) {
                          return const SizedBox.shrink();
                        }
                        return ElementRenderer(
                          key: ValueKey(_keyControllers[originalIndex]),
                          universeId: _universeId,
                          keyController: _keyControllers[originalIndex],
                          valueController: _valueControllers[originalIndex],
                          onRemove: () => _removeElement(originalIndex),
                        );
                      },
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildImageWidget() {
    if (_pickedImage != null) {
      return Image.file(_pickedImage!, fit: BoxFit.cover);
    }
    if (_currentImageUrl != null && !_currentImageUrl!.startsWith('http')) {
      final file = File(_currentImageUrl!);
      if (file.existsSync()) {
        return Image.file(file, fit: BoxFit.cover);
      } else {
        return const Center(
            child: Icon(Icons.broken_image_outlined,
                size: 48, color: Colors.grey));
      }
    }
    if (_currentImageUrl != null && _currentImageUrl!.startsWith('http')) {
      return Image.network(
        _currentImageUrl!,
        fit: BoxFit.cover,
        loadingBuilder: (context, child, progress) {
          return progress == null
              ? child
              : const Center(child: CircularProgressIndicator());
        },
        errorBuilder: (context, error, stackTrace) {
          return const Center(
              child: Icon(Icons.broken_image_outlined, size: 48));
        },
      );
    }
    return const Center(
        child: Icon(Icons.add_a_photo_outlined, size: 48, color: Colors.grey));
  }
}
