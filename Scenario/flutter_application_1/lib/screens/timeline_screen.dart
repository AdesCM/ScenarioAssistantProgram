import 'package:flutter/material.dart';
import 'package:flutter/gestures.dart';
import 'package:provider/provider.dart';
import '../providers/universe_provider.dart';
import '../models/timeline_event.dart';

class TimelineScreen extends StatefulWidget {
  static const routeName = '/timeline';

  const TimelineScreen({super.key});

  @override
  State<TimelineScreen> createState() => _TimelineScreenState();
}

class _TimelineScreenState extends State<TimelineScreen> {
  bool _showPlots = true;
  bool _showCharacters = true;
  bool _isHorizontal = true;

  // 줌 레벨 (픽셀 단위 배율)
  double _scaleFactor = 1.0;
  final double _baseYearHeight = 300.0;

  final ScrollController _scrollController = ScrollController();

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args == null) {
      return const Scaffold(body: Center(child: Text("오류: 데이터 없음")));
    }
    final universeId = args as String;

    final provider = Provider.of<UniverseProvider>(context);
    final events = provider.getTimelineEvents(universeId,
        showPlots: _showPlots, showCharacters: _showCharacters);

    int minYear = 0;
    int maxYear = 0;

    if (events.isNotEmpty) {
      minYear = events.first.year - 5;
      maxYear = events.last.year + 5;
    } else {
      minYear = 2020;
      maxYear = 2030;
    }

    int totalYears = maxYear - minYear + 1;

    return Scaffold(
      appBar: AppBar(
        title: const Text('타임라인'),
        actions: [
          IconButton(
            icon: Icon(_isHorizontal ? Icons.swap_vert : Icons.swap_horiz),
            tooltip: _isHorizontal ? '세로로 보기' : '가로로 보기',
            onPressed: () => setState(() => _isHorizontal = !_isHorizontal),
          ),
        ],
      ),
      body: Column(
        children: [
          // 상단 컨트롤러
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            color: Colors.grey[100],
            child: Row(
              children: [
                FilterChip(
                  label: const Text('Plot'),
                  selected: _showPlots,
                  onSelected: (val) => setState(() => _showPlots = val),
                  backgroundColor: Colors.white,
                  selectedColor: Colors.blue[100],
                ),
                const SizedBox(width: 8),
                FilterChip(
                  label: const Text('Character'),
                  selected: _showCharacters,
                  onSelected: (val) => setState(() => _showCharacters = val),
                  backgroundColor: Colors.white,
                  selectedColor: Colors.orange[100],
                ),
                const Spacer(),
                IconButton(
                  icon: const Icon(Icons.remove),
                  onPressed: () => setState(() {
                    if (_scaleFactor > 0.15) _scaleFactor -= 0.1;
                  }),
                ),
                Text('${(_scaleFactor * 100).toInt()}%'),
                IconButton(
                  icon: const Icon(Icons.add),
                  onPressed: () => setState(() {
                    if (_scaleFactor < 3.0) _scaleFactor += 0.1;
                  }),
                ),
              ],
            ),
          ),

          // 타임라인 리스트
          Expanded(
            child: events.isEmpty
                ? const Center(child: Text('표시할 데이터가 없습니다.'))
                : ScrollConfiguration(
                    behavior: ScrollConfiguration.of(context).copyWith(
                      dragDevices: {
                        PointerDeviceKind.touch,
                        PointerDeviceKind.mouse
                      },
                    ),
                    child: Scrollbar(
                      controller: _scrollController,
                      thumbVisibility: true,
                      child: ListView.builder(
                        controller: _scrollController,
                        scrollDirection:
                            _isHorizontal ? Axis.horizontal : Axis.vertical,
                        itemCount: totalYears,
                        itemBuilder: (ctx, index) {
                          final int currentYear = minYear + index;
                          final yearEvents = events
                              .where((e) => e.year == currentYear)
                              .toList();
                          return _buildYearBlock(currentYear, yearEvents);
                        },
                      ),
                    ),
                  ),
          ),
        ],
      ),
    );
  }

  Widget _buildYearBlock(int year, List<TimelineEvent> yearEvents) {
    double blockSize = _baseYearHeight * _scaleFactor;
    bool isDecade = year % 10 == 0;

    // 모드 결정
    bool isDotMode = _scaleFactor < 0.4;
    bool isListMode = _scaleFactor >= 0.4 && _scaleFactor < 1.0;

    bool showText = !isDotMode || isDecade;

    List<TimelineEvent> plots =
        yearEvents.where((e) => e.type == EventType.plot).toList();
    List<TimelineEvent> chars =
        yearEvents.where((e) => e.type == EventType.character).toList();

    return Container(
      width: _isHorizontal ? blockSize : double.infinity,
      height: _isHorizontal ? double.infinity : blockSize,
      decoration: BoxDecoration(
        border: Border(
          bottom: _isHorizontal
              ? BorderSide.none
              : BorderSide(color: Colors.grey.shade300),
          right: _isHorizontal
              ? BorderSide(color: Colors.grey.shade300)
              : BorderSide.none,
        ),
        // [중요] 배경색 제거 (투명하게 처리하여 겹침 허용)
        // color: isDecade ? Colors.grey.shade50 : Colors.white, // <- 이 부분이 문제였음
      ),
      child: Stack(
        clipBehavior: Clip.none, // [중요] 영역 밖으로 나가는 카드 잘리지 않게 설정
        children: [
          // 연도 텍스트
          if (showText)
            Positioned(
              top: 5,
              left: 5,
              child: Text(
                '$year년',
                style: TextStyle(
                  fontWeight: isDecade ? FontWeight.bold : FontWeight.normal,
                  color: isDecade ? Colors.black87 : Colors.grey,
                  fontSize: isDecade ? 16 : 12,
                ),
              ),
            ),

          // 이벤트 배치
          ...yearEvents.map((event) {
            double mainAxisPos;
            double crossAxisPos;

            if (isDotMode) {
              // 점 모드
              double relativePos = 0.5;
              if (event.month != null) {
                relativePos = (event.month! - 1) / 12.0;
                if (event.day != null)
                  relativePos += (event.day! / 31.0) / 12.0;
              }
              mainAxisPos = relativePos * blockSize;

              double baseCross = _isHorizontal ? 40.0 : 80.0;
              crossAxisPos = (event.type == EventType.plot)
                  ? baseCross - 8
                  : baseCross + 8;
            } else if (isListMode) {
              // 리스트 모드
              mainAxisPos = _isHorizontal ? 10.0 : 30.0;

              int indexInGroup = (event.type == EventType.plot)
                  ? plots.indexOf(event)
                  : chars.indexOf(event);

              double cardHeightWithMargin = 70.0;

              if (_isHorizontal) {
                double laneStart =
                    (event.type == EventType.plot) ? 40.0 : 200.0;
                crossAxisPos =
                    laneStart + (indexInGroup * cardHeightWithMargin);
              } else {
                double laneStart =
                    (event.type == EventType.plot) ? 10.0 : 200.0;
                crossAxisPos = laneStart;
                mainAxisPos = 30.0 + (indexInGroup * cardHeightWithMargin);
              }
            } else {
              // 비율 모드
              double relativePos = 0.5;
              if (event.month != null) {
                relativePos = (event.month! - 1) / 12.0;
                if (event.day != null)
                  relativePos += (event.day! / 31.0) / 12.0;
              }
              mainAxisPos = relativePos * blockSize;

              if (_isHorizontal) {
                crossAxisPos = (event.type == EventType.plot) ? 40.0 : 200.0;
              } else {
                crossAxisPos = (event.type == EventType.plot) ? 80.0 : 200.0;
              }
            }

            return Positioned(
              left: _isHorizontal ? mainAxisPos : crossAxisPos,
              top: _isHorizontal ? crossAxisPos : mainAxisPos,
              child: _buildEventCard(event),
            );
          }),
        ],
      ),
    );
  }

  Widget _buildEventCard(TimelineEvent event) {
    if (_scaleFactor < 0.4) {
      return Tooltip(
        message:
            '${event.year}.${event.month ?? "?"}.${event.day ?? "?"}\n${event.title}',
        child: Container(
          width: 12,
          height: 12,
          decoration: BoxDecoration(
            color: event.type == EventType.plot ? Colors.blue : Colors.orange,
            shape: BoxShape.circle,
            border: Border.all(color: Colors.white, width: 1.5),
            boxShadow: [
              BoxShadow(
                  color: Colors.black.withOpacity(0.2),
                  blurRadius: 2,
                  offset: const Offset(1, 1)),
            ],
          ),
        ),
      );
    }

    return Tooltip(
      message:
          '${event.year}년 ${event.month ?? "?"}월 ${event.day ?? "?"}일\n[${event.type == EventType.plot ? "플롯" : "캐릭터"}] ${event.title}\n\n${event.description}',
      padding: const EdgeInsets.all(8),
      textStyle: const TextStyle(fontSize: 12, color: Colors.white),
      decoration: BoxDecoration(
        color: Colors.black.withOpacity(0.8),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Container(
        width: 180,
        padding: const EdgeInsets.all(8),
        margin: const EdgeInsets.only(bottom: 4),
        decoration: BoxDecoration(
          color: event.type == EventType.plot
              ? Colors.blue[50]
              : Colors.orange[50],
          borderRadius: BorderRadius.circular(8),
          border: Border.all(
            color: event.type == EventType.plot
                ? Colors.blue[300]!
                : Colors.orange[300]!,
            width: 1.5,
          ),
          boxShadow: [
            BoxShadow(
              color: Colors.grey.withOpacity(0.2),
              spreadRadius: 1,
              blurRadius: 2,
              offset: const Offset(0, 1),
            ),
          ],
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              event.title,
              style: TextStyle(
                fontWeight: FontWeight.bold,
                fontSize: 13,
                color: event.type == EventType.plot
                    ? Colors.blue[900]
                    : Colors.orange[900],
              ),
              overflow: TextOverflow.ellipsis,
              maxLines: 2,
            ),
            const SizedBox(height: 4),
            if (_scaleFactor >= 0.4)
              Row(
                children: [
                  Icon(
                    Icons.calendar_today,
                    size: 12,
                    color: event.type == EventType.plot
                        ? Colors.blue[700]
                        : Colors.orange[700],
                  ),
                  const SizedBox(width: 4),
                  Text(
                    '${event.month ?? "?"}월 ${event.day ?? "?"}일',
                    style: TextStyle(
                      fontSize: 11,
                      color: event.type == EventType.plot
                          ? Colors.blue[800]
                          : Colors.orange[800],
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
              ),
          ],
        ),
      ),
    );
  }
}
