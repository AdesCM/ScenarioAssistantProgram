import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Moon, Sun, HardDrive, Trash2, Monitor, Wifi, WifiOff,
  Download, Loader2, RefreshCw, CheckCircle2, AlertTriangle, ChevronDown, Key, ExternalLink,
  Server, ServerOff, Database } from 'lucide-react';
import { useTheme } from '../contexts/ThemeContext';
import { useUniverse } from '../contexts/UniverseContext';

import {
  fetchOllamaModels, pullOllamaModel, checkOllamaStatus,
  RECOMMENDED_MODELS, CLOUD_PROVIDERS,
} from '../services/aiService';
import { getRagStatus } from '../services/ragService';
import type { RAGStatus } from '../services/ragService';
import type { AIProvider, OllamaModel } from '../services/aiService';

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { aiSettings, updateAISettings, universes, clearAllData, importUniverses } = useUniverse();

  const [ollamaConnected, setOllamaConnected] = useState<boolean | null>(null);
  const [installedModels, setInstalledModels] = useState<OllamaModel[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [pullModelName, setPullModelName] = useState('');
  const [pullProgress, setPullProgress] = useState<string>('');
  const [isPulling, setIsPulling] = useState(false);
  const [cloudApiKeys, setCloudApiKeys] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('cloudApiKeys') || '{}'); } catch { return {}; }
  });

  // RAG 서버 상태
  const [ragStatus, setRagStatus] = useState<RAGStatus | null>(null);
  const [ragOnline, setRagOnline] = useState<boolean | null>(null);
  const [ragChecking, setRagChecking] = useState(false);

  const checkRag = async () => {
    setRagChecking(true);
    try {
      const s = await getRagStatus();
      setRagStatus(s);
      setRagOnline(true);
    } catch {
      setRagOnline(false);
      setRagStatus(null);
    } finally {
      setRagChecking(false);
    }
  };

  // Ollama 연결 확인 및 모델 로드
  const refreshOllama = async () => {
    setLoadingModels(true);
    const connected = await checkOllamaStatus();
    setOllamaConnected(connected);
    if (connected) {
      const models = await fetchOllamaModels();
      setInstalledModels(models);
    }
    setLoadingModels(false);
  };

  useEffect(() => { refreshOllama(); checkRag(); }, []);

  // 모델 다운로드
  const handlePull = async () => {
    if (!pullModelName.trim()) return;
    setIsPulling(true);
    setPullProgress('다운로드 시작 중...');
    try {
      for await (const progress of pullOllamaModel(pullModelName.trim())) {
        if (progress.total && progress.completed) {
          const pct = Math.round((progress.completed / progress.total) * 100);
          setPullProgress(`${progress.status} (${pct}%)`);
        } else {
          setPullProgress(progress.status);
        }
      }
      setPullProgress('완료!');
      setPullModelName('');
      await refreshOllama();
    } catch (e: any) {
      setPullProgress(`오류: ${e.message}`);
    } finally {
      setIsPulling(false);
    }
  };

  const saveApiKey = (providerId: string, key: string) => {
    const newKeys = { ...cloudApiKeys, [providerId]: key };
    setCloudApiKeys(newKeys);
    localStorage.setItem('cloudApiKeys', JSON.stringify(newKeys));
  };

  const modelSelectorOptions = [
    ...(ollamaConnected ? installedModels.map(m => ({ label: `[로컬] ${m.name}`, value: `ollama::${m.name}` })) : []),
    ...CLOUD_PROVIDERS.flatMap(p => p.models.map(m => ({ label: `[${p.name}] ${m}`, value: `${p.id}::${m}` }))),
  ];

  const parseModelValue = (val: string): { provider: AIProvider; modelName: string } => {
    const [prov, ...rest] = val.split('::');
    return { provider: prov as AIProvider, modelName: rest.join('::') };
  };

  const extractValue = `${aiSettings.extractModel.provider}::${aiSettings.extractModel.modelName}`;
  const checkValue = `${aiSettings.checkModel.provider}::${aiSettings.checkModel.modelName}`;

  // JSON 기능 핸들러
  const handleExportData = () => {
    const dataStr = JSON.stringify(universes, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scenario_assistant_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportData = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          if (Array.isArray(parsed)) {
            importUniverses(parsed);
            alert('데이터를 성공적으로 불러왔습니다!');
          } else {
            alert('유효하지 않은 데이터 형식입니다.');
          }
        } catch (error) {
          alert('JSON 파일을 분석하는 중 오류가 발생했습니다.');
        }
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearData = () => {
    if (window.confirm('정말로 모든 세계관 데이터를 영구적으로 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.')) {
      clearAllData();
      alert('모든 데이터가 초기화되었습니다.');
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-slate-50 dark:bg-[#0f172a] transition-colors overflow-hidden">
      <header className="flex shrink-0 h-16 items-center px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b]">
        <button onClick={() => navigate(-1)} className="p-2 mr-4 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors">
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-bold">환경 설정</h2>
      </header>

      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-10">

          {/* ── 테마 ── */}
          <Section title="화면 테마">
            <SettingsRow
              icon={theme === 'dark' ? <Moon size={20} /> : <Sun size={20} />}
              iconBg="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              title="다크 / 라이트 모드"
              subtitle={`현재 테마: ${theme === 'dark' ? '다크 모드' : '라이트 모드'}`}
              onClick={toggleTheme}
              right={
                <div className={`w-12 h-6 rounded-full p-1 transition-colors ${theme === 'dark' ? 'bg-blue-600' : 'bg-slate-300'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full transition-transform ${theme === 'dark' ? 'translate-x-6' : 'translate-x-0'}`} />
                </div>
              }
            />
          </Section>

          {/* ── 로컬 AI (Ollama) ── */}
          <Section title="로컬 AI 설정 (Ollama)">
            {/* 연결 상태 */}
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {ollamaConnected === null ? <Loader2 size={18} className="animate-spin text-slate-400" /> :
                    ollamaConnected ? <Wifi size={18} className="text-emerald-500" /> : <WifiOff size={18} className="text-red-500" />}
                  <div>
                    <div className="font-medium">Ollama 연결 상태</div>
                    <div className="text-xs text-slate-500">
                      {ollamaConnected === null ? '확인 중...' : ollamaConnected ? `연결됨 (${installedModels.length}개 모델 설치됨)` : '연결 실패 - Ollama 앱이 실행 중인지 확인하세요'}
                    </div>
                  </div>
                </div>
                <button onClick={refreshOllama} disabled={loadingModels}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                  <RefreshCw size={16} className={loadingModels ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* 설치된 모델 목록 */}
              {installedModels.length > 0 && (
                <div className="border-t border-slate-200 dark:border-slate-800 pt-3">
                  <div className="text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">설치된 모델</div>
                  <div className="space-y-1">
                    {installedModels.map(m => (
                      <div key={m.name} className="flex items-center gap-2 text-sm">
                        <CheckCircle2 size={14} className="text-emerald-500 flex-shrink-0" />
                        <span className="font-mono">{m.name}</span>
                        <span className="text-slate-400 text-xs ml-auto">{(m.size / 1e9).toFixed(1)}GB</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 모델 다운로드 */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-3 space-y-3">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">모델 다운로드</div>
                {/* 권장 모델 */}
                <div className="flex flex-wrap gap-2">
                  {RECOMMENDED_MODELS.map(m => (
                    <button key={m.name} onClick={() => setPullModelName(m.name)}
                      className={`text-xs px-2 py-1 rounded-md border transition-colors ${pullModelName === m.name ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'}`}>
                      {m.name}
                    </button>
                  ))}
                </div>
                {pullModelName && (
                  <div className="text-xs text-slate-500">
                    {RECOMMENDED_MODELS.find(m => m.name === pullModelName)?.description}
                    <span className="ml-2 font-mono">{RECOMMENDED_MODELS.find(m => m.name === pullModelName)?.size}</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <input type="text" value={pullModelName} onChange={e => setPullModelName(e.target.value)}
                    placeholder="모델명 직접 입력 (예: qwen2.5:7b)"
                    className="flex-1 px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500" />
                  <button onClick={handlePull} disabled={isPulling || !pullModelName.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-sm font-bold flex items-center gap-2 transition-colors">
                    {isPulling ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                    {isPulling ? '다운로드 중...' : '다운로드'}
                  </button>
                </div>
                {pullProgress && (
                  <div className={`text-xs p-2 rounded-lg ${pullProgress.startsWith('오류') ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-slate-100 dark:bg-slate-900 text-slate-600 dark:text-slate-400'}`}>
                    {pullProgress}
                  </div>
                )}
              </div>
            </div>
          </Section>

          {/* ── 온라인 AI (Cloud) ── */}
          <Section title="온라인 AI API 연동 (준비 중)">
            <div className="space-y-3">
              {CLOUD_PROVIDERS.map(provider => (
                <div key={provider.id} className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                        <Key size={16} className="text-slate-500" />
                      </div>
                      <span className="font-medium">{provider.name}</span>
                      <span className="text-xs px-2 py-0.5 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 rounded-full">UI 준비 중</span>
                    </div>
                    <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                      API 키 발급 <ExternalLink size={12} />
                    </a>
                  </div>
                  <input
                    type="password"
                    placeholder="API 키 입력..."
                    value={cloudApiKeys[provider.id] || ''}
                    onChange={e => saveApiKey(provider.id, e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-blue-500 font-mono"
                  />
                </div>
              ))}
            </div>
          </Section>

          {/* ── RAG 서버 상태 ── */}
          <Section title="GraphRAG 서버 (Microsoft GraphRAG 영감)">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {ragChecking || ragOnline === null
                    ? <Loader2 size={18} className="animate-spin text-slate-400" />
                    : ragOnline
                    ? <Server size={18} className="text-cyan-500" />
                    : <ServerOff size={18} className="text-red-500" />}
                  <div>
                    <div className="font-medium">GraphRAG 서버 상태</div>
                    <div className="text-xs text-slate-500">
                      {ragOnline === null || ragChecking ? '확인 중...' :
                        ragOnline
                          ? ragStatus?.indexed
                            ? `연결됨 · ${ragStatus.entityCount}개 엔티티 인덱싱됨 (ChromaDB)`
                            : '연결됨 · 인덱싱 필요'
                          : '온라인 아님 — AI 도구 모달에서 Ctrl+Enter로 서버를 시작하세요'}
                    </div>
                  </div>
                </div>
                <button onClick={checkRag} disabled={ragChecking}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors">
                  <RefreshCw size={16} className={ragChecking ? 'animate-spin' : ''} />
                </button>
              </div>

              {/* 시작 명령 */}
              {!ragOnline && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-3 space-y-2">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">RAG 서버 시작</div>
                  <div className="font-mono text-xs bg-slate-900 text-green-400 px-4 py-3 rounded-xl space-y-1">
                    <p><span className="text-slate-500"># 프로젝트 맨 위 디렉토리에서</span></p>
                    <p>cd rag-server</p>
                    <p>pip install -r requirements.txt</p>
                    <p>python main.py</p>
                  </div>
                  <p className="text-xs text-slate-400">
                    쭙 실행 시 sentence-transformers 임베딩 모델(all-MiniLM-L6-v2, ~90MB)이 자동 다운로드됩니다.
                  </p>
                </div>
              )}

              {/* GraphRAG 아키텍처 설명 */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-3">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">GraphRAG 아키텍처</div>
                <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                  <div className="flex items-start gap-2">
                    <Database size={12} className="text-cyan-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Entity Node</strong> — 세계관의 인물/플롯/장소를 노드로 저장하고 sentence-transformers로 임베딩</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Database size={12} className="text-cyan-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Graph Edge</strong> — 태그 요소(TagRef)가 연결하는 관계를 그래프 엣지로 활용</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Database size={12} className="text-cyan-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Local Search</strong> — 벡터 유사도 검색 + TagRef 타고 Multi-hop 추론</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Database size={12} className="text-cyan-500 mt-0.5 flex-shrink-0" />
                    <span><strong>Global Search</strong> — 코들러 Community Report와 유사한 Universe 코리스 요약 질의</span>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── AI 모델 역할 배정 ── */}
          <Section title="AI 기능별 모델 배정">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] space-y-4">
              <ModelSelector
                label="텍스트 추출용 모델"
                description="스토리 텍스트에서 등장인물/장소/플롯을 추출할 모델"
                options={modelSelectorOptions}
                value={extractValue}
                onChange={val => updateAISettings({ extractModel: parseModelValue(val) })}
                disabled={modelSelectorOptions.length === 0}
              />
              <div className="border-t border-slate-200 dark:border-slate-800" />
              <ModelSelector
                label="무결성 검사용 모델"
                description="세계관 데이터를 교차 검증할 모델 (다른 모델 권장)"
                options={modelSelectorOptions}
                value={checkValue}
                onChange={val => updateAISettings({ checkModel: parseModelValue(val) })}
                disabled={modelSelectorOptions.length === 0}
              />
              {modelSelectorOptions.length === 0 && (
                <div className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                  <AlertTriangle size={14} /> Ollama에 연결하거나 API 키를 입력하면 모델을 선택할 수 있습니다.
                </div>
              )}
            </div>
          </Section>

          {/* ── 데이터 관리 ── */}
          <Section title="데이터 관리">
            <SettingsRow
              icon={<Download size={20} />}
              iconBg="bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400"
              title="JSON 가져오기"
              subtitle="백업된 세계관 JSON 데이터 파일을 불러옵니다."
              onClick={handleImportData}
            />
            <SettingsRow
              icon={<HardDrive size={20} />}
              iconBg="bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
              title="JSON 내보내기 (백업)"
              subtitle="모든 세계관 데이터를 파일로 저장합니다."
              onClick={handleExportData}
            />
            <SettingsRow
              icon={<Trash2 size={20} />}
              iconBg="bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400"
              title="모든 데이터 초기화"
              subtitle="앱의 모든 세계관 데이터를 영구적으로 삭제합니다."
              onClick={handleClearData}
              danger
            />
          </Section>

          {/* ── 앱 정보 ── */}
          <Section title="앱 정보">
            <div className="p-4 flex items-center gap-4 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                <Monitor size={20} />
              </div>
              <div>
                <div className="font-bold">Scenario Assistant Web</div>
                <div className="text-sm text-slate-500">버전 1.1.0 (React Port + AI Integration)</div>
              </div>
            </div>
          </Section>

        </div>
      </main>
    </div>
  );
};

// ── 보조 컴포넌트 ─────────────────────────────────────────────────────────────

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section>
    <h3 className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-4">{title}</h3>
    <div className="space-y-2">{children}</div>
  </section>
);

interface SettingsRowProps {
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
  onClick: () => void;
  right?: React.ReactNode;
  danger?: boolean;
}

const SettingsRow: React.FC<SettingsRowProps> = ({ icon, iconBg, title, subtitle, onClick, right, danger }) => (
  <div onClick={onClick} className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-800 transition-colors">
    <div className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${iconBg}`}>{icon}</div>
      <div>
        <div className={`font-bold ${danger ? 'text-red-600 dark:text-red-400' : ''}`}>{title}</div>
        <div className="text-sm text-slate-500">{subtitle}</div>
      </div>
    </div>
    {right}
  </div>
);

interface ModelSelectorProps {
  label: string;
  description: string;
  options: { label: string; value: string }[];
  value: string;
  onChange: (val: string) => void;
  disabled?: boolean;
}

const ModelSelector: React.FC<ModelSelectorProps> = ({ label, description, options, value, onChange, disabled }) => {
  const isValueMissing = options.length > 0 && value && !options.some(o => o.value === value);

  return (
    <div className="space-y-1.5">
      <div className="font-bold text-sm">{label}</div>
      <div className="text-xs text-slate-500 dark:text-slate-400">{description}</div>
      <div className="relative">
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 text-sm text-slate-900 dark:text-slate-100 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:border-indigo-500 appearance-none cursor-pointer disabled:opacity-50"
        >
          {options.length === 0 ? (
            <option value="">모델 없음</option>
          ) : (
            <>
              {isValueMissing && <option value={value}>{value.split('::')[1]} (설치 안 됨)</option>}
              {options.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </>
          )}
        </select>
        <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
      </div>
    </div>
  );
};

export default SettingsPage;
