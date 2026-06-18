import 'package:flutter/material.dart';
import 'package:uuid/uuid.dart';
import 'dart:convert';
import '../models/universe.dart';
import '../models/character.dart';
import '../models/plot.dart';
import '../models/location.dart';
import '../models/timeline_event.dart'; // TimelineEvent 모델 import 필수

// --- TagType Enum and TagLink Class ---
enum TagType { character, plot, location }

class TagLink {
  final String id;
  final String linkedItemId;
  final String displayName;
  final TagType type;

  TagLink({
    required this.id,
    required this.linkedItemId,
    required this.displayName,
    required this.type,
  });

  Map<String, dynamic> toJson() => {
        'id': id,
        'linkedItemId': linkedItemId,
        'displayName': displayName,
        'type': type.toString(),
      };

  factory TagLink.fromJson(Map<String, dynamic> json) => TagLink(
        id: json['id'],
        linkedItemId: json['linkedItemId'],
        displayName: json['displayName'],
        type: TagType.values.firstWhere((e) => e.toString() == json['type']),
      );
}

class UniverseProvider with ChangeNotifier {
  final List<Universe> _universes = [
    Universe(
      id: 'hong_gildong_revive',
      name: '홍길동전 리바이브',
      lastEditedBy: '홍길동',
      characters: [
        Character(
          id: 'char_hong',
          name: '홍길동',
          lastEdited: '2025/09/01',
          imageUrl:
              'https://placehold.co/400x600/5f6368/FFFFFF?text=Hong+Gildong',
          details: {
            '이름': '홍길동',
            '메인 키워드': '정의로움, 선함, 순수함',
            '성별': '남성',
            '나이': '15-17세',
            '1인칭 호칭': '이 몸은',
            // --- [추가됨] 타임라인 테스트 데이터 ---
            '출생년도': '1443',
            '생일': '5월 5일',
            // ----------------------------------
            '참여 플롯': jsonEncode([
              TagLink(
                id: const Uuid().v4(),
                linkedItemId: 'plot_tamgwan',
                displayName: '탐관오리 벌하기',
                type: TagType.plot,
              ).toJson(),
            ]),
          },
        ),
      ],
      plots: [
        Plot(
          id: 'plot_tamgwan',
          name: '탐관오리 벌하기',
          lastEdited: '2025/09/01',
          imageUrl:
              'https://placehold.co/600x400/5f6368/FFFFFF?text=Plot+Image',
          details: {
            '이름': '탐관오리 벌하기',
            '소개': '홍길동이 도술을 익힌 후 마을을 거닐다...',
            // --- [추가됨] 타임라인 테스트 데이터 ---
            '사건년도': '1557',
            '사건일': '10월 30일',
            // ----------------------------------
            '플롯의 전개 장소': jsonEncode([
              TagLink(
                id: const Uuid().v4(),
                linkedItemId: 'loc_hong_house',
                displayName: '홍판서의 집',
                type: TagType.location,
              ).toJson(),
            ]),
            '참여 캐릭터': jsonEncode([
              TagLink(
                id: const Uuid().v4(),
                linkedItemId: 'char_hong',
                displayName: '홍길동',
                type: TagType.character,
              ).toJson(),
            ]),
            '전개': '집을 나와 도술을 익힌 후 아버지를 뵈러 집으로 가 인사를 드린 후 시장으로 나와서 산책 중',
            '위기': '시장상인을 못 살게 구는 고리대금업자들을 발견하여...',
            '절정': '그 고리대금업자들의 최종 우두머리는 해당 관할구역 탐관오리의 시장이었고...',
            '결말': '홍길동은 그들을 벌하고 그들이 가지고 있던 재물들을 백성들에게 나눠준다.',
          },
        ),
      ],
      locations: [
        Location(
          id: 'loc_hong_house',
          name: '홍판서의 집',
          lastEdited: '2025/09/01',
          imageUrl: 'https://placehold.co/600x400/5f6368/FFFFFF?text=House',
          details: {
            '이름': '홍판서의 집',
            '인구': '노비포함 24명 정도가 거주하고 있다.',
            '종류': '일반적인 거주지',
            '건축 스타일': '조선풍의 정석적인 기와집에 스팀펑크적 분위기 추가.',
            '발생 플롯': jsonEncode([
              TagLink(
                id: const Uuid().v4(),
                linkedItemId: 'plot_tamgwan',
                displayName: '탐관오리 벌하기',
                type: TagType.plot,
              ).toJson(),
            ]),
          },
        ),
      ],
    ),
  ];

