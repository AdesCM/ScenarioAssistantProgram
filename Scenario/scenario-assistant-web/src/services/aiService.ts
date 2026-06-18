// AI Service - Ollama(Local) + Cloud AI(UI only) 통합 서비스

export type AIProvider = 'ollama' | 'openai' | 'anthropic' | 'google';

export interface AIModel {
  id: string;
  name: string;
  provider: AIProvider;
  isLocal: boolean;
  contextLength?: number;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  details?: {
    parameter_size?: string;
    family?: string;
  };
}

export interface PullProgress {
  status: string;
  completed?: number;
  total?: number;
  digest?: string;
}

// Vite proxy 경로 via vite.config.ts: /api/ollama -> http://localhost:11434
const OLLAMA_BASE = '/api/ollama';

/**
 * 현재 Ollama에 설치된 모델 목록을 반환합니다
 */
export async function fetchOllamaModels(): Promise<OllamaModel[]> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`);
    if (!res.ok) throw new Error('Ollama에 연결할 수 없습니다');
    const data = await res.json();
    return data.models || [];
  } catch (err) {
    console.error('Ollama 모델 로드 실패:', err);
    return [];
  }
}

/**
 * Ollama에서 모델을 다운로드합니다 (스트리밍)
 */
export async function* pullOllamaModel(modelName: string): AsyncGenerator<PullProgress> {
  const res = await fetch(`${OLLAMA_BASE}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: modelName, stream: true }),
  });

  if (!res.ok) throw new Error(`모델 다운로드 실패: ${res.statusText}`);

  const reader = res.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) throw new Error('스트림을 읽을 수 없습니다');

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    const lines = text.split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        yield JSON.parse(line) as PullProgress;
      } catch {}
    }
  }
}

/**
 * Ollama 로컬 모델로 채팅 완성 요청 (JSON 모드 포함)
 */
export async function ollamaChat(
  model: string,
  systemPrompt: string,
  userContent: string,
  jsonMode: boolean = false
): Promise<string> {
  const res = await fetch(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      stream: false,
      ...(jsonMode ? { format: 'json' } : {}),
    }),
    signal: AbortSignal.timeout(600000)
  }).catch(e => {
    throw new Error('Ollama 응답 시간이 초과되었거나 연결에 실패했습니다. (모델 로딩/추론이 오래 걸리거나 앱이 꺼져있을 수 있습니다.)');
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Ollama 응답 오류: ${errText}`);
  }

  const data = await res.json();
  return data.message?.content || '';
}

/**
 * Cloud AI 공급자별 API 호출 (현재 UI 준비만, 실제 통합은 추후)
 */
export async function cloudAIChat(
  provider: Exclude<AIProvider, 'ollama'>,
  apiKey: string,
  _model: string,
  _systemPrompt: string,
  _userContent: string
): Promise<string> {
  // TODO: 실제 API 연동 구현 (현재 UI 목업용 placeholder)
  throw new Error(`${provider} API 연동은 아직 개발 중입니다. (API 키: ${apiKey ? '설정됨' : '없음'})`);
}

/**
 * Ollama 연결 상태를 확인합니다
 */
export async function checkOllamaStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

// 권장 모델 목록
export const RECOMMENDED_MODELS = [
  { name: 'qwen2.5:7b', description: '균형 잡힌 성능의 중국어/영어 지원 모델 (추천)', size: '~4.7GB' },
  { name: 'qwen2.5:3b', description: '가벼운 Qwen 모델, 빠른 응답', size: '~2.0GB' },
  { name: 'gemma3:4b', description: 'Google Gemma - 소형 고성능 모델', size: '~3.3GB' },
  { name: 'gemma3:12b', description: 'Google Gemma - 중형, 높은 정확도', size: '~8.1GB' },
  { name: 'llama3.1:8b', description: 'Meta Llama 3.1 - 범용 고성능', size: '~4.7GB' },
  { name: 'mistral:7b', description: 'Mistral 7B - 빠르고 정확한 추론', size: '~4.1GB' },
];

// 클라우드 AI 공급자 설정
export const CLOUD_PROVIDERS = [
  { id: 'anthropic' as AIProvider, name: 'Anthropic (Claude)', models: ['claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307'], docsUrl: 'https://console.anthropic.com' },
  { id: 'openai' as AIProvider, name: 'OpenAI (GPT)', models: ['gpt-4o-mini', 'gpt-4o'], docsUrl: 'https://platform.openai.com' },
  { id: 'google' as AIProvider, name: 'Google (Gemini)', models: ['gemini-1.5-flash', 'gemini-1.5-pro'], docsUrl: 'https://aistudio.google.com' },
];
