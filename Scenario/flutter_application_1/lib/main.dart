import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import './providers/universe_provider.dart';
import './screens/main_screen.dart';
import './screens/universe_screen.dart';
import './screens/settings_screen.dart';
import './screens/character_detail_screen.dart';
import './screens/plot_detail_screen.dart';
import './screens/location_detail_screen.dart';
import './screens/timeline_screen.dart';

void main() {
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider(
      create: (ctx) => UniverseProvider(),
      child: MaterialApp(
        title: '세계관 편집기',
        theme: ThemeData(
          primarySwatch: Colors.blue,
          scaffoldBackgroundColor: Colors.white,
          fontFamily: 'Inter',
        ),
        home: const MainScreen(),
        routes: {
          // 아래 부분에서 const를 제거하여 호환성 문제를 해결했습니다.
          UniverseScreen.routeName: (ctx) => UniverseScreen(),
          SettingsScreen.routeName: (ctx) => SettingsScreen(),
          CharacterDetailScreen.routeName: (ctx) => CharacterDetailScreen(),
          PlotDetailScreen.routeName: (ctx) => PlotDetailScreen(),
          LocationDetailScreen.routeName: (ctx) => LocationDetailScreen(),
          TimelineScreen.routeName: (ctx) => TimelineScreen(),
        },
      ),
    );
  }
}
