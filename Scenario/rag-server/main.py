"""
main.py – GraphRAG FastAPI Server

엔드포인트:
  GET  /status        → 인덱스 상태 조회
  POST /index         → Universe 데이터 인덱싱
  POST /query         → GraphRAG 질의 (local / global 모드)
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from graph_rag import GraphRAGEngine

# ── 로깅 설정 ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

# ── 앱 초기화 ─────────────────────────────────────────────────────────────────

rag_engine: GraphRAGEngine = None  # type: ignore


@asynccontextmanager
async def lifespan(app: FastAPI):
    global rag_engine
    logger.info("GraphRAG 서버 시작 중...")
    rag_engine = GraphRAGEngine(persist_dir="./chroma_data")
    logger.info("GraphRAG 서버 준비 완료 ✓")
    yield
    logger.info("GraphRAG 서버 종료")


app = FastAPI(
    title="GraphRAG Server",
    description="Microsoft GraphRAG에서 영감을 받은 로컬 RAG 파이프라인입니다.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 요청/응답 모델 ────────────────────────────────────────────────────────────


class IndexRequest(BaseModel):
    universe: dict = Field(..., description="Universe 전체 데이터 (JSON)")


class QueryRequest(BaseModel):
    question: str = Field(..., description="사용자 질문")
    ollamaModel: str = Field(default="gemma2:latest", description="Ollama 모델명")
    mode: str = Field(default="local", description="local | global")
    nResults: int = Field(default=3, ge=1, le=10, description="초기 벡터 검색 수")


# ── 엔드포인트 ────────────────────────────────────────────────────────────────


@app.get("/status", summary="인덱스 상태 조회")
def get_status():
    """현재 인덱스 상태를 반환합니다."""
    return rag_engine.get_status()


@app.post("/index", summary="Universe 인덱싱")
def index_universe(req: IndexRequest):
    """
    Universe 전체 데이터를 GraphRAG 엔진에 인덱싱합니다.
    엔티티를 텍스트로 변환 → 임베딩 → ChromaDB 저장.
    커뮤니티 요약 문서도 함께 생성됩니다.
    """
    try:
        count = rag_engine.index_universe(req.universe)
        return {
            "success": True,
            "indexed": count,
            "message": f"{count}개 문서 인덱싱 완료 (엔티티 {count-1}개 + 커뮤니티 요약 1개)",
        }
    except Exception as e:
        logger.exception("인덱싱 실패")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/query", summary="GraphRAG 질의")
async def query_rag(req: QueryRequest):
    """
    GraphRAG 방식으로 질의합니다.

    - **local**: 벡터 검색 + TagRef 그래프 확장 (엔티티 중심 질문)
    - **global**: 커뮤니티 요약 + 전체 컨텍스트 (세계관 전체 질문)
    """
    try:
        result = await rag_engine.query(
            question=req.question,
            ollama_model=req.ollamaModel,
            mode=req.mode,
            n_results=req.nResults,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.exception("RAG 질의 실패")
        raise HTTPException(status_code=500, detail=str(e))


# ── 개발용 실행 ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
