"""
graph_rag.py – GraphRAG-inspired local RAG engine

Microsoft GraphRAG에서 영감을 받은 하이브리드 검색 시스템:

1. [인덱싱]
   - 각 엔티티(인물/플롯/장소)를 자연어 텍스트로 변환
   - TagRef 링크를 그래프 엣지로 저장
   - Universe 전체 커뮤니티 요약 문서 생성 (GraphRAG Global Search용)
   - sentence-transformers로 임베딩 → ChromaDB 저장

2. [Local Search] — 엔티티 중심 질의
   - 질문을 임베딩 → 벡터 유사도로 관련 엔티티 탐색
   - 발견된 엔티티에서 TagRef 엣지를 따라 1-hop 이웃 확장 (Multi-hop reasoning)
   - 확장된 컨텍스트로 Ollama 답변 생성

3. [Global Search] — 세계관 전체 질의
   - 커뮤니티 요약 문서를 포함한 넓은 컨텍스트 사용
   - 세계관의 테마, 관계 패턴 등 거시적 질문에 적합
"""

import json
import logging
from typing import Optional

import chromadb
import httpx
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

# 임베딩 모델 (경량, ~90MB, CPU 최적화)
EMBED_MODEL = "all-MiniLM-L6-v2"
OLLAMA_BASE = "http://localhost:11434"

# 커뮤니티 요약 문서 ID (Global Search용)
COMMUNITY_SUMMARY_ID = "__universe_community_summary__"


