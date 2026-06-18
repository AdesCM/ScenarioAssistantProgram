import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUniverse } from '../contexts/UniverseContext';
import type { Character, Location, Plot, DetailField, TagRef } from '../contexts/UniverseContext';
import {
  ArrowLeft, Save, Plus, Trash2, Search,
  Image as ImageIcon, Eye, Edit3, Tag, X,
  User, MapPin, BookOpen, ExternalLink, Network
} from 'lucide-react';
import { ReactFlow, Background, Controls } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

type ItemType = 'character' | 'location' | 'plot';

// ── 상수 & 보조 컴포넌트 ────────────────────────────────────────────────────────

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
  if (fromType === 'character' && toType === 'location') return '관련인물';
  if (fromType === 'location' && toType === 'character') return '관련장소';
  if (fromType === 'plot' && toType === 'location') return '관련플롯';
  if (fromType === 'location' && toType === 'plot') return '배경장소';
  if (fromType === 'character' && toType === 'character') return '관련인물';
  if (fromType === 'location' && toType === 'location') return '관련장소';
  if (fromType === 'plot' && toType === 'plot') return '관련플롯';
  return '관련요소';
};

const TYPE_LABEL: Record<string, string> = { character: '인물', location: '장소', plot: '플롯' };

const TYPE_COLOR: Record<string, string> = {
  character: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800',
  location:  'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800',
  plot:      'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800',
};

const TypeIcon: React.FC<{ type: string }> = ({ type }) => {
  if (type === 'character') return <User size={11} />;
  if (type === 'location')  return <MapPin size={11} />;
  return <BookOpen size={11} />;
};

// ── 메인 컴포넌트 ───────────────────────────────────────────────────────────────

