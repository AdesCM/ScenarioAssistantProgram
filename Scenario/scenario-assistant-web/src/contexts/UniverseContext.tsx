import React, { createContext, useContext, useState, type ReactNode } from 'react';
import type { AIProvider } from '../services/aiService';

export type EventType = 'character' | 'plot';

// ── 태그 요소 타입 ─────────────────────────────────────────────────────────────
export type FieldType = 'text' | 'tag';

export interface TagRef {
  id: string;
  type: 'character' | 'location' | 'plot';
  name: string; // 표시용 스냅샷
}

export interface DetailField {
  key: string;
  type: FieldType;
  value: string;    // type === 'text' 일 때
  tags?: TagRef[];  // type === 'tag' 일 때
}

export interface TimelineEvent {
  id: string;
  title: string;
  description: string;
  year: number;
  month?: number;
  day?: number;
  type: EventType;
}

export interface Character {
  id: string;
  name: string;
  lastEdited: string;
  imageUrl: string;
  details: DetailField[];
}

export interface Location {
  id: string;
  name: string;
  lastEdited: string;
  imageUrl: string;
  details: DetailField[];
}

export interface Plot {
  id: string;
  name: string;
  lastEdited: string;
  imageUrl: string;
  details: DetailField[];
}

export interface Universe {
  id: string;
  name: string;
  lastEditedBy: string;
  iconAsset: string;
  characters: Character[];
  plots: Plot[];
  locations: Location[];
  timeline: TimelineEvent[];
}

// AI 설정 타입
export interface AIModelConfig {
  provider: AIProvider;
  modelName: string;
  apiKey?: string;      // Cloud AI는 API 키 필요
}

export interface AISettings {
  extractModel: AIModelConfig;  // 텍스트 추출용 모델
  checkModel: AIModelConfig;    // 무결성 검사용 모델
}

const DEFAULT_AI_SETTINGS: AISettings = {
  extractModel: { provider: 'ollama', modelName: 'qwen2.5:7b' },
  checkModel:   { provider: 'ollama', modelName: 'gemma3:4b' },
};

interface UniverseContextType {
  universes: Universe[];
  addUniverse: () => void;
  deleteUniverse: (id: string) => void;
  updateUniverse: (id: string, name: string) => void;
  
  // Bulk import
  importEntitiesToUniverse: (uniId: string, data: { characters?: any[], plots?: any[], locations?: any[] }) => void;

  // Character handlers
  addCharacter: (uniId: string) => void;
  updateCharacter: (uniId: string, charId: string, data: Partial<Character>) => void;
  deleteCharacter: (uniId: string, charId: string) => void;

  // Location handlers
  addLocation: (uniId: string) => void;
  updateLocation: (uniId: string, locId: string, data: Partial<Location>) => void;
  deleteLocation: (uniId: string, locId: string) => void;

  // Plot handlers
  addPlot: (uniId: string) => void;
  updatePlot: (uniId: string, plotId: string, data: Partial<Plot>) => void;
  deletePlot: (uniId: string, plotId: string) => void;

  // Timeline handlers
  addTimelineEvent: (uniId: string, event: Omit<TimelineEvent, 'id'>) => void;
  deleteTimelineEvent: (uniId: string, eventId: string) => void;

  // JSON Import & Clear
  importUniverses: (data: Universe[]) => void;
  clearAllData: () => void;

  // AI Settings
  aiSettings: AISettings;
  updateAISettings: (settings: Partial<AISettings>) => void;
}

const mockDate = () => new Date().toLocaleDateString('ko-KR');

// AI 추출 결과(Record) 또는 기존 포맷을 DetailField[]로 변환
const toDetailFields = (raw: any): DetailField[] => {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as DetailField[];
  if (typeof raw === 'object') {
    return Object.entries(raw as Record<string, string>).map(([key, value]) => ({
      key,
      type: 'text' as FieldType,
      value: String(value),
      tags: [],
    }));
  }
  return [];
};

