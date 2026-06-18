class Character {
  String id;
  String name;
  String lastEdited;
  String imageUrl;
  Map<String, String> details;

  Character({
    required this.id,
    required this.name,
    required this.lastEdited,
    String? imageUrl, // 1. required를 지우고, 값이 없을 수 있다는 의미로 '?'(nullable)를 추가합니다.
    Map<String, String>? details,
  })  : details = details ?? {},
        // 2. 만약 imageUrl이 null이거나 비어있으면, 기본 플레이스홀더 주소를 할당합니다.
        imageUrl =
            imageUrl ?? 'https://placehold.co/400x600/5f6368/FFFFFF?text=Image';
}
