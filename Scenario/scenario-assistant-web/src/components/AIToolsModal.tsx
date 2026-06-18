import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUniverse } from '../contexts/UniverseContext';
import type { Character, Plot, Location, Universe, DetailField, TagRef } from '../contexts/UniverseContext';
import { ollamaChat } from '../services/aiService';
import { getRagStatus, indexUniverse, queryRAG } from '../services/ragService';
import type { RAGStatus, RAGQueryResult } from '../services/ragService';
import {
  X, Sparkles, ShieldCheck, Loader2, AlertTriangle,
  CheckCircle2, ExternalLink, Wand2, ChevronRight,
  ChevronLeft, FileText, Users, MapPin, Lightbulb,
  Tag, Plus, Link, Database, Search, Globe, RefreshCw,
  ServerOff, Server, MessageSquare
} from 'lucide-react';

// ── 타입 ─────────────────────────────────────────────────────────────────────

interface ExtractedData {
  characters?: Array<{ name?: string; details?: Record<string, string> }>;
  plots?:      Array<{ name?: string; details?: Record<string, string> }>;
  locations?:  Array<{ name?: string; details?: Record<string, string> }>;
}

export interface IntegrityIssue {
  type: 'character' | 'plot' | 'location' | 'general';
  entityId?: string;
  entityName?: string;
  description: string;
  suggestedFix?: string;
}

export interface ExpansionSuggestion {
  category: 'character' | 'plot' | 'location';
  name: string;
  reason: string;          // 왜 추가하면 좋은지
  details: Record<string, string>;
}

// 추출 후 관계 연결을 위한 링크 제안
interface RelationLink {
  fromType: 'character' | 'plot' | 'location';
  fromId: string;
  fromName: string;
  fieldKey: string;        // 예: "참여플롯", "관련장소"
  toType:   'character' | 'plot' | 'location';
  toId: string;
  toName:   string;
}

type ModalMode = 'menu' | 'extract' | 'integrity' | 'diff' | 'expand' | 'rag';
type Stage = 'idle' | 'loading' | 'done' | 'error';

interface DiffItem {
  issue: IntegrityIssue;
  entity: Character | Plot | Location | null;
  patchedDetails: DetailField[];
}

// ── 헬퍼 ─────────────────────────────────────────────────────────────────────

/** DetailField[] → AI 프롬프트용 Record<string, string> 변환 */
const detailFieldsToSummary = (fields: DetailField[]): Record<string, string> => {
  const obj: Record<string, string> = {};
  fields.forEach(f => {
    if (f.type === 'text') obj[f.key] = f.value;
    else if (f.type === 'tag') obj[f.key] = (f.tags || []).map(t => `[${t.type}:${t.name}]`).join(', ');
  });
  return obj;
};

/** LLM이 생성한 마크다운, 불필요한 텍스트 및 후행 쉼표(Trailing Comma) 제거 */
const cleanJson = (raw: string): string => {
  let cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace >= firstBrace) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }
  // 배열이나 객체의 끝에 남아있는 불필요한 쉼표 제거 (예: {"a": 1, } -> {"a": 1})
  cleaned = cleaned.replace(/,\s*([\]}])/g, '$1');
  return cleaned;
};

// ── 프롬프트 빌더 ─────────────────────────────────────────────────────────────

function buildExtractPrompt(text: string, ragContext: string = ''): string {
  const contextInstruction = ragContext 
    ? `\nBackground Lore (Context):\n"""\n${ragContext}\n"""\nIMPORTANT: If the text refers to an existing entity from the Background Lore, you MUST use their correct existing ID in the "id" field. If it is a completely new entity not found in the lore, you MUST set "id" to a unique string starting with "tmp_" (e.g., "tmp_1", "tmp_2").`
    : `\nIMPORTANT: For every entity, you MUST invent a unique string starting with "tmp_" (e.g., "tmp_1", "tmp_2") for the "id" field.`;

  return `You are a creative writing assistant. Extract all story entities from the following text and return ONLY a valid JSON object (no markdown, no explanation).

The JSON must follow this exact schema:
{
  "characters": [ { "id": "string", "name": "string", "details": { "custom_key1": "value", "custom_key2": "value" } } ],
  "plots":      [ { "id": "string", "name": "string", "details": { "custom_key1": "value" } } ],
  "locations":  [ { "id": "string", "name": "string", "details": { "custom_key1": "value" } } ]
}

IMPORTANT: Inside the "details" object, you MUST autonomously identify and extract ANY unique characteristics, defining elements, or notable attributes for each entity found in the text. You are completely free to invent custom key names to categorize these details logically (e.g., Characters: "무기", "성격", "외양", "이명" / Locations: "기후", "특산물", "지배세력" / Plots: "핵심사건", "결과"). Do not limit yourself—capture all rich details the text provides.
${contextInstruction}

Text to analyze:
"""
${text}
"""`;
}

function buildRelationPrompt(extracted: ExtractedData): string {
  return `You are a story relationship analyst. Given these extracted story entities (which include their "id"), identify relationships between them and return ONLY a valid JSON object.

Extracted entities:
${JSON.stringify(extracted, null, 2)}

For each meaningful relationship between entities, create a link. Common link types:
- character → "참여플롯" → plot (character participates in a plot)
- character → "관련장소" → location (character is associated with a location)  
- character → "관련인물" → character (characters are related to each other)
- plot → "배경장소" → location (plot takes place at a location)

Return ONLY valid JSON:
{
  "links": [
    {
      "fromType": "character" | "plot" | "location",
      "fromId": "entity id exactly as extracted",
      "fromName": "entity name for reference",
      "fieldKey": "relationship label in Korean",
      "toType": "character" | "plot" | "location",
      "toId": "entity id exactly as extracted",
      "toName": "entity name for reference"
    }
  ]
}

Only include links where BOTH entities logically relate. Return empty array if no clear relationships.`;
}

