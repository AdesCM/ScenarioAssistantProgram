import 'character.dart';
import 'plot.dart';
import 'location.dart';

class Universe {
  String id;
  String name;
  String lastEditedBy;
  String iconAsset;
  List<Character> characters;
  List<Plot> plots;
  List<Location> locations;

  Universe({
    required this.id,
    required this.name,
    required this.lastEditedBy,
    this.iconAsset = 'assets/placeholder_icon.png', // 예시 아이콘 경로
    List<Character>? characters,
    List<Plot>? plots,
    List<Location>? locations,
  })  : characters = characters ?? [],
        plots = plots ?? [],
        locations = locations ?? [];
}