  var uuid = const Uuid();

  List<Universe> get universes => [..._universes];

  Universe findById(String id) {
    return _universes.firstWhere((uni) => uni.id == id,
        orElse: () => throw Exception('Universe not found'));
  }

  void addUniverse() {
    final newUniverse = Universe(
      id: uuid.v4(),
      name: '새로운 세계관',
      lastEditedBy: '사용자',
    );
    _universes.add(newUniverse);
    notifyListeners();
  }

  void deleteUniverse(String id) {
    _universes.removeWhere((uni) => uni.id == id);
    notifyListeners();
  }

  Character addCharacter(String universeId, String name) {
    final universe = findById(universeId);
    final newChar = Character(
      id: uuid.v4(),
      name: name,
      lastEdited: DateTime.now()
          .toIso8601String()
          .substring(0, 10)
          .replaceAll('-', '/'),
      details: {'이름': name},
    );
    universe.characters.add(newChar);
    notifyListeners();
    return newChar;
  }

  Plot addPlot(String universeId, String name) {
    final universe = findById(universeId);
    final newPlot = Plot(
      id: uuid.v4(),
      name: name,
      lastEdited: DateTime.now()
          .toIso8601String()
          .substring(0, 10)
          .replaceAll('-', '/'),
      details: {'이름': name},
    );
    universe.plots.add(newPlot);
    notifyListeners();
    return newPlot;
  }

  Location addLocation(String universeId, String name) {
    final universe = findById(universeId);
    final newLoc = Location(
      id: uuid.v4(),
      name: name,
      lastEdited: DateTime.now()
          .toIso8601String()
          .substring(0, 10)
          .replaceAll('-', '/'),
      details: {'이름': name},
    );
    universe.locations.add(newLoc);
    notifyListeners();
    return newLoc;
  }

  void deleteCharacter(String universeId, String characterId) {
    final universe = findById(universeId);
    universe.characters.removeWhere((char) => char.id == characterId);
    notifyListeners();
  }

  void updateCharacter(String universeId, Character updatedCharacter) {
    final universe = findById(universeId);
    final charIndex = universe.characters
        .indexWhere((char) => char.id == updatedCharacter.id);
    if (charIndex >= 0) {
      universe.characters[charIndex] = updatedCharacter;
      notifyListeners();
    }
  }

  void deletePlot(String universeId, String plotId) {
    final universe = findById(universeId);
    universe.plots.removeWhere((plot) => plot.id == plotId);
    notifyListeners();
  }

  void updatePlot(String universeId, Plot updatedPlot) {
    final universe = findById(universeId);
    final plotIndex = universe.plots.indexWhere((p) => p.id == updatedPlot.id);
    if (plotIndex >= 0) {
      universe.plots[plotIndex] = updatedPlot;
      notifyListeners();
    }
  }

  void deleteLocation(String universeId, String locationId) {
    final universe = findById(universeId);
    universe.locations.removeWhere((loc) => loc.id == locationId);
    notifyListeners();
  }

  void updateLocation(String universeId, Location updatedLocation) {
    final universe = findById(universeId);
    final locIndex =
        universe.locations.indexWhere((l) => l.id == updatedLocation.id);
    if (locIndex >= 0) {
      universe.locations[locIndex] = updatedLocation;
      notifyListeners();
    }
  }

  // --- 타임라인 데이터 생성 및 파싱 로직 ---