function buildIntegrityPrompt(universe: Universe): string {
  const summary = {
    characters: universe.characters.map(c => ({ id: c.id, name: c.name, details: detailFieldsToSummary(c.details) })),
    plots:      universe.plots.map(p =>      ({ id: p.id, name: p.name, details: detailFieldsToSummary(p.details) })),
    locations:  universe.locations.map(l =>  ({ id: l.id, name: l.name, details: detailFieldsToSummary(l.details) })),
    timeline:   universe.timeline,
  };

  return `You are a rigorous story continuity editor. Analyze this worldbuilding data for any logical inconsistencies, contradictions, or continuity errors.

World data (JSON):
${JSON.stringify(summary, null, 2)}

Return ONLY a valid JSON object with this exact schema. If no issues found, return empty arrays:
{
  "issues": [
    {
      "type": "character" | "plot" | "location" | "general",
      "entityId": "the id string from data, or null",
      "entityName": "the name for display",
      "description": "describe the specific inconsistency in Korean",
      "suggestedFix": "concrete suggested fix text in Korean"
    }
  ]
}`;
}

function buildExpansionPrompt(universe: Universe): string {
  const summary = {
    characters: universe.characters.map(c => ({ name: c.name, details: detailFieldsToSummary(c.details) })),
    plots:      universe.plots.map(p =>      ({ name: p.name, details: detailFieldsToSummary(p.details) })),
    locations:  universe.locations.map(l =>  ({ name: l.name, details: detailFieldsToSummary(l.details) })),
  };

  return `You are a creative worldbuilding consultant. Analyze this worldbuilding data and suggest new characters, plots, and locations that would enrich the story world.

Current world data:
${JSON.stringify(summary, null, 2)}

Based on what's missing, generate 3-5 expansion suggestions total. Think about:
- Supporting characters that the main cast would logically interact with
- Sub-plots that would complement existing plots  
- Locations that would be naturally needed for the existing characters and plots

Return ONLY valid JSON:
{
  "suggestions": [
    {
      "category": "character" | "plot" | "location",
      "name": "suggested entity name in Korean",
      "reason": "why this would enrich the world (in Korean, 1-2 sentences)",
      "details": { "key": "value" }
    }
  ]
}`;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

interface AIToolsModalProps {
  universe: Universe;
  onClose: () => void;
}

const AIToolsModal: React.FC<AIToolsModalProps> = ({ universe, onClose }) => {
  const { aiSettings, importEntitiesToUniverse, updateCharacter, updatePlot, updateLocation, universes } = useUniverse();
  const navigate = useNavigate();

  const [mode, setMode]                   = useState<ModalMode>('menu');
  const [storyText, setStoryText]         = useState('');
  const [stage, setStage]                 = useState<Stage>('idle');
  const [errorMsg, setErrorMsg]           = useState('');
  const [extractedData, setExtractedData] = useState<ExtractedData | null>(null);
  const [issues, setIssues]               = useState<IntegrityIssue[]>([]);
  const [diffItem, setDiffItem]           = useState<DiffItem | null>(null);
  const [suggestions, setSuggestions]     = useState<ExpansionSuggestion[]>([]);
  const [links, setLinks]                 = useState<RelationLink[]>([]);
  const [linkStage, setLinkStage]         = useState<Stage>('idle');
  const [loadingProgress, setLoadingProgress] = useState(0);

  const runWithProgress = useCallback(async (
    asyncTask: () => Promise<void>,
    onError: (err: any) => void
  ) => {
    setStage('loading');
    setLoadingProgress(0);
    
    let currentProgress = 0;
    const interval = setInterval(() => {
      currentProgress += (98 - currentProgress) * 0.08;
      setLoadingProgress(currentProgress);
    }, 150);

    try {
      await asyncTask();
      clearInterval(interval);
      setLoadingProgress(100);
      await new Promise(resolve => setTimeout(resolve, 300));
      setStage('done');
    } catch (e: any) {
      clearInterval(interval);
      onError(e);
      setStage('error');
    }
  }, []);

  // RAG 상태
  const [ragStatus, setRagStatus]     = useState<RAGStatus | null>(null);
  const [ragOnline, setRagOnline]     = useState<boolean | null>(null);
  const [ragQuestion, setRagQuestion] = useState('');
  const [ragResult, setRagResult]     = useState<RAGQueryResult | null>(null);
  const [ragMode, setRagMode]         = useState<'local' | 'global'>('local');
  const [ragLoading, setRagLoading]   = useState(false);
  const [ragIndexing, setRagIndexing] = useState(false);
  const [ragError, setRagError]       = useState('');

  // RAG 서버 상태 확인
  const checkRagStatus = useCallback(async () => {
    try {
      const s = await getRagStatus();
      setRagStatus(s);
      setRagOnline(true);
    } catch {
      setRagOnline(false);
      setRagStatus(null);
    }
  }, []);

  // 컴포넌트 마운트 및 모드 변경 시 RAG 상태 확인
  useEffect(() => {
    checkRagStatus();
  }, [mode, checkRagStatus]);

  const handleRagIndex = async () => {
    setRagIndexing(true);
    setRagError('');
    try {
      await indexUniverse(universe as unknown as object);
      await checkRagStatus();
      setRagError('');
    } catch (e: any) {
      setRagError(e.message || '인덱싱 실패');
    } finally {
      setRagIndexing(false);
    }
  };

  const handleRagQuery = async () => {
    if (!ragQuestion.trim()) return;
    setRagLoading(true);
    setRagResult(null);
    setRagError('');
    const model = aiSettings.extractModel.modelName;
    try {
      const result = await queryRAG(ragQuestion, model, ragMode);
      setRagResult(result);
    } catch (e: any) {
      setRagError(e.message || 'RAG 질의 실패');
    } finally {
      setRagLoading(false);
    }
  };

  // ── 공통 모델 체크 ──────────────────────────────────────────────────────────

  const checkOllama = (modelConfig: typeof aiSettings.extractModel): boolean => {
    if (modelConfig.provider !== 'ollama') {
      setErrorMsg('현재 클라우드 AI 연동은 준비 중입니다. Ollama 로컬 모델을 사용해주세요.');
      setStage('error');
      return false;
    }
    return true;
  };

  // ── AI 텍스트 추출 ──────────────────────────────────────────────────────────

  const handleExtract = useCallback(async () => {
    if (!storyText.trim()) return;
    if (!checkOllama(aiSettings.extractModel)) return;

    setErrorMsg(''); setLinks([]); setLinkStage('idle');
    
    await runWithProgress(async () => {
      let ragContext = '';
      if (ragOnline) {
        try {
          const ragRes = await queryRAG(storyText, aiSettings.extractModel.modelName, 'local');
          ragContext = ragRes.answer;
        } catch (e) {
          console.warn("RAG Context fetch failed, using fallback", e);
        }
      }

      const raw = await ollamaChat(
        aiSettings.extractModel.modelName,
        'You are a story entity extractor.',
        buildExtractPrompt(storyText, ragContext),
        true
      );
      const parsed: ExtractedData = JSON.parse(cleanJson(raw));
      setExtractedData(parsed);

      // 관계 분석 (추출 직후 백그라운드로 실행)
      if (
        (parsed.characters?.length || 0) +
        (parsed.plots?.length || 0) +
        (parsed.locations?.length || 0) > 1
      ) {
        setLinkStage('loading');
        try {
          const linkRaw = await ollamaChat(
            aiSettings.extractModel.modelName,
            'You are a story relationship analyst.',
            buildRelationPrompt(parsed),
            true
          );
          const linkParsed = JSON.parse(cleanJson(linkRaw));
          setLinks(linkParsed.links || []);
          setLinkStage('done');
        } catch {
          setLinkStage('idle'); // 관계 분석 실패해도 추출 결과는 유지
        }
      }
    }, (e) => {
      setErrorMsg(e.message || '오류가 발생했습니다. Ollama가 실행 중인지 확인하세요.');
    });
  }, [storyText, aiSettings.extractModel, ragOnline, runWithProgress]);

  // 태그 관계 적용 함수
  const applyRelationLinks = useCallback((
    currentUniverse: Universe,
    linksToApply: RelationLink[]
  ) => {
    if (linksToApply.length === 0) return;

    const resolveEntity = (type: string, id: string, name: string): { id: string; name: string, details: DetailField[] } | null => {
      const list = type === 'character' ? currentUniverse.characters : type === 'plot' ? currentUniverse.plots : currentUniverse.locations;
      if (id && !id.startsWith('tmp_')) {
         const match = list.find((x: any) => x.id === id);
         if (match) return match as any;
      }
      return list.find((x: any) => x.name === name) as any || null;
    };

    linksToApply.forEach(link => {
      const fromEntity = resolveEntity(link.fromType, link.fromId, link.fromName);
      const toEntity   = resolveEntity(link.toType,   link.toId,   link.toName);
      if (!fromEntity || !toEntity) return;

      const tagRef: TagRef = { id: toEntity.id, type: link.toType, name: toEntity.name };
      const newField: DetailField = { key: link.fieldKey, type: 'tag', value: '', tags: [tagRef] };

      if (link.fromType === 'character') {
        updateCharacter(universe.id, fromEntity.id, { details: [...fromEntity.details, newField] });
      } else if (link.fromType === 'plot') {
        updatePlot(universe.id, fromEntity.id, { details: [...fromEntity.details, newField] });
      } else if (link.fromType === 'location') {
        updateLocation(universe.id, fromEntity.id, { details: [...fromEntity.details, newField] });
      }
    });
  }, [universe.id, updateCharacter, updatePlot, updateLocation]);

  const handleImport = useCallback(async () => {
    if (!extractedData) return;

    // Trigger Import / Merge (state is mutated for generated objects)
    importEntitiesToUniverse(universe.id, extractedData);

    // After state applies, apply relation links targeting the newly merged state!
    setTimeout(() => {
      const currentUniverse = universes.find(u => u.id === universe.id);
      if (!currentUniverse || links.length === 0) return;
      applyRelationLinks(currentUniverse, links);
    }, 100);

    setMode('integrity');
    setStage('idle');
    await handleIntegrityCheck(universe);
  }, [extractedData, universe, links, universes, applyRelationLinks]);

  // ── 무결성 검사 ─────────────────────────────────────────────────────────────

  const handleIntegrityCheck = useCallback(async (uni: Universe = universe) => {
    if (!checkOllama(aiSettings.checkModel)) return;

    setIssues([]); setErrorMsg('');
    
    await runWithProgress(async () => {
      const raw = await ollamaChat(
        aiSettings.checkModel.modelName,
        'You are a story continuity editor.',
        buildIntegrityPrompt(uni),
        true
      );
      const parsed = JSON.parse(cleanJson(raw));
      setIssues(parsed.issues || []);
    }, (e) => {
      setErrorMsg(e.message || '오류. Ollama가 실행 중인지 확인하세요.');
    });
  }, [aiSettings.checkModel, universe, runWithProgress]);

  // ── 세계관 확장 제안 ─────────────────────────────────────────────────────────

  const handleExpand = useCallback(async () => {
    if (!checkOllama(aiSettings.extractModel)) return;
    if (universe.characters.length + universe.plots.length + universe.locations.length === 0) {
      setErrorMsg('세계관에 엔티티가 없습니다. 먼저 인물, 플롯, 장소를 추가해주세요.');
      setStage('error');
      return;
    }

    setSuggestions([]); setErrorMsg('');
    
    await runWithProgress(async () => {
      const raw = await ollamaChat(
        aiSettings.extractModel.modelName,
        'You are a creative worldbuilding consultant.',
        buildExpansionPrompt(universe),
        true
      );
      const parsed = JSON.parse(cleanJson(raw));
      setSuggestions(parsed.suggestions || []);
    }, (e) => {
      setErrorMsg(e.message || '오류. Ollama가 실행 중인지 확인하세요.');
    });
  }, [aiSettings.extractModel, universe, runWithProgress]);

  const handleAddSuggestion = (s: ExpansionSuggestion) => {
    importEntitiesToUniverse(universe.id, {
      [s.category + 's']: [{ name: s.name, details: s.details }],
    });
    setSuggestions(prev => prev.filter(x => x !== s));
  };

  // ── Auto Fix Diff ──────────────────────────────────────────────────────────

  const handleAutoFix = (issue: IntegrityIssue) => {
    let entity: Character | Plot | Location | null = null;
    if (issue.entityId) {
      entity = universe.characters.find(c => c.id === issue.entityId)
        || universe.plots.find(p => p.id === issue.entityId)
        || universe.locations.find(l => l.id === issue.entityId)
        || null;
    }
    const patchedDetails: DetailField[] = [
      ...((entity?.details) || []),
      { key: 'AI 수정 제안', type: 'text', value: issue.suggestedFix || '', tags: [] },
    ];
    setDiffItem({ issue, entity, patchedDetails });
    setMode('diff');
  };

  const handleAcceptFix = () => {
    if (!diffItem || !diffItem.entity) return;
    const { issue, patchedDetails } = diffItem;
    const id = issue.entityId!;
    if (issue.type === 'character') updateCharacter(universe.id, id, { details: patchedDetails });
    else if (issue.type === 'plot') updatePlot(universe.id, id, { details: patchedDetails });
    else if (issue.type === 'location') updateLocation(universe.id, id, { details: patchedDetails });
    setIssues(prev => prev.filter(i => i !== issue));
    setMode('integrity');
    setDiffItem(null);
  };

  const getEntityPath = (issue: IntegrityIssue) => {
    if (!issue.entityId) return null;
    if (issue.type === 'character') return `/universe/${universe.id}/character/${issue.entityId}`;
    if (issue.type === 'plot')      return `/universe/${universe.id}/plot/${issue.entityId}`;
    if (issue.type === 'location')  return `/universe/${universe.id}/location/${issue.entityId}`;
    return null;
  };

  const CATEGORY_COLORS: Record<string, string> = {
    character: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
    plot:      'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
    location:  'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300',
  };
  const CATEGORY_LABELS: Record<string, string> = { character: '인물', plot: '플롯', location: '장소' };

  const modeTitle: Record<ModalMode, string> = {
    menu:      'AI 도구',
    extract:   'AI 스토리 텍스트 추출기',
    integrity: '세계관 무결성 검사',
    diff:      'Auto Fix 미리보기',
    expand:    'AI 세계관 확장 제안',
    rag:       'GraphRAG 질의 (로컬)',
  };

  // ── 렌더 ────────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-2xl max-h-[88vh] flex flex-col bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl overflow-hidden">

        {/* ── 헤더 ── */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            {mode !== 'menu' && (
              <button
                onClick={() => { setMode('menu'); setStage('idle'); setErrorMsg(''); }}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <Sparkles className="text-indigo-500" size={22} />
            <h2 className="font-bold text-lg">{modeTitle[mode]}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* ── 바디 ── */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* ── 메뉴 ── */}
          {mode === 'menu' && (
            <div className="grid grid-cols-1 gap-3">

              {/* 1. 텍스트 추출 */}
              <button
                onClick={() => { setMode('extract'); setStage('idle'); setExtractedData(null); setLinks([]); }}
                className="flex items-start gap-4 p-5 border-2 border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 rounded-xl transition-all group text-left"
              >
                <div className="p-3 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-lg group-hover:scale-110 transition-transform flex-shrink-0">
                  <FileText size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base mb-1">AI 스토리 텍스트 → 데이터 추출</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">스토리 텍스트를 붙여넣으면 AI가 인물·장소·플롯을 추출하고, 엔티티 간 관계를 <span className="text-indigo-500 font-medium">태그 요소로 자동 연결</span>합니다.</p>
                  <div className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 font-medium">
                    모델: {aiSettings.extractModel.modelName}
                  </div>
                </div>
                <ChevronRight size={20} className="self-center text-slate-400 group-hover:text-indigo-500 flex-shrink-0" />
              </button>

              {/* 2. 무결성 검사 */}
              <button
                onClick={() => { setMode('integrity'); handleIntegrityCheck(); }}
                className="flex items-start gap-4 p-5 border-2 border-slate-200 dark:border-slate-700 hover:border-emerald-400 dark:hover:border-emerald-500 rounded-xl transition-all group text-left"
              >
                <div className="p-3 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-lg group-hover:scale-110 transition-transform flex-shrink-0">
                  <ShieldCheck size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base mb-1">세계관 무결성 검사</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">AI가 전체 데이터를 교차 분석하여 논리적 모순, 타임라인 오류, 중복 등을 찾아냅니다.</p>
                  <div className="mt-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                    모델: {aiSettings.checkModel.modelName}
                  </div>
                </div>
                <ChevronRight size={20} className="self-center text-slate-400 group-hover:text-emerald-500 flex-shrink-0" />
              </button>

              {/* 3. 세계관 확장 제안 */}
              <button
                onClick={() => { setMode('expand'); handleExpand(); }}
                className="flex items-start gap-4 p-5 border-2 border-slate-200 dark:border-slate-700 hover:border-amber-400 dark:hover:border-amber-500 rounded-xl transition-all group text-left"
              >
                <div className="p-3 bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-lg group-hover:scale-110 transition-transform flex-shrink-0">
                  <Lightbulb size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base mb-1">AI 세계관 확장 제안</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">현재 세계관을 분석하여 추가하면 좋을 인물·플롯·장소를 AI가 창의적으로 제안합니다.</p>
                  <div className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    모델: {aiSettings.extractModel.modelName}
                  </div>
                </div>
                <ChevronRight size={20} className="self-center text-slate-400 group-hover:text-amber-500 flex-shrink-0" />
              </button>

              {/* 4. GraphRAG 질의 */}
              <button
                onClick={() => setMode('rag')}
                className="flex items-start gap-4 p-5 border-2 border-slate-200 dark:border-slate-700 hover:border-cyan-400 dark:hover:border-cyan-500 rounded-xl transition-all group text-left"
              >
                <div className="p-3 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400 rounded-lg group-hover:scale-110 transition-transform flex-shrink-0">
                  <Database size={24} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-base mb-1">GraphRAG 세계관 질의</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Microsoft GraphRAG에서 영감받은 그래프 기반 검색.
                    <span className="text-cyan-600 dark:text-cyan-400 font-medium"> Local</span> (엔티티 중심) ·
                    <span className="text-cyan-600 dark:text-cyan-400 font-medium"> Global</span> (세계관 전체) 두 가지 모드를 지원합니다.
                  </p>
                  <div className="mt-2 text-xs text-cyan-600 dark:text-cyan-400 font-medium">
                    Python FastAPI + ChromaDB + sentence-transformers
                  </div>
                </div>
                <ChevronRight size={20} className="self-center text-slate-400 group-hover:text-cyan-500 flex-shrink-0" />
              </button>
            </div>
          )}

          {/* ── 텍스트 추출 ── */}
          {mode === 'extract' && (
            <div className="space-y-4">
              {(stage === 'idle' || stage === 'error') && (
                <>
                  <textarea
                    value={storyText}
                    onChange={e => setStoryText(e.target.value)}
                    rows={10}
                    placeholder="스토리 플롯, 소설, 시나리오 텍스트를 여기에 붙여넣으세요..."
                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl resize-none focus:outline-none focus:border-indigo-500 text-sm"
                  />
                  {stage === 'error' && (
                    <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">
                      <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                  <button
                    onClick={handleExtract}
                    disabled={!storyText.trim()}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Sparkles size={18} /> AI 추출 시작
                  </button>
                </>
              )}

              {stage === 'loading' && (
                <CircularProgress
                  progress={loadingProgress}
                  label="AI가 텍스트를 분석하고 있습니다..."
                  subLabel={`${aiSettings.extractModel.modelName} 사용 중`}
                />
              )}

              {stage === 'done' && extractedData && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold">
                    <CheckCircle2 size={20} /> 추출 완료!
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <SummaryChip icon={<Users size={16} />} label="등장인물" count={extractedData.characters?.length || 0} color="blue" />
                    <SummaryChip icon={<FileText size={16} />} label="플롯" count={extractedData.plots?.length || 0} color="purple" />
                    <SummaryChip icon={<MapPin size={16} />} label="장소" count={extractedData.locations?.length || 0} color="green" />
                  </div>

                  {/* 추출된 엔티티 프리뷰 */}
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {extractedData.characters?.map((c, i) => <EntityChip key={i} type="character" name={c.name} />)}
                    {extractedData.plots?.map((p, i) => <EntityChip key={i} type="plot" name={p.name} />)}
                    {extractedData.locations?.map((l, i) => <EntityChip key={i} type="location" name={l.name} />)}
                  </div>

                  {/* 관계 분석 결과 */}
                  {linkStage === 'loading' && (
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-sm text-indigo-600 dark:text-indigo-400">
                      <Loader2 size={14} className="animate-spin" />
                      엔티티 간 관계를 분석하는 중...
                    </div>
                  )}
                  {linkStage === 'done' && links.length > 0 && (
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                      <div className="flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 mb-2">
                        <Link size={12} /> {links.length}개 관계 자동 연결 예정 (태그 요소)
                      </div>
                      <div className="space-y-1">
                        {links.map((l, i) => (
                          <div key={i} className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1">
                            <span className="font-medium text-slate-800 dark:text-slate-200">{l.fromName}</span>
                            <span className="text-slate-400">→</span>
                            <span className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded text-[11px] flex items-center gap-1">
                              <Tag size={9} /> {l.fieldKey}
                            </span>
                            <span className="text-slate-400">→</span>
                            <span className="font-medium text-slate-800 dark:text-slate-200">{l.toName}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-3 pt-1">
                    <button
                      onClick={() => { setStage('idle'); setExtractedData(null); setLinks([]); setLinkStage('idle'); }}
                      className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
                    >
                      다시 시도
                    </button>
                    <button
                      onClick={handleImport}
                      className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <CheckCircle2 size={18} />
                      {links.length > 0 ? `등록 + 관계 연결 + 무결성 검사` : '세계관에 등록 + 무결성 검사'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 무결성 검사 결과 ── */}
          {mode === 'integrity' && (
            <div className="space-y-4">
              {stage === 'loading' && (
                <CircularProgress
                  progress={loadingProgress}
                  label="AI가 세계관 데이터를 교차 검사하고 있습니다..."
                  subLabel={`${aiSettings.checkModel.modelName} 사용 중`}
                  colorClass="text-emerald-600 dark:text-emerald-400"
                />
              )}
              {stage === 'error' && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {stage === 'done' && (
                <>
                  {issues.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-4 text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 size={52} />
                      <p className="text-xl font-bold">모순 없음! 세계관 무결</p>
                      <p className="text-sm text-slate-500">발견된 논리적 오류가 없습니다.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-orange-600 dark:text-orange-400 font-bold text-sm">
                        <AlertTriangle size={18} /> {issues.length}개의 문제가 발견되었습니다
                      </div>
                      {issues.map((issue, i) => {
                        const path = getEntityPath(issue);
                        return (
                          <div key={i} className="p-4 border border-orange-200 dark:border-orange-900/50 bg-orange-50 dark:bg-orange-900/10 rounded-xl space-y-2">
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-md mr-2 ${
                                  issue.type === 'character' ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'
                                  : issue.type === 'plot'    ? 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300'
                                  : 'bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300'
                                }`}>
                                  {issue.type === 'character' ? '인물' : issue.type === 'plot' ? '플롯' : issue.type === 'location' ? '장소' : '일반'}
                                </span>
                                <span className="font-semibold text-slate-800 dark:text-slate-200">{issue.entityName || '알 수 없음'}</span>
                              </div>
                              <div className="flex items-center gap-2 flex-shrink-0">
                                {path && (
                                  <button
                                    onClick={() => { navigate(path); onClose(); }}
                                    className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                                  >
                                    <ExternalLink size={13} /> 이동
                                  </button>
                                )}
                                {issue.suggestedFix && (
                                  <button
                                    onClick={() => handleAutoFix(issue)}
                                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-indigo-100 hover:bg-indigo-200 dark:bg-indigo-900/40 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 rounded-lg font-bold transition-colors"
                                  >
                                    <Wand2 size={13} /> Auto Fix
                                  </button>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-slate-700 dark:text-slate-300">{issue.description}</p>
                            {issue.suggestedFix && (
                              <p className="text-xs text-slate-500 dark:text-slate-500 border-t border-orange-200 dark:border-orange-900/30 pt-2">
                                <strong>제안:</strong> {issue.suggestedFix}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── Diff UI ── */}
          {mode === 'diff' && diffItem && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm text-slate-500">
                <Wand2 size={16} className="text-indigo-500" />
                <span>AI가 제안하는 수정 내용을 검토하세요. 수락하거나 거절할 수 있습니다.</span>
              </div>
              <div className="grid grid-cols-2 gap-4">
                {/* 원본 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-red-600 dark:text-red-400 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-red-500 inline-block" /> 수정 전 (원본)
                  </h3>
                  <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-200 dark:border-red-900/50 min-h-[200px]">
                    {diffItem.entity ? (
                      (diffItem.entity.details || []).map((f, i) => (
                        <div key={i} className="mb-2">
                          <div className="text-xs text-slate-500">{f.key}</div>
                          <div className="text-sm">
                            {f.type === 'text'
                              ? (f.value || '(비어 있음)')
                              : (f.tags || []).map(t => t.name).join(', ') || '(비어 있음)'}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-slate-500">(데이터 없음)</p>
                    )}
                  </div>
                </div>
                {/* AI 수정 제안 */}
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-500 inline-block" /> 수정 후 (AI 제안)
                  </h3>
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/10 rounded-xl border border-emerald-200 dark:border-emerald-900/50 min-h-[200px]">
                    {diffItem.patchedDetails.map((f, i) => (
                      <div key={i} className={`mb-2 ${f.key === 'AI 수정 제안' ? 'border-l-2 border-emerald-500 pl-2' : ''}`}>
                        <div className="text-xs text-slate-500">{f.key}</div>
                        <div className="text-sm">
                          {f.type === 'text'
                            ? (f.value || '(비어 있음)')
                            : (f.tags || []).map(t => t.name).join(', ') || '(비어 있음)'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => { setMode('integrity'); setDiffItem(null); }}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl font-medium transition-colors"
                >
                  거절 (취소)
                </button>
                <button
                  onClick={handleAcceptFix}
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                >
                  <CheckCircle2 size={18} /> 수락 (적용)
                </button>
              </div>
            </div>
          )}

          {/* ── 세계관 확장 제안 ── */}
          {mode === 'expand' && (
            <div className="space-y-4">
              {stage === 'loading' && (
                <CircularProgress
                  progress={loadingProgress}
                  label="AI가 세계관을 분석하고 있습니다..."
                  subLabel="창의적인 확장 요소를 생성 중..."
                  colorClass="text-amber-600 dark:text-amber-400"
                />
              )}
              {stage === 'error' && (
                <div className="flex items-start gap-3 p-4 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">
                  <AlertTriangle size={18} className="flex-shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}
              {stage === 'done' && (
                <>
                  {suggestions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
                      <Lightbulb size={48} />
                      <p className="font-medium">제안이 없습니다</p>
                      <p className="text-sm">세계관이 이미 풍부하게 구성되어 있거나,<br />엔티티가 부족하여 제안을 생성할 수 없습니다.</p>
                      <button
                        onClick={handleExpand}
                        className="mt-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/30 dark:hover:bg-amber-900/50 text-amber-700 dark:text-amber-300 rounded-lg text-sm font-medium transition-colors"
                      >
                        다시 시도
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-bold text-sm">
                        <Lightbulb size={16} /> {suggestions.length}개의 확장 제안
                      </div>
                      {suggestions.map((s, i) => (
                        <div
                          key={i}
                          className={`p-4 border rounded-xl space-y-2 ${CATEGORY_COLORS[s.category]}`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[s.category]}`}>
                                {CATEGORY_LABELS[s.category]}
                              </span>
                              <span className="font-bold text-slate-800 dark:text-slate-100">{s.name}</span>
                            </div>
                            <button
                              onClick={() => handleAddSuggestion(s)}
                              className="flex items-center gap-1 text-xs px-3 py-1.5 bg-white/80 dark:bg-slate-800/80 hover:bg-white dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-bold transition-colors flex-shrink-0 border border-current/20 shadow-sm"
                            >
                              <Plus size={13} /> 세계관에 추가
                            </button>
                          </div>
                          <p className="text-sm opacity-90">{s.reason}</p>
                          {Object.entries(s.details).length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {Object.entries(s.details).map(([k, v]) => (
                                <span key={k} className="text-[11px] px-2 py-0.5 bg-white/60 dark:bg-slate-800/60 rounded-full">
                                  <span className="opacity-60">{k}:</span> {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      <button
                        onClick={handleExpand}
                        className="w-full py-2.5 border-2 border-dashed border-amber-300 dark:border-amber-700 text-amber-600 dark:text-amber-400 rounded-xl text-sm font-medium hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-colors flex items-center justify-center gap-2"
                      >
                        <Sparkles size={15} /> 더 많은 제안 생성
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* ── RAG 질의 UI ── */}
          {mode === 'rag' && (
            <div className="space-y-4">

              {/* 서버 상태 배너 */}
              <div className={`flex items-center justify-between p-3 rounded-xl border text-sm ${
                ragOnline === null
                  ? 'bg-slate-50 dark:bg-slate-800/50 border-slate-200 dark:border-slate-700'
                  : ragOnline
                  ? 'bg-cyan-50 dark:bg-cyan-900/20 border-cyan-200 dark:border-cyan-800'
                  : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
              }`}>
                <div className="flex items-center gap-2">
                  {ragOnline === null ? <Loader2 size={15} className="animate-spin text-slate-400" /> :
                    ragOnline ? <Server size={15} className="text-cyan-600 dark:text-cyan-400" /> :
                    <ServerOff size={15} className="text-red-600 dark:text-red-400" />}
                  <span className={ragOnline ? 'text-cyan-700 dark:text-cyan-300 font-medium' : ragOnline === false ? 'text-red-600 dark:text-red-400 font-medium' : 'text-slate-500'}>
                    {ragOnline === null ? 'RAG 서버 확인 중...' :
                      ragOnline ? (
                        ragStatus?.indexed
                          ? `GraphRAG 서버 연결됨 · ${ragStatus.entityCount}개 엔티티 인덱싱됨`
                          : 'GraphRAG 서버 연결됨 · 인덱싱 필요'
                      ) : 'RAG 서버 오프라인 (python main.py 실행 필요)'}
                  </span>
                </div>
                <button onClick={checkRagStatus} className="p-1 rounded hover:bg-black/10 transition-colors">
                  <RefreshCw size={13} className="text-slate-500" />
                </button>
              </div>

              {/* 오프라인 안내 */}
              {ragOnline === false && (
                <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 space-y-2">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-300">RAG 서버 시작 방법</p>
                  <div className="font-mono text-xs bg-black/80 text-green-400 p-3 rounded-lg space-y-1">
                    <p>cd rag-server</p>
                    <p>pip install -r requirements.txt</p>
                    <p>python main.py</p>
                  </div>
                  <p className="text-xs text-slate-500">처음 실행 시 임베딩 모델(~90MB)이 자동 다운로드됩니다.</p>
                </div>
              )}

              {/* 인덱스 업데이트 버튼 */}
              {ragOnline && (
                <button
                  onClick={handleRagIndex}
                  disabled={ragIndexing}
                  className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 rounded-xl text-sm font-medium hover:bg-cyan-50 dark:hover:bg-cyan-900/10 disabled:opacity-60 transition-colors"
                >
                  {ragIndexing ? <Loader2 size={15} className="animate-spin" /> : <Database size={15} />}
                  {ragIndexing
                    ? '인덱싱 중... (첫 실행 시 임베딩 모델 다운로드로 1-2분 소요)'
                    : `인덱스 업데이트 (${universe.characters.length + universe.plots.length + universe.locations.length}개 엔티티)`}
                </button>
              )}

              {/* 검색 모드 토글 */}
              {ragOnline && ragStatus?.indexed && (
                <>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRagMode('local')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors border-2 ${
                        ragMode === 'local'
                          ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-cyan-300'
                      }`}
                    >
                      <Search size={14} /> Local Search
                    </button>
                    <button
                      onClick={() => setRagMode('global')}
                      className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors border-2 ${
                        ragMode === 'global'
                          ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:border-cyan-300'
                      }`}
                    >
                      <Globe size={14} /> Global Search
                    </button>
                  </div>
                  <p className="text-xs text-slate-500 -mt-1">
                    {ragMode === 'local'
                      ? '🔍 Local: 특정 인물/장소/플롯에 대한 구체적 질문 (그래프 확장 검색)'
                      : '🌐 Global: 세계관 전체의 테마, 구조, 관계에 대한 넓은 질문'}
                  </p>

                  {/* 질문 입력 */}
                  <div className="relative">
                    <textarea
                      value={ragQuestion}
                      onChange={e => setRagQuestion(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleRagQuery(); }}
                      rows={3}
                      placeholder={ragMode === 'local'
                        ? '예: 홍길동의 소속과 역할은? / 아서스와 관련된 플롯은?'
                        : '예: 이 세계관의 주요 갈등 구조는? / 등장인물들의 관계 패턴은?'}
                      className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl resize-none focus:outline-none focus:border-cyan-500 text-sm"
                    />
                    <span className="absolute right-3 bottom-2.5 text-[10px] text-slate-400">Ctrl+Enter</span>
                  </div>

                  <button
                    onClick={handleRagQuery}
                    disabled={ragLoading || !ragQuestion.trim()}
                    className="w-full py-3 bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
                  >
                    {ragLoading ? <Loader2 size={18} className="animate-spin" /> : <MessageSquare size={18} />}
                    {ragLoading ? 'GraphRAG 검색 중...' : `${ragMode === 'local' ? 'Local' : 'Global'} Search`}
                  </button>

                  {/* 에러 */}
                  {ragError && (
                    <div className="flex items-start gap-3 p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">
                      <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
                      <span>{ragError}</span>
                    </div>
                  )}

                  {/* 결과 */}
                  {ragResult && (
                    <div className="space-y-3">
                      <div className="p-4 bg-white dark:bg-slate-900 border border-cyan-200 dark:border-cyan-800 rounded-xl">
                        <div className="flex items-center gap-2 text-xs font-bold text-cyan-600 dark:text-cyan-400 mb-3">
                          <MessageSquare size={13} />
                          GraphRAG 답변
                          <span className="ml-auto text-slate-400 font-normal">
                            {ragResult.mode === 'local'
                              ? `Local Search · ${ragResult.expandedCount}개 그래프 확장`
                              : 'Global Search · 커뮤니티 요약 활용'}
                          </span>
                        </div>
                        <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap leading-relaxed">
                          {ragResult.answer}
                        </p>
                      </div>
                      {ragResult.sources.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          <span className="text-xs text-slate-400 flex items-center gap-1 mr-1">
                            <Database size={11} /> 출처:
                          </span>
                          {ragResult.sources.map((s, i) => (
                            <span key={i} className="text-xs px-2 py-0.5 bg-cyan-50 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 rounded-full">
                              {s}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
};

// ── 보조 컴포넌트 ─────────────────────────────────────────────────────────────

const SummaryChip: React.FC<{ icon: React.ReactNode, label: string, count: number, color: 'blue' | 'purple' | 'green' }> = ({ icon, label, count, color }) => {
  const colors = {
    blue:   'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300',
    purple: 'bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300',
    green:  'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  };
  return (
    <div className={`flex flex-col items-center p-4 rounded-xl ${colors[color]}`}>
      {icon}
      <span className="text-2xl font-bold mt-1">{count}</span>
      <span className="text-xs font-medium mt-0.5">{label}</span>
    </div>
  );
};

const EntityChip: React.FC<{ type: string, name?: string }> = ({ type, name }) => {
  const colors: Record<string, string> = {
    character: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
    plot:      'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
    location:  'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  };
  const labels: Record<string, string> = { character: '인물', plot: '플롯', location: '장소' };
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full mr-1.5 mb-1 ${colors[type]}`}>
      <span className="opacity-70">{labels[type]}</span> {name}
    </span>
  );
};

const CircularProgress: React.FC<{
  progress: number;
  label: string;
  subLabel: string;
  colorClass?: string;
}> = ({ progress, label, subLabel, colorClass = "text-indigo-600 dark:text-indigo-400" }) => {
  const size = 120;
  const strokeWidth = 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const strokeDashoffset = circumference - (Math.min(progress, 100) / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center py-12 gap-5">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            className="text-slate-100 dark:text-slate-800"
            stroke="currentColor"
            strokeWidth={strokeWidth}
          />
          {/* Progress circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="transparent"
            className={`${colorClass} transition-all duration-300 ease-out`}
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute flex flex-col items-center justify-center">
          <span className="text-xl font-black text-slate-850 dark:text-slate-50">
            {Math.round(progress)}%
          </span>
        </div>
      </div>
      <div className="text-center space-y-1">
        <p className="text-slate-700 dark:text-slate-200 font-bold text-base">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">{subLabel}</p>
      </div>
    </div>
  );
};

export default AIToolsModal;
