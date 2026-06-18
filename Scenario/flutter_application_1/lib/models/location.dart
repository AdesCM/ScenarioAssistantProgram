class Location {
  String id;
  String name;
  String lastEdited;
  String imageUrl; // <-- 이미지 URL 필드 추가
  Map<String, String> details;

  Location({
    required this.id,
    required this.name,
    required this.lastEdited,
    String? imageUrl, // <-- 생성자에 추가
    Map<String, String>? details,
  })  : details = details ?? {},
        imageUrl =
            imageUrl ?? 'https://placehold.co/400x600/5f6368/FFFFFF?text=Image';
}