const ItemDetail: React.FC<{ type: ItemType }> = ({ type }) => {
  const { id: universeId, itemId } = useParams<{ id: string; itemId: string }>();
  const navigate = useNavigate();
  const { universes, updateCharacter, updateLocation, updatePlot } = useUniverse();

  const universe = universes.find(u => u.id === universeId);

  const [item, setItem]               = useState<Character | Location | Plot | null>(null);
  const [viewMode, setViewMode]       = useState<'edit' | 'summary' | 'graph'>('edit');
  const [details, setDetails]         = useState<DetailField[]>([]);
  const [searchTerm, setSearchTerm]   = useState('');
  const [imageUrl, setImageUrl]       = useState('');
  const [name, setName]               = useState('');
  const [selectedNodeInfo, setSelectedNodeInfo] = useState<{ name: string; type: string; relationKey: string } | null>(null);

  // 태그 피커
  const [tagPickerOpen, setTagPickerOpen] = useState<number | null>(null);
  const [tagSearch, setTagSearch]         = useState('');
  const tagPickerRef = useRef<HTMLDivElement>(null);

  // 아이템 로드
  useEffect(() => {
    if (!universe || !itemId) return;
    let found: Character | Location | Plot | undefined;
    if (type === 'character') found = universe.characters.find(c => c.id === itemId);
    if (type === 'location')  found = universe.locations.find(l => l.id === itemId);
    if (type === 'plot')      found = universe.plots.find(p => p.id === itemId);
    if (found) {
      setItem(found);
      setName(found.name);
      setImageUrl(found.imageUrl);
      setDetails(found.details || []);
    }
  }, [universe, itemId, type]);

  // 태그 피커 외부 클릭 닫기
  useEffect(() => {
    if (tagPickerOpen === null) return;
    const handleClick = (e: MouseEvent) => {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setTagPickerOpen(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [tagPickerOpen]);

  if (!universe || !item) {
    return <div className="p-8 text-slate-500">항목을 찾을 수 없습니다.</div>;
  }

  // ── 관계망 (GraphRAG Board) 데이터 구성 ─────────────────────────────────────────
  const connections: Array<{ id: string, type: 'character' | 'location' | 'plot', name: string, relationKey: string }> = [];

  if (universe) {
    // 1. 현재 아이템의 상세 필드에 달린 태그들 수집
    details.forEach(field => {
      if (field.type === 'tag' && field.tags) {
        field.tags.forEach(t => {
          connections.push({ id: t.id, type: t.type, name: t.name, relationKey: field.key });
        });
      }
    });

    // 2. 다른 아이템들 중 현재 아이템을 가리키고 있는 역방향 참조들 수집
    const checkEntity = (other: any, otherType: 'character' | 'location' | 'plot') => {
      if (other.id === itemId) return;
      (other.details || []).forEach((field: any) => {
        if (field.type === 'tag' && field.tags) {
          field.tags.forEach((t: any) => {
            if (t.id === itemId) {
              if (!connections.some(c => c.id === other.id)) {
                connections.push({
                  id: other.id,
                  type: otherType,
                  name: other.name,
                  relationKey: getReverseKey(otherType, type, field.key)
                });
              }
            }
          });
        }
      });
    };

    universe.characters.forEach(c => checkEntity(c, 'character'));
    universe.locations.forEach(l => checkEntity(l, 'location'));
    universe.plots.forEach(p => checkEntity(p, 'plot'));
  }

  // 3. 노드 생성 (현재 노드는 중앙에, 연결된 노드들은 원형으로 배치)
  const centerNodeX = 400;
  const centerNodeY = 300;

  const nodes = [
    {
      id: itemId || 'center',
      position: { x: centerNodeX, y: centerNodeY },
      data: {
        label: (
          <div className={`shadow-lg flex flex-col justify-center items-center font-bold border-4 border-slate-800 dark:border-slate-100 bg-white dark:bg-[#1e293b] text-slate-800 dark:text-slate-100 ${
            type === 'character' ? 'rounded-[50%] w-36 h-20' :
            type === 'location' ? 'rounded-none w-36 h-20' :
            'rounded-xl w-36 h-20'
          }`}>
            <span className="text-[10px] opacity-60">현재 {TYPE_LABEL[type]}</span>
            <span className="text-xs text-center px-1 truncate w-full">{name}</span>
          </div>
        )
      },
      style: { background: 'transparent', border: 'none', padding: 0 }
    },
    ...connections.map((conn, index) => {
      const angle = (2 * Math.PI * index) / (connections.length || 1);
      const radius = 220;
      const x = centerNodeX + radius * Math.cos(angle);
      const y = centerNodeY + radius * Math.sin(angle);

      const borderClass =
        conn.type === 'character' ? 'border-blue-500 text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 rounded-[50%]' :
        conn.type === 'location' ? 'border-green-500 text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-950/40 rounded-none' :
        'border-purple-500 text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 rounded-xl';

      return {
        id: conn.id,
        position: { x, y },
        data: {
          label: (
            <div className={`shadow-md flex flex-col justify-center items-center font-semibold border-2 w-32 h-16 bg-white dark:bg-[#1e293b] ${borderClass}`}>
              <span className="text-[9px] opacity-70">{TYPE_LABEL[conn.type]}</span>
              <span className="text-xs text-center px-1 truncate w-full">{conn.name}</span>
            </div>
          )
        },
        style: { background: 'transparent', border: 'none', padding: 0 }
      };
    })
  ];

  // 4. 엣지 생성 (중앙 노드 ↔ 주변 노드)
  const edges = connections.map((conn) => {
    return {
      id: `edge-${itemId}-${conn.id}`,
      source: itemId || 'center',
      target: conn.id,
      label: conn.relationKey,
      labelStyle: { fill: '#4b5563', fontSize: 10, fontWeight: 600 },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9, rx: 4, ry: 4 },
      animated: true,
      style: {
        stroke: conn.type === 'character' ? '#3b82f6' : conn.type === 'location' ? '#22c55e' : '#a855f7',
        strokeWidth: 2
      }
    };
  });

  const onNodeClick = (event: React.MouseEvent, node: any) => {
    if (node.id === itemId) {
      setSelectedNodeInfo({
        name,
        type,
        relationKey: '현재 개체'
      });
      return;
    }
    const conn = connections.find(c => c.id === node.id);
    if (conn) {
      setSelectedNodeInfo({
        name: conn.name,
        type: conn.type,
        relationKey: conn.relationKey
      });
    }
  };

  const onNodeDoubleClick = (event: React.MouseEvent, node: any) => {
    if (node.id === itemId) return;
    const conn = connections.find(c => c.id === node.id);
    if (conn) {
      navigate(`/universe/${universeId}/${conn.type}/${conn.id}`);
      setSelectedNodeInfo(null);
    }
  };

  // 세계관 내 전체 엔티티 (자기 자신 제외) — 태그 피커용
  const allEntities: TagRef[] = [
    ...universe.characters.map(c => ({ id: c.id, type: 'character' as const, name: c.name })),
    ...universe.plots.map(p =>      ({ id: p.id, type: 'plot' as const,      name: p.name })),
    ...universe.locations.map(l =>  ({ id: l.id, type: 'location' as const,  name: l.name })),
  ].filter(e => e.id !== itemId);

  // ── 저장 ──────────────────────────────────────────────────────────────────────

  const handleSave = () => {
    const filtered = details.filter(d => d.key.trim() !== '');
    const data = { name, imageUrl, details: filtered };
    if (type === 'character') updateCharacter(universe.id, item.id, data);
    if (type === 'location')  updateLocation(universe.id, item.id, data);
    if (type === 'plot')      updatePlot(universe.id, item.id, data);
    alert('저장되었습니다.');
  };

  // ── 요소 CRUD ─────────────────────────────────────────────────────────────────

  const addTextField = () =>
    setDetails(prev => [...prev, { key: '', type: 'text', value: '', tags: [] }]);

  const addTagField = () =>
    setDetails(prev => [...prev, { key: '', type: 'tag', value: '', tags: [] }]);

  const updateFieldKey = (idx: number, key: string) =>
    setDetails(prev => prev.map((d, i) => i === idx ? { ...d, key } : d));

  const updateFieldValue = (idx: number, value: string) =>
    setDetails(prev => prev.map((d, i) => i === idx ? { ...d, value } : d));

  const removeField = (idx: number) =>
    setDetails(prev => prev.filter((_, i) => i !== idx));

  // ── 태그 조작 ─────────────────────────────────────────────────────────────────

  const addTagToField = (fieldIdx: number, tag: TagRef) => {
    setDetails(prev => prev.map((d, i) => {
      if (i !== fieldIdx) return d;
      const already = (d.tags || []).find(t => t.id === tag.id);
      if (already) return d;
      return { ...d, tags: [...(d.tags || []), tag] };
    }));
    setTagPickerOpen(null);
    setTagSearch('');
  };

  const removeTagFromField = (fieldIdx: number, tagId: string) =>
    setDetails(prev => prev.map((d, i) =>
      i === fieldIdx ? { ...d, tags: (d.tags || []).filter(t => t.id !== tagId) } : d
    ));

  const navigateToTag = (tag: TagRef) =>
    navigate(`/universe/${universeId}/${tag.type}/${tag.id}`);

  // ── 검색 필터 ─────────────────────────────────────────────────────────────────

  const filteredDetails = details
    .map((d, i) => ({ ...d, originalIndex: i }))
    .filter(d =>
      d.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (d.type === 'text' && d.value.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (d.type === 'tag'  && (d.tags || []).some(t => t.name.toLowerCase().includes(searchTerm.toLowerCase())))
    );

  // ── 렌더 ──────────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col w-full h-full bg-slate-50 dark:bg-[#0f172a] transition-colors overflow-hidden">

      {/* ── 헤더 ── */}
      <header className="flex shrink-0 h-16 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b]">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(`/universe/${universe.id}`)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-lg font-bold">{name} 정보</h2>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              setViewMode('graph');
              setSelectedNodeInfo(null);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              viewMode === 'graph'
                ? 'bg-blue-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            <Network size={16} /> 한 눈에 보기
          </button>
          <button
            onClick={() => setViewMode(viewMode === 'summary' ? 'edit' : 'summary')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
              viewMode === 'summary'
                ? 'bg-purple-600 text-white'
                : 'bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200'
            }`}
          >
            {viewMode === 'summary' ? (
              <><Edit3 size={16} /> 편집 모드</>
            ) : (
              <><Eye size={16} /> 요약 보기</>
            )}
          </button>
          {viewMode === 'edit' && (
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors text-sm font-medium"
            >
              <Save size={16} /> 저장
            </button>
          )}
        </div>
      </header>

      {/* ── 메인 ── */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-6xl mx-auto">

          {/* ── 한 눈에 보기 (관계 그래프) ── */}
          {viewMode === 'graph' && (
            <div className="w-full h-[650px] bg-white dark:bg-[#1e293b] rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col relative">
              <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50 shrink-0">
                <div>
                  <h3 className="font-bold text-slate-800 dark:text-slate-200 text-sm">관계망 시각화 (GraphRAG Board)</h3>
                  <p className="text-xs text-slate-500">더블클릭: 해당 항목으로 이동 | 클릭: 연결 상세 정보 확인 (마우스 휠로 확대/축소 가능)</p>
                </div>
                <div className="flex gap-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">인물: 타원</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">장소: 사각형</span>
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300">플롯: 라운드형</span>
                </div>
              </div>
              <div className="flex-1 min-h-0 relative">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  onNodeClick={onNodeClick}
                  onNodeDoubleClick={onNodeDoubleClick}
                  fitView
                  minZoom={0.2}
                  maxZoom={2.0}
                  className="bg-slate-50/50 dark:bg-[#0f172a]/30"
                >
                  <Background color="#cbd5e1" gap={16} size={1} />
                  <Controls showInteractive={false} />
                </ReactFlow>

                {/* 선택된 노드 상세 정보 패널 (우하단 플로팅 카드) */}
                {selectedNodeInfo && (
                  <div className="absolute bottom-4 right-4 z-10 w-72 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 rounded-xl shadow-lg p-4 transition-all">
                    <div className="flex justify-between items-start mb-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">연결 관계 정보</span>
                      <button onClick={() => setSelectedNodeInfo(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
                        <X size={14} />
                      </button>
                    </div>
                    <div className="space-y-2">
                      <div className="mb-2">
                        <span className="text-[10px] text-slate-500 block">관계명 (참여 / 배경 / 관련)</span>
                        <span className="inline-block text-xs font-semibold px-2 py-0.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-800 dark:text-slate-200 mt-1">
                          {selectedNodeInfo.relationKey}
                        </span>
                      </div>
                      <div className="mb-2">
                        <span className="text-[10px] text-slate-500 block">개체 종류</span>
                        <span className="text-xs font-semibold">{TYPE_LABEL[selectedNodeInfo.type]}</span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-500 block">개체명</span>
                        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">{selectedNodeInfo.name}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── 요약 보기 ── */}
          {viewMode === 'summary' && (
            <div className="flex gap-8">
              <div className="w-1/3 aspect-[2/3] rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 shadow-md flex-shrink-0">
                <img src={imageUrl} alt={name} className="w-full h-full object-cover" />
              </div>
              <div className="w-2/3 space-y-4">
                <h1 className="text-4xl font-bold mb-6">{name}</h1>
                <div className="grid grid-cols-2 gap-4">
                  {details.filter(d => d.key.trim()).map((d, i) => (
                    <div key={i} className="p-4 bg-white dark:bg-[#1e293b] rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                      <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">{d.key}</h3>
                      {d.type === 'text' ? (
                        <p className="text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">{d.value || '—'}</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {(d.tags || []).length === 0
                            ? <span className="text-sm text-slate-400">—</span>
                            : (d.tags || []).map(tag => (
                                <button
                                  key={tag.id}
                                  onClick={() => navigateToTag(tag)}
                                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border cursor-pointer hover:opacity-75 transition-opacity ${TYPE_COLOR[tag.type]}`}
                                >
                                  <TypeIcon type={tag.type} />
                                  {tag.name}
                                  <ExternalLink size={10} />
                                </button>
                              ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>

          )}

          {/* ── 편집 보기 ── */}
          {viewMode === 'edit' && (
            <div className="flex flex-col lg:flex-row gap-8">

              {/* 좌측: 이미지 + 이름 */}
              <div className="w-full lg:w-1/3 flex-shrink-0 space-y-4">
                <div
                  className="aspect-[2/3] rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 cursor-pointer border-2 border-dashed border-slate-300 dark:border-slate-600 group relative"
                  onClick={() => {
                    const newUrl = prompt('이미지 URL을 입력하세요:', imageUrl);
                    if (newUrl) setImageUrl(newUrl);
                  }}
                >
                  <img src={imageUrl} alt="" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white flex-col gap-2">
                    <ImageIcon size={32} />
                    <span className="text-sm">이미지 URL 변경</span>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">이름</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full px-4 py-2 bg-white dark:bg-[#1e293b] border border-slate-300 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 font-bold text-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>

              {/* 우측: 동적 요소 */}
              <div className="w-full lg:w-2/3 flex flex-col" style={{ height: 'calc(100vh - 12rem)' }}>

                {/* 검색 + 추가 버튼 */}
                <div className="flex gap-2 mb-4 flex-wrap">
                  <div className="relative flex-1 min-w-[180px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input
                      type="text"
                      placeholder="요소 검색..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-sm"
                    />
                  </div>
                  <button
                    onClick={addTextField}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <Plus size={15} /> 텍스트 요소
                  </button>
                  <button
                    onClick={addTagField}
                    className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg flex items-center gap-1.5 text-sm font-medium transition-colors whitespace-nowrap"
                  >
                    <Tag size={15} /> 태그 요소
                  </button>
                </div>

                {/* 요소 목록 */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-2.5">
                  {filteredDetails.map(detail => {
                    const idx = detail.originalIndex;
                    const isTagField = detail.type === 'tag';

                    // 태그 피커용 필터된 엔티티 (이미 추가된 것 제외)
                    const pickerOptions = allEntities
                      .filter(e =>
                        e.name.toLowerCase().includes(tagSearch.toLowerCase()) &&
                        !(detail.tags || []).find(t => t.id === e.id)
                      )
                      .slice(0, 20);

                    return (
                      <div
                        key={idx}
                        className="flex gap-3 items-start bg-white dark:bg-[#1e293b] p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm"
                      >
                        {/* 키 + 타입 뱃지 */}
                        <div className="w-[30%] flex-shrink-0">
                          <input
                            type="text"
                            placeholder={isTagField ? '예: 참여플롯, 관련장소' : '예: 소속, 역할'}
                            value={detail.key}
                            onChange={e => updateFieldKey(idx, e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-sm font-medium"
                          />
                          <div className={`mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            isTagField
                              ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}>
                            {isTagField ? <><Tag size={9} /> TAG</> : 'TEXT'}
                          </div>
                        </div>

                        {/* 값 영역 */}
                        <div className="flex-1 min-w-0">
                          {!isTagField ? (
                            /* 텍스트 필드 */
                            <textarea
                              placeholder="내용 입력..."
                              value={detail.value}
                              onChange={e => updateFieldValue(idx, e.target.value)}
                              rows={1}
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 text-sm resize-y min-h-[42px]"
                            />
                          ) : (
                            /* 태그 필드 */
                            <div
                              className="relative"
                              ref={tagPickerOpen === idx ? tagPickerRef : null}
                            >
                              {/* 태그 칩 컨테이너 */}
                              <div className="min-h-[42px] px-2.5 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg flex flex-wrap gap-1.5 items-center">
                                {(detail.tags || []).map(tag => (
                                  <span
                                    key={tag.id}
                                    onClick={() => navigateToTag(tag)}
                                    title={`클릭 → ${TYPE_LABEL[tag.type]} 페이지로 이동`}
                                    className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full border cursor-pointer hover:opacity-75 transition-opacity ${TYPE_COLOR[tag.type]}`}
                                  >
                                    <TypeIcon type={tag.type} />
                                    {tag.name}
                                    <button
                                      onClick={e => { e.stopPropagation(); removeTagFromField(idx, tag.id); }}
                                      className="ml-0.5 opacity-60 hover:opacity-100 hover:text-red-500 transition-colors"
                                    >
                                      <X size={10} />
                                    </button>
                                  </span>
                                ))}
                                {/* 태그 추가 버튼 */}
                                <button
                                  onClick={() => {
                                    setTagPickerOpen(tagPickerOpen === idx ? null : idx);
                                    setTagSearch('');
                                  }}
                                  className="inline-flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full px-2 py-1 transition-colors font-medium"
                                >
                                  <Plus size={12} /> 태그 추가
                                </button>
                              </div>

                              {/* 태그 피커 드롭다운 */}
                              {tagPickerOpen === idx && (
                                <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-hidden">
                                  <div className="p-2 border-b border-slate-100 dark:border-slate-700">
                                    <input
                                      autoFocus
                                      type="text"
                                      placeholder="인물 / 플롯 / 장소 검색..."
                                      value={tagSearch}
                                      onChange={e => setTagSearch(e.target.value)}
                                      className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm focus:outline-none border border-slate-200 dark:border-slate-700 focus:border-indigo-400"
                                    />
                                  </div>
                                  <div className="max-h-52 overflow-y-auto">
                                    {pickerOptions.length > 0 ? (
                                      pickerOptions.map(entity => (
                                        <button
                                          key={entity.id}
                                          onClick={() => addTagToField(idx, entity)}
                                          className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                                        >
                                          <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${TYPE_COLOR[entity.type]}`}>
                                            <TypeIcon type={entity.type} />
                                            {TYPE_LABEL[entity.type]}
                                          </span>
                                          <span className="text-sm text-slate-800 dark:text-slate-200 font-medium">{entity.name}</span>
                                        </button>
                                      ))
                                    ) : (
                                      <div className="px-4 py-8 text-center">
                                        <p className="text-sm text-slate-400">
                                          {tagSearch ? `"${tagSearch}" 검색 결과 없음` : '세계관에 등록된 엔티티가 없습니다'}
                                        </p>
                                        {!tagSearch && (
                                          <p className="text-xs text-slate-400 mt-1">먼저 인물/플롯/장소를 추가해보세요</p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* 삭제 버튼 */}
                        <button
                          onClick={() => removeField(idx)}
                          className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg mt-0.5 transition-colors flex-shrink-0"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    );
                  })}

                  {filteredDetails.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                      <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800">
                        <Plus size={28} className="text-slate-400" />
                      </div>
                      <p className="text-sm">요소가 없습니다.</p>
                      <p className="text-xs">위 버튼으로 텍스트 요소나 태그 요소를 추가하세요.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default ItemDetail;