const loadAISettings = (): AISettings => {
  try {
    const saved = localStorage.getItem('aiSettings');
    if (saved) return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(saved) };
  } catch {}
  return DEFAULT_AI_SETTINGS;
};

// ── 양방향 태그 동기화 헬퍼 함수들 ─────────────────────────────────────────────

const getTagsFromDetails = (details: DetailField[]): Array<{ id: string, type: 'character'|'location'|'plot', name: string, fieldKey: string }> => {
  const list: any[] = [];
  if (!details) return list;
  details.forEach(f => {
    if (f.type === 'tag' && f.tags) {
      f.tags.forEach(t => {
        list.push({ id: t.id, type: t.type, name: t.name, fieldKey: f.key });
      });
    }
  });
  return list;
};

const addTagToDetails = (details: DetailField[], targetId: string, targetType: 'character'|'location'|'plot', targetName: string, fieldKey: string): DetailField[] => {
  const next = [...(details || [])];
  let field = next.find(f => f.key === fieldKey && f.type === 'tag');
  if (!field) {
    field = { key: fieldKey, type: 'tag', value: '', tags: [] };
    next.push(field);
  }
  if (!field.tags) field.tags = [];
  const exists = field.tags.some(t => t.id === targetId);
  if (!exists) {
    field.tags.push({ id: targetId, type: targetType, name: targetName });
  }
  return next;
};

const removeTagFromDetails = (details: DetailField[], targetId: string): DetailField[] => {
  if (!details) return [];
  return details.map(f => {
    if (f.type === 'tag' && f.tags) {
      return {
        ...f,
        tags: f.tags.filter(t => t.id !== targetId)
      };
    }
    return f;
  });
};

const getReverseKey = (fromType: string, toType: string, forwardKey: string): string => {
  const k = forwardKey.trim();
  if (fromType === 'character' && toType === 'plot') {
    if (k.includes('플롯') || k.includes('사건') || k.includes('참여')) return '등장인물';
    return '등장인물';
  }
  if (fromType === 'plot' && toType === 'character') {
    if (k.includes('인물') || k.includes('캐릭터') || k.includes('동맹')) return '참여플롯';
    return '참여플롯';
  }
  if (fromType === 'character' && toType === 'location') {
    return '관련인물';
  }
  if (fromType === 'location' && toType === 'character') {
    return '관련장소';
  }
  if (fromType === 'plot' && toType === 'location') {
    return '관련플롯';
  }
  if (fromType === 'location' && toType === 'plot') {
    return '배경장소';
  }
  if (fromType === 'character' && toType === 'character') return '관련인물';
  if (fromType === 'location' && toType === 'location') return '관련장소';
  if (fromType === 'plot' && toType === 'plot') return '관련플롯';
  return '관련요소';
};

const UniverseContext = createContext<UniverseContextType | undefined>(undefined);

