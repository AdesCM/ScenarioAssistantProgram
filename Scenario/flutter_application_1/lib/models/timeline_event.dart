enum EventType { character, plot }

class TimelineEvent {
  final String id;
  final String title;
  final String description; // 생일 축하, 사건 내용 등
  final int year;
  final int? month;
  final int? day;
  final EventType type;

  TimelineEvent({
    required this.id,
    required this.title,
    required this.description,
    required this.year,
    this.month,
    this.day,
    required this.type,
  });

  // 정렬을 위한 비교 로직 (비표준 달력도 지원하기 위해 단순 정수 비교)
  int compareTo(TimelineEvent other) {
    if (year != other.year) return year.compareTo(other.year);
    // 월/일이 없으면 연도 초(0)로 취급
    final m1 = month ?? 0;
    final m2 = other.month ?? 0;
    if (m1 != m2) return m1.compareTo(m2);

    final d1 = day ?? 0;
    final d2 = other.day ?? 0;
    return d1.compareTo(d2);
  }
}