  List<TimelineEvent> getTimelineEvents(String universeId,
      {bool showPlots = true, bool showCharacters = true}) {
    final universe = findById(universeId);
    List<TimelineEvent> events = [];

    // 1. 캐릭터 데이터 파싱
    if (showCharacters) {
      for (var char in universe.characters) {
        if (char.details.containsKey('출생년도') &&
            char.details.containsKey('생일')) {
          try {
            int year = _parseYear(char.details['출생년도']!);
            List<int?> dateParts = _parseDate(char.details['생일']!);

            events.add(TimelineEvent(
              id: char.id,
              title: '${char.name} 탄생',
              description: '캐릭터 탄생일',
              year: year,
              month: dateParts[0],
              day: dateParts[1],
              type: EventType.character,
            ));
          } catch (e) {
            print('Character date parsing error: $e');
          }
        }
      }
    }

    // 2. 플롯 데이터 파싱
    if (showPlots) {
      for (var plot in universe.plots) {
        if (plot.details.containsKey('사건년도') &&
            plot.details.containsKey('사건일')) {
          try {
            int year = _parseYear(plot.details['사건년도']!);
            List<int?> dateParts = _parseDate(plot.details['사건일']!);

            events.add(TimelineEvent(
              id: plot.id,
              title: plot.name,
              description: plot.details['소개'] ?? '사건 발생',
              year: year,
              month: dateParts[0],
              day: dateParts[1],
              type: EventType.plot,
            ));
          } catch (e) {
            print('Plot date parsing error: $e');
          }
        }
      }
    }

    events.sort((a, b) => a.compareTo(b));
    return events;
  }

  int _parseYear(String yearStr) {
    bool isBC = yearStr.contains('기원전') || yearStr.toUpperCase().contains('BC');
    String numStr = yearStr.replaceAll(RegExp(r'[^0-9-]'), '');
    int year = int.tryParse(numStr) ?? 0;
    if (isBC) {
      year = -year.abs();
    }
    return year;
  }

  List<int?> _parseDate(String dateStr) {
    List<String> parts = dateStr.split(RegExp(r'[^0-9]'));
    parts.removeWhere((element) => element.isEmpty);

    int? month;
    int? day;

    if (parts.isNotEmpty) month = int.tryParse(parts[0]);
    if (parts.length > 1) day = int.tryParse(parts[1]);

    return [month, day];
  }