export const UniverseProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [universes, setUniverses] = useState<Universe[]>(() => {
    try {
      const saved = localStorage.getItem('scenario_universes');
      if (saved) return JSON.parse(saved);
    } catch {}
    return [];
  });
  const [aiSettings, setAISettings] = useState<AISettings>(loadAISettings);

  // Sync universes to localStorage whenever it changes
  React.useEffect(() => {
    localStorage.setItem('scenario_universes', JSON.stringify(universes));
  }, [universes]);

  const generateId = () => Math.random().toString(36).substr(2, 9);

  const addUniverse = () => {
    const newUni: Universe = {
      id: generateId(),
      name: `새로운 세계관 ${universes.length + 1}`,
      lastEditedBy: mockDate(),
      iconAsset: 'assets/placeholder_icon.png',
      characters: [], plots: [], locations: [], timeline: []
    };
    setUniverses(prev => [...prev, newUni]);
  };

  const deleteUniverse = (id: string) => {
    setUniverses(prev => prev.filter(u => u.id !== id));
  };

  const updateUniverse = (id: string, name: string) => {
    setUniverses(prev => prev.map(u => u.id === id ? { ...u, name, lastEditedBy: mockDate() } : u));
  };

  const updateUniverseList = <T extends 'characters' | 'locations' | 'plots' | 'timeline'>(
    uniId: string, listName: T, newList: Universe[T]
  ) => {
    setUniverses(prev => prev.map(u =>
      u.id === uniId ? { ...u, [listName]: newList, lastEditedBy: mockDate() } : u
    ));
  };

  const importEntitiesToUniverse = (
    uniId: string,
    data: { characters?: any[], plots?: any[], locations?: any[] }
  ) => {
    setUniverses(prev => prev.map(u => {
      if (u.id !== uniId) return u;
      const now = mockDate();
      const placeholder = 'https://placehold.co/400x600/5f6368/FFFFFF?text=Image';

      const mergeOrInsert = (existingList: any[], newItems: any[], defaultName: string) => {
        const nextList = [...existingList];
        for (const item of newItems) {
          const matched = nextList.find((e: any) => (item.id && e.id === item.id) || e.name === item.name);
          if (matched) {
             const newDetails = toDetailFields(item.details);
             matched.details = [...matched.details, ...newDetails];
             matched.lastEdited = now;
             item.id = matched.id; // Record the real ID in the input obj for relation linking
          } else {
             const newId = item.id && !String(item.id).startsWith('tmp') ? item.id : generateId();
             item.id = newId;
             nextList.push({
               id: newId,
               name: item.name || defaultName,
               lastEdited: now,
               imageUrl: placeholder,
               details: toDetailFields(item.details)
             });
          }
        }
        return nextList;
      };

      const newCharacters = mergeOrInsert(u.characters, data.characters || [], '새 캐릭터');
      const newPlots = mergeOrInsert(u.plots, data.plots || [], '새 플롯');
      const newLocations = mergeOrInsert(u.locations, data.locations || [], '새 장소');

      return {
        ...u,
        characters: newCharacters,
        plots: newPlots,
        locations: newLocations,
        lastEditedBy: now,
      };
    }));
  };


  const addCharacter = (uniId: string) => {
    const u = universes.find(u => u.id === uniId); if (!u) return;
    const item: Character = { id: generateId(), name: '새 캐릭터', lastEdited: mockDate(), imageUrl: 'https://placehold.co/400x600/5f6368/FFFFFF?text=Image', details: [] };
    updateUniverseList(uniId, 'characters', [...u.characters, item] as any);
  };
  const updateEntityAndSyncRelations = (
    uniId: string,
    entityId: string,
    entityType: 'character' | 'location' | 'plot',
    data: Partial<Character | Location | Plot>
  ) => {
    setUniverses(prev => prev.map(u => {
      if (u.id !== uniId) return u;

      const now = mockDate();
      let characters = [...u.characters];
      let locations = [...u.locations];
      let plots = [...u.plots];

      // 1. 기존 데이터 및 세부 속성 추출
      let oldDetails: DetailField[] = [];
      let oldName = '';
      if (entityType === 'character') {
        const char = characters.find(c => c.id === entityId);
        if (char) { oldDetails = char.details || []; oldName = char.name; }
      } else if (entityType === 'location') {
        const loc = locations.find(l => l.id === entityId);
        if (loc) { oldDetails = loc.details || []; oldName = loc.name; }
      } else if (entityType === 'plot') {
        const plot = plots.find(p => p.id === entityId);
        if (plot) { oldDetails = plot.details || []; oldName = plot.name; }
      }

      const newName = data.name !== undefined ? data.name : oldName;
      const newDetails = data.details !== undefined ? data.details : oldDetails;

      // 2. 주체 엔티티 업데이트 수행
      if (entityType === 'character') {
        characters = characters.map(c => c.id === entityId ? { ...c, ...data, lastEdited: now } : c);
      } else if (entityType === 'location') {
        locations = locations.map(l => l.id === entityId ? { ...l, ...data, lastEdited: now } : l);
      } else if (entityType === 'plot') {
        plots = plots.map(p => p.id === entityId ? { ...p, ...data, lastEdited: now } : p);
      }

      // 3. 태그 세부 사항이 업데이트된 경우, 추가되거나 제거된 관계를 계산하여 상대 엔티티에 자동 동기화
      if (data.details !== undefined) {
        const oldTags = getTagsFromDetails(oldDetails);
        const newTags = getTagsFromDetails(newDetails);

        const addedTags = newTags.filter(n => !oldTags.some(o => o.id === n.id && o.fieldKey === n.fieldKey));
        const removedTags = oldTags.filter(o => !newTags.some(n => n.id === o.id && n.fieldKey === o.fieldKey));

        const updateDetailsInList = (tId: string, tType: 'character'|'location'|'plot', updater: (details: DetailField[]) => DetailField[]) => {
          if (tType === 'character') {
            characters = characters.map(c => c.id === tId ? { ...c, details: updater(c.details || []), lastEdited: now } : c);
          } else if (tType === 'location') {
            locations = locations.map(l => l.id === tId ? { ...l, details: updater(l.details || []), lastEdited: now } : l);
          } else if (tType === 'plot') {
            plots = plots.map(p => p.id === tId ? { ...p, details: updater(p.details || []), lastEdited: now } : p);
          }
        };

        // 상대방 엔티티에 역방향 태그 추가
        addedTags.forEach(tag => {
          const revKey = getReverseKey(entityType, tag.type, tag.fieldKey);
          updateDetailsInList(tag.id, tag.type, (details) => {
            return addTagToDetails(details, entityId, entityType, newName, revKey);
          });
        });

        // 상대방 엔티티에서 역방향 태그 제거
        removedTags.forEach(tag => {
          updateDetailsInList(tag.id, tag.type, (details) => {
            return removeTagFromDetails(details, entityId);
          });
        });
      }

      // 4. 주체 엔티티의 이름(name)이 변경된 경우, 그 엔티티를 참조하고 있는 모든 태그의 표시 이름(snapshot name)을 일괄 갱신
      if (data.name !== undefined && data.name !== oldName) {
        const updateTagNameSnapshot = (details: DetailField[]): DetailField[] => {
          if (!details) return [];
          return details.map(f => {
            if (f.type === 'tag' && f.tags) {
              return {
                ...f,
                tags: f.tags.map(t => t.id === entityId ? { ...t, name: data.name! } : t)
              };
            }
            return f;
          });
        };
        characters = characters.map(c => ({ ...c, details: updateTagNameSnapshot(c.details) }));
        locations = locations.map(l => ({ ...l, details: updateTagNameSnapshot(l.details) }));
        plots = plots.map(p => ({ ...p, details: updateTagNameSnapshot(p.details) }));
      }

      return {
        ...u,
        characters,
        locations,
        plots,
        lastEditedBy: now
      };
    }));
  };

  const deleteEntityAndCleanupRefs = (
    uniId: string,
    entityId: string,
    entityType: 'character' | 'location' | 'plot'
  ) => {
    setUniverses(prev => prev.map(u => {
      if (u.id !== uniId) return u;
      const now = mockDate();

      const filterDeletedRef = (details: DetailField[]): DetailField[] => {
        if (!details) return [];
        return details.map(f => {
          if (f.type === 'tag' && f.tags) {
            return {
              ...f,
              tags: f.tags.filter(t => t.id !== entityId)
            };
          }
          return f;
        });
      };

      let characters = u.characters;
      let locations = u.locations;
      let plots = u.plots;

      if (entityType === 'character') {
        characters = characters.filter(c => c.id !== entityId);
      } else if (entityType === 'location') {
        locations = locations.filter(l => l.id !== entityId);
      } else if (entityType === 'plot') {
        plots = plots.filter(p => p.id !== entityId);
      }

      // 다른 남은 개체들에서 삭제된 엔티티 참조 태그들을 완벽하게 필터링 청소
      characters = characters.map(c => ({ ...c, details: filterDeletedRef(c.details), lastEdited: now }));
      locations = locations.map(l => ({ ...l, details: filterDeletedRef(l.details), lastEdited: now }));
      plots = plots.map(p => ({ ...p, details: filterDeletedRef(p.details), lastEdited: now }));

      return {
        ...u,
        characters,
        locations,
        plots,
        lastEditedBy: now
      };
    }));
  };

  const updateCharacter = (uniId: string, charId: string, data: Partial<Character>) => {
    updateEntityAndSyncRelations(uniId, charId, 'character', data);
  };
  const deleteCharacter = (uniId: string, charId: string) => {
    deleteEntityAndCleanupRefs(uniId, charId, 'character');
  };

  const addLocation = (uniId: string) => {
    const u = universes.find(u => u.id === uniId); if (!u) return;
    const item: Location = { id: generateId(), name: '새 장소', lastEdited: mockDate(), imageUrl: 'https://placehold.co/400x600/5f6368/FFFFFF?text=Image', details: [] };
    updateUniverseList(uniId, 'locations', [...u.locations, item] as any);
  };
  const updateLocation = (uniId: string, locId: string, data: Partial<Location>) => {
    updateEntityAndSyncRelations(uniId, locId, 'location', data);
  };
  const deleteLocation = (uniId: string, locId: string) => {
    deleteEntityAndCleanupRefs(uniId, locId, 'location');
  };

  const addPlot = (uniId: string) => {
    const u = universes.find(u => u.id === uniId); if (!u) return;
    const item: Plot = { id: generateId(), name: '새 플롯', lastEdited: mockDate(), imageUrl: 'https://placehold.co/400x600/5f6368/FFFFFF?text=Image', details: [] };
    updateUniverseList(uniId, 'plots', [...u.plots, item] as any);
  };
  const updatePlot = (uniId: string, plotId: string, data: Partial<Plot>) => {
    updateEntityAndSyncRelations(uniId, plotId, 'plot', data);
  };
  const deletePlot = (uniId: string, plotId: string) => {
    deleteEntityAndCleanupRefs(uniId, plotId, 'plot');
  };

  const addTimelineEvent = (uniId: string, event: Omit<TimelineEvent, 'id'>) => {
    const u = universes.find(u => u.id === uniId); if (!u) return;
    updateUniverseList(uniId, 'timeline', [...u.timeline, { id: generateId(), ...event }] as any);
  };
  const deleteTimelineEvent = (uniId: string, eventId: string) => {
    const u = universes.find(u => u.id === uniId); if (!u) return;
    updateUniverseList(uniId, 'timeline', u.timeline.filter((c: any) => c.id !== eventId) as any);
  };

  const importUniverses = (data: Universe[]) => {
    setUniverses(data);
  };

  const clearAllData = () => {
    setUniverses([]);
  };

  const updateAISettings = (settings: Partial<AISettings>) => {
    setAISettings(prev => {
      const next = { ...prev, ...settings };
      localStorage.setItem('aiSettings', JSON.stringify(next));
      return next;
    });
  };

  return (
    <UniverseContext.Provider value={{
      universes, addUniverse, deleteUniverse, updateUniverse,
      importEntitiesToUniverse,
      addCharacter, updateCharacter, deleteCharacter,
      addLocation, updateLocation, deleteLocation,
      addPlot, updatePlot, deletePlot,
      addTimelineEvent, deleteTimelineEvent,
      importUniverses, clearAllData,
      aiSettings, updateAISettings,
    }}>
      {children}
    </UniverseContext.Provider>
  );
};

export const useUniverse = () => {
  const context = useContext(UniverseContext);
  if (!context) throw new Error('useUniverse must be used within UniverseProvider');
  return context;
};