class GraphRAGEngine:
    """
    GraphRAG-inspired Retrieval Engine

    Knowledge Graph 구조:
    - 노드: Entity (character / plot / location)
    - 엣지: TagRef (DetailField의 tag 타입 필드가 연결하는 링크)
    - 커뮤니티: Universe (단일 커뮤니티로 처리)
    """

    def __init__(self, persist_dir: str = "./chroma_data"):
        logger.info(f"임베딩 모델 로딩: {EMBED_MODEL}")
        self.embedder = SentenceTransformer(EMBED_MODEL)
        self.chroma = chromadb.PersistentClient(path=persist_dir)
        self.collection: Optional[chromadb.Collection] = None
        # 그래프 구조: id → { type, name, data, neighbor_ids: [id, ...] }
        self.graph: dict = {}
        self.current_universe_id: Optional[str] = None
        logger.info("GraphRAG 엔진 초기화 완료")

    # ──────────────────────────────────────────────────────────────────────────
    # 인덱싱 (Indexing Phase)
    # ──────────────────────────────────────────────────────────────────────────

    def _entity_to_text(self, entity: dict, entity_type: str) -> str:
        """엔티티 → 자연어 설명 (임베딩할 문서)"""
        type_label = {"character": "인물", "plot": "플롯", "location": "장소"}.get(entity_type, entity_type)
        lines = [f"[{type_label.upper()}] {entity.get('name', '알 수 없음')}"]

        for field in entity.get("details", []):
            key = field.get("key", "")
            if not key:
                continue
            if field.get("type") == "text":
                val = field.get("value", "").strip()
                if val:
                    lines.append(f"{key}: {val}")
            elif field.get("type") == "tag":
                tag_names = [t.get("name", "") for t in field.get("tags", []) if t.get("name")]
                if tag_names:
                    lines.append(f"{key}: {', '.join(tag_names)}")

        return "\n".join(lines)

    def _extract_neighbor_ids(self, entity: dict) -> list[str]:
        """엔티티의 TagRef 엣지에서 이웃 노드 ID 추출"""
        ids = []
        for field in entity.get("details", []):
            if field.get("type") == "tag":
                for tag in field.get("tags", []):
                    if tag.get("id"):
                        ids.append(tag["id"])
        return ids

    def _build_community_summary(self, universe: dict) -> str:
        """
        GraphRAG의 Community Report에 해당:
        Universe 전체를 포괄하는 요약 문서 생성
        → Global Search 질의에서 핵심 컨텍스트 역할
        """
        name = universe.get("name", "알 수 없는 세계관")
        chars  = universe.get("characters", [])
        plots  = universe.get("plots", [])
        locs   = universe.get("locations", [])

        char_names = ", ".join(c.get("name", "") for c in chars) or "없음"
        plot_names = ", ".join(p.get("name", "") for p in plots) or "없음"
        loc_names  = ", ".join(l.get("name", "") for l in locs) or "없음"

        # 주요 관계 요약
        relations = []
        for entity_list, e_type in [(chars, "인물"), (plots, "플롯"), (locs, "장소")]:
            for entity in entity_list:
                for field in entity.get("details", []):
                    if field.get("type") == "tag" and field.get("tags"):
                        key = field.get("key", "관계")
                        connected = [t.get("name") for t in field.get("tags", []) if t.get("name")]
                        if connected:
                            relations.append(
                                f"  - {entity.get('name')} ({e_type}) → [{key}] → {', '.join(connected)}"
                            )

        relation_text = "\n".join(relations[:30]) if relations else "  (등록된 관계 없음)"

        return f"""[세계관 커뮤니티 요약] {name}

이 세계관은 {len(chars)}명의 인물, {len(plots)}개의 플롯, {len(locs)}개의 장소로 구성됩니다.

등장인물: {char_names}
주요 플롯: {plot_names}
주요 장소: {loc_names}

엔티티 간 주요 관계:
{relation_text}

이 문서는 세계관 전체의 커뮤니티 요약으로,
세계관의 테마, 등장인물 관계, 사건 흐름 등 거시적 질문에 답할 때 활용됩니다."""

    def index_universe(self, universe: dict) -> int:
        """
        Universe 전체를 그래프 + 벡터 DB에 인덱싱

        Returns:
            인덱싱된 총 문서 수
        """
        universe_id = universe.get("id", "default")
        collection_name = f"universe_{universe_id.replace('-', '_')}"

        # 기존 컬렉션 삭제 후 재생성 (완전 재인덱싱)
        try:
            self.chroma.delete_collection(collection_name)
        except Exception:
            pass
        self.collection = self.chroma.get_or_create_collection(
            name=collection_name,
            metadata={"hnsw:space": "cosine"},
        )

        self.graph = {}
        documents, ids, metadatas = [], [], []

        # ── 엔티티 수집 ──────────────────────────────────────────────────────
        entity_groups = [
            (universe.get("characters", []), "character"),
            (universe.get("plots", []),      "plot"),
            (universe.get("locations", []),  "location"),
        ]
        for entity_list, e_type in entity_groups:
            for entity in entity_list:
                eid = entity.get("id")
                if not eid:
                    continue
                text = self._entity_to_text(entity, e_type)
                neighbor_ids = self._extract_neighbor_ids(entity)

                self.graph[eid] = {
                    "type": e_type,
                    "name": entity.get("name", ""),
                    "data": entity,
                    "neighbor_ids": neighbor_ids,
                }
                documents.append(text)
                ids.append(eid)
                metadatas.append({
                    "type": e_type,
                    "name": entity.get("name", ""),
                    "neighbor_ids": json.dumps(neighbor_ids),
                })

        # ── 커뮤니티 요약 문서 추가 (GraphRAG Global Context) ────────────────
        summary_text = self._build_community_summary(universe)
        documents.append(summary_text)
        ids.append(COMMUNITY_SUMMARY_ID)
        metadatas.append({"type": "community_summary", "name": "세계관 커뮤니티 요약", "neighbor_ids": "[]"})

        # ── ChromaDB에 임베딩 + 저장 ─────────────────────────────────────────
        if documents:
            logger.info(f"{len(documents)}개 문서 임베딩 중...")
            embeddings = self.embedder.encode(documents, show_progress_bar=False).tolist()
            self.collection.add(
                documents=documents,
                ids=ids,
                metadatas=metadatas,
                embeddings=embeddings,
            )

        self.current_universe_id = universe_id
        logger.info(f"인덱싱 완료: {len(documents)}개 (엔티티 {len(documents)-1}개 + 커뮤니티 요약 1개)")
        return len(documents)

    # ──────────────────────────────────────────────────────────────────────────
    # 검색 (Query Phase)
    # ──────────────────────────────────────────────────────────────────────────

    def _local_search(self, question: str, n_results: int = 3) -> tuple[list[str], list[str]]:
        """
        Local Search (GraphRAG Local Query):
        1. 벡터 유사도로 관련 엔티티 발견
        2. 그래프 엣지(TagRef)로 1-hop 이웃 확장 → Multi-hop reasoning
        """
        q_embedding = self.embedder.encode([question]).tolist()
        total = self.collection.count()
        results = self.collection.query(
            query_embeddings=q_embedding,
            n_results=min(n_results, total),
        )

        found_ids   = set(results["ids"][0])
        context_docs = list(results["documents"][0])
        source_names = [m["name"] for m in results["metadatas"][0]]

        # 그래프 확장: 발견된 노드의 이웃 노드 추가
        expanded_ids = set()
        for eid in list(found_ids):
            if eid == COMMUNITY_SUMMARY_ID:
                continue
            node = self.graph.get(eid)
            if node:
                for neighbor_id in node["neighbor_ids"]:
                    if neighbor_id not in found_ids and neighbor_id not in expanded_ids:
                        expanded_ids.add(neighbor_id)

        for eid in expanded_ids:
            node = self.graph.get(eid)
            if node:
                text = self._entity_to_text(node["data"], node["type"])
                context_docs.append(f"[관련 엔티티]\n{text}")
                source_names.append(f"{node['name']} (그래프 확장)")

        return context_docs, source_names

    def _global_search(self, n_results: int = 5) -> tuple[list[str], list[str]]:
        """
        Global Search (GraphRAG Global Query):
        커뮤니티 요약 + 상위 엔티티들을 컨텍스트로 제공
        """
        total = self.collection.count()
        results = self.collection.get(
            ids=[COMMUNITY_SUMMARY_ID],
            include=["documents"],
        )
        summary_docs = results["documents"] if results["documents"] else []

        # 추가로 전체 엔티티 일부를 포함
        sample = self.collection.query(
            query_embeddings=self.embedder.encode(["세계관 전체 개요"]).tolist(),
            n_results=min(n_results, total),
        )
        all_docs  = summary_docs + list(sample["documents"][0])
        all_names = ["커뮤니티 요약"] + [m["name"] for m in sample["metadatas"][0]]
        return all_docs, all_names

    async def query(
        self,
        question: str,
        ollama_model: str,
        mode: str = "local",
        n_results: int = 3,
    ) -> dict:
        """
        GraphRAG 질의

        Args:
            question: 사용자 질문
            ollama_model: 답변 생성용 Ollama 모델
            mode: "local" (엔티티 중심) | "global" (세계관 전체)
            n_results: 초기 벡터 검색 결과 수
        """
        if not self.collection or self.collection.count() == 0:
            raise ValueError("세계관이 인덱싱되지 않았습니다. 먼저 '인덱스 업데이트'를 클릭하세요.")

        if mode == "global":
            context_docs, source_names = self._global_search(n_results)
            system_prompt = "당신은 세계관 전체를 이해하는 세계 편집자입니다. 세계관의 큰 그림과 전체적인 구조에 대해 답변해주세요."
        else:
            context_docs, source_names = self._local_search(question, n_results)
            system_prompt = "당신은 세계관 데이터베이스 전문가입니다. 제공된 컨텍스트를 바탕으로 구체적이고 정확하게 답변해주세요."

        context = "\n\n---\n\n".join(context_docs)
        expanded_count = max(0, len(source_names) - n_results)

        user_prompt = f"""다음은 세계관 데이터베이스에서 검색된 관련 정보입니다:

{context}

---

질문: {question}

위 컨텍스트를 바탕으로 한국어로 구체적으로 답변해주세요. 
컨텍스트에 없는 정보는 추측하지 마세요."""

        async with httpx.AsyncClient(timeout=600.0) as client:
            response = await client.post(
                f"{OLLAMA_BASE}/api/chat",
                json={
                    "model": ollama_model,
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt},
                    ],
                    "stream": False,
                },
            )
            response.raise_for_status()
            answer = response.json()["message"]["content"]

        return {
            "answer": answer,
            "sources": list(dict.fromkeys(source_names)),  # 순서 유지하며 중복 제거
            "expandedCount": expanded_count,
            "mode": mode,
        }

    # ──────────────────────────────────────────────────────────────────────────
    # 상태 조회
    # ──────────────────────────────────────────────────────────────────────────

    def get_status(self) -> dict:
        count = self.collection.count() if self.collection else 0
        entity_count = max(0, count - 1) if count > 0 else 0  # 커뮤니티 요약 1개 제외
        return {
            "indexed": self.collection is not None and count > 0,
            "chunkCount": count,
            "entityCount": entity_count,
            "universeId": self.current_universe_id,
        }
