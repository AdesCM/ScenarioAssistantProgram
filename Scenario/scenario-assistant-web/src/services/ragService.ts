/**
 * ragService.ts
 *
 * GraphRAG 서버(/api/rag)와 통신하는 프론트엔드 서비스.
 */

const RAG_BASE = '/api/rag';

// ── 타입 ─────────────────────────────────────────────────────────────────────

export interface RAGStatus {
  indexed: boolean;
  chunkCount: number;
  entityCount: number;
  universeId: string | null;
}

export interface RAGQueryResult {
  answer: string;
  sources: string[];
  expandedCount: number;
  mode: 'local' | 'global';
}

// ── API 함수 ──────────────────────────────────────────────────────────────────

/** RAG 서버 연결 및 인덱스 상태 확인 */
export async function getRagStatus(): Promise<RAGStatus> {
  const res = await fetch(`${RAG_BASE}/status`, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error('RAG 서버에 연결할 수 없습니다');
  return res.json();
}

/** RAG 서버가 살아있는지 ping */
export async function checkRagAlive(): Promise<boolean> {
  try {
    await getRagStatus();
    return true;
  } catch {
    return false;
  }
}

/** Universe 전체를 인덱싱 요청 */
export async function indexUniverse(universe: object): Promise<{ indexed: number; message: string }> {
  const res = await fetch(`${RAG_BASE}/index`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ universe }),
    signal: AbortSignal.timeout(120000), // 인덱싱은 오래 걸릴 수 있음
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || '인덱싱 실패');
  }
  return res.json();
}

/** GraphRAG 질의 */
export async function queryRAG(
  question: string,
  ollamaModel: string,
  mode: 'local' | 'global' = 'local',
  nResults: number = 3,
): Promise<RAGQueryResult> {
  const res = await fetch(`${RAG_BASE}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, ollamaModel, mode, nResults }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as any).detail || 'RAG 질의 실패');
  }
  return res.json();
}