  // ==========================================================
  // [NEW] JSON 데이터 일괄 등록 및 파싱 로직
  // ==========================================================
  void importDataFromJson(String universeId, String jsonString) {
    final universe = findById(universeId);
    final Map<String, dynamic> data = jsonDecode(jsonString);

    // 1. 임시 저장소 (이름으로 ID를 찾기 위함)
    Map<String, String> nameToIdMap = {};

    // --- 1차 패스: 객체 생성 및 기본 데이터 입력 ---

    // 1-1. 캐릭터 생성
    if (data['characters'] != null) {
      for (var item in data['characters']) {
        String id = uuid.v4();
        String name = item['name'] ?? '이름 없음';
        nameToIdMap[name] = id; // 이름-ID 매핑 저장

        Map<String, String> details = {
          '이름': name,
          '성별': item['gender'] ?? '',
          '나이': item['age'] ?? '',
          '1인칭 호칭': item['first_person_pronoun'] ?? '',
          '좋아하는 것': (item['likes'] as List?)?.join(', ') ?? '',
          '싫어하는 것': (item['dislikes'] as List?)?.join(', ') ?? '',
          '취미': (item['hobbies'] as List?)?.join(', ') ?? '',
          '메인 키워드': (item['main_keywords'] as List?)?.join(', ') ?? '',
        };
        // null이거나 빈 값 제거
        details.removeWhere((key, value) => value.isEmpty);

        universe.characters.add(Character(
          id: id,
          name: name,
          lastEdited: DateTime.now()
              .toIso8601String()
              .substring(0, 10)
              .replaceAll('-', '/'),
          imageUrl:
              'https://placehold.co/400x600/5f6368/FFFFFF?text=${Uri.encodeComponent(name)}', // 임시 이미지
          details: details,
        ));
      }
    }

    // 1-2. 플롯 생성
    if (data['plots'] != null) {
      for (var item in data['plots']) {
        String id = uuid.v4();
        String title = item['title'] ?? '제목 없음';
        nameToIdMap[title] = id;

        Map<String, String> details = {
          '이름': title,
          '요약': item['summary'] ?? '',
          '사건년도': item['event_year'] ?? '',
          '사건일': item['event_date'] ?? '',
          '전개': item['exposition'] ?? '',
          '위기': item['crisis'] ?? '',
          '절정': item['climax'] ?? '',
          '결말': item['resolution'] ?? '',
        };
        details.removeWhere((key, value) => value.isEmpty);

        universe.plots.add(Plot(
          id: id,
          name: title,
          lastEdited: DateTime.now()
              .toIso8601String()
              .substring(0, 10)
              .replaceAll('-', '/'),
          imageUrl:
              'https://placehold.co/600x400/5f6368/FFFFFF?text=${Uri.encodeComponent(title)}',
          details: details,
        ));
      }
    }

    // 1-3. 장소 생성
    if (data['locations'] != null) {
      for (var item in data['locations']) {
        String id = uuid.v4();
        String name = item['name'] ?? '장소 없음';
        nameToIdMap[name] = id;

        Map<String, String> details = {
          '이름': name,
          '인구': item['population'] ?? '',
          '종류': item['type'] ?? '',
          '건축 스타일': item['architectural_style'] ?? '',
        };
        details.removeWhere((key, value) => value.isEmpty);

        universe.locations.add(Location(
          id: id,
          name: name,
          lastEdited: DateTime.now()
              .toIso8601String()
              .substring(0, 10)
              .replaceAll('-', '/'),
          imageUrl:
              'https://placehold.co/600x400/5f6368/FFFFFF?text=${Uri.encodeComponent(name)}',
          details: details,
        ));
      }
    }

    // --- 2차 패스: 태그(관계) 연결 ---
    // 이름으로 ID를 찾아 TagLink를 생성하고 details에 JSON 문자열로 저장

    // 2-1. 캐릭터의 '참여 플롯' 연결
    if (data['characters'] != null) {
      for (var item in data['characters']) {
        if (item['participating_plots'] != null) {
          String charName = item['name'];
          // 방금 추가된 캐릭터 객체 찾기
          var charObj =
              universe.characters.firstWhere((c) => c.name == charName);

          List<TagLink> tags = [];
          for (String plotName in item['participating_plots']) {
            if (nameToIdMap.containsKey(plotName)) {
              tags.add(TagLink(
                id: uuid.v4(),
                linkedItemId: nameToIdMap[plotName]!,
                displayName: plotName,
                type: TagType.plot,
              ));
            }
          }
          if (tags.isNotEmpty) {
            charObj.details['참여 플롯'] =
                jsonEncode(tags.map((e) => e.toJson()).toList());
          }
        }
      }
    }

    // 2-2. 플롯의 '참여 캐릭터', '장소' 연결
    if (data['plots'] != null) {
      for (var item in data['plots']) {
        String plotTitle = item['title'];
        var plotObj = universe.plots.firstWhere((p) => p.name == plotTitle);

        // 참여 캐릭터 연결
        if (item['participating_characters'] != null) {
          List<TagLink> charTags = [];
          for (String charName in item['participating_characters']) {
            if (nameToIdMap.containsKey(charName)) {
              charTags.add(TagLink(
                id: uuid.v4(),
                linkedItemId: nameToIdMap[charName]!,
                displayName: charName,
                type: TagType.character,
              ));
            }
          }
          if (charTags.isNotEmpty) {
            plotObj.details['참여 캐릭터'] =
                jsonEncode(charTags.map((e) => e.toJson()).toList());
          }
        }

        // 장소 연결 (1개지만 태그 리스트로 처리)
        if (item['location'] != null) {
          String locName = item['location'];
          if (nameToIdMap.containsKey(locName)) {
            List<TagLink> locTags = [
              TagLink(
                id: uuid.v4(),
                linkedItemId: nameToIdMap[locName]!,
                displayName: locName,
                type: TagType.location,
              )
            ];
            plotObj.details['플롯의 전개 장소'] =
                jsonEncode(locTags.map((e) => e.toJson()).toList());
          }
        }
      }
    }

    // 2-3. 장소의 '발생 플롯' 연결
    if (data['locations'] != null) {
      for (var item in data['locations']) {
        if (item['occurring_plots'] != null) {
          String locName = item['name'];
          var locObj = universe.locations.firstWhere((l) => l.name == locName);

          List<TagLink> plotTags = [];
          for (String plotName in item['occurring_plots']) {
            if (nameToIdMap.containsKey(plotName)) {
              plotTags.add(TagLink(
                id: uuid.v4(),
                linkedItemId: nameToIdMap[plotName]!,
                displayName: plotName,
                type: TagType.plot,
              ));
            }
          }
          if (plotTags.isNotEmpty) {
            locObj.details['발생 플롯'] =
                jsonEncode(plotTags.map((e) => e.toJson()).toList());
          }
        }
      }
    }

    notifyListeners();
  }
}
