"""
graph_rag_official.py - Official Microsoft GraphRAG Local Search Integration

이 모듈은 공식 microsoft/graphrag 라이브러리의 쿼리 API를 활용하여
사용자 질문과 매칭된 엔티티 및 그에 연결된 "+1 hop 이웃 노드(관계)" 정보를 
컨텍스트로 자동 빌드하여 답변을 생성하는 검색 엔진을 구현합니다.

공식 GraphRAG의 Local Search는 내부적으로 아래와 같이 작동하여 사용자의 요구사항을 만족합니다:
1. 질문과 매칭되는 핵심 엔티티(Entities)를 벡터 유사도로 탐색
2. 탐색된 엔티티와 연결된 모든 관계(Relationships) 및 인접 노드(+1 hop) 정보를 데이터프레임에서 추출
3. 이를 텍스트 유닛(Text Units) 및 커뮤니티 리포트와 조합하여 최종 프롬프트 컨텍스트 생성
"""

import os
import pandas as pd
import tiktoken
from typing import List, Dict, Any, Optional

# Microsoft GraphRAG Query API 임포트
# (주의: 실행 환경에 `pip install graphrag`가 완료되어 있어야 합니다)
try:
    from graphrag.query.llm.oai import ChatOpenAI, OpenAIEmbedding
    from graphrag.query.structured_search.local_search.mixed_context import LocalSearchMixedContext
    from graphrag.query.structured_search.local_search.search import LocalSearch
    from graphrag.query.indexer_adapters import (
        read_indexer_entities,
        read_indexer_relationships,
        read_indexer_reports,
        read_indexer_text_units,
        read_indexer_covariates,
    )
    from graphrag.query.input.loaders.dfs import store_entity_semantic_embeddings
    HAS_GRAPHRAG = True
except ImportError:
    HAS_GRAPHRAG = False


class OfficialGraphRAGEngine:
    def __init__(
        self,
        output_dir: str = "./graphrag_project/output",
        ollama_base_url: str = "http://localhost:11434/v1",
        ollama_model: str = "gemma2:latest",
        embedding_model: str = "all-MiniLM-L6-v2", # 또는 Ollama 임베딩 모델
    ):
        if not HAS_GRAPHRAG:
            raise ImportError(
                "공식 GraphRAG 라이브러리가 설치되어 있지 않습니다. "
                "먼저 'pip install graphrag'를 실행하세요."
            )
            
        self.output_dir = output_dir
        self.ollama_base_url = ollama_base_url
        self.ollama_model = ollama_model
        self.embedding_model = embedding_model
        self.token_encoder = tiktoken.get_encoding("cl100k_base")
        
        # LLM & Embedding 인스턴스 초기화 (Ollama의 OpenAI 호환 API 사용)
        self.llm = ChatOpenAI(
            api_key="ollama", # Ollama는 API 키가 필요 없으나 빈값 에러 방지용 주입
            model=self.ollama_model,
            api_base=self.ollama_base_url,
            max_retries=3,
        )
        
        # 로컬 임베딩 설정 (필요시 OpenAIEmbedding 등을 사용하거나, Hugging Face 모델 매핑)
        self.embeddings = OpenAIEmbedding(
            api_key="ollama",
            model=self.embedding_model,
            api_base=self.ollama_base_url,
            max_retries=3,
        )

    def _find_latest_output_folder(self) -> str:
        """GraphRAG 인덱싱 결과 중 가장 최신 폴더 경로를 찾습니다."""
        if not os.path.exists(self.output_dir):
            raise FileNotFoundError(f"GraphRAG 출력 디렉토리가 존재하지 않습니다: {self.output_dir}")
        
        subfolders = [
            os.path.join(self.output_dir, f) 
            for f in os.listdir(self.output_dir) 
            if os.path.isdir(os.path.join(self.output_dir, f))
        ]
        if not subfolders:
            raise FileNotFoundError(f"인덱싱된 폴더를 찾을 수 없습니다: {self.output_dir}")
            
        # 가장 최근에 수정된 폴더 반환
        return max(subfolders, key=os.path.getmtime)

    def load_search_engine(self) -> LocalSearch:
        """공식 GraphRAG Parquet 테이블들을 로드하고 Local Search 엔진을 구축합니다."""
        latest_folder = self._find_latest_output_folder()
        artifacts_dir = os.path.join(latest_folder, "artifacts")
        
        print(f"최신 인덱스 아티팩트 로딩 중: {artifacts_dir}")
        
        # 1. Parquet 데이터프레임 로드
        entity_df = pd.read_parquet(os.path.join(artifacts_dir, "create_final_nodes.parquet"))
        relationship_df = pd.read_parquet(os.path.join(artifacts_dir, "create_final_relationships.parquet"))
        text_unit_df = pd.read_parquet(os.path.join(artifacts_dir, "create_final_text_units.parquet"))
        
        # 커뮤니티 리포트 및 공변량 로드 (선택 사항)
        try:
            report_df = pd.read_parquet(os.path.join(artifacts_dir, "create_final_community_reports.parquet"))
        except Exception:
            report_df = pd.DataFrame()
            
        try:
            covariate_df = pd.read_parquet(os.path.join(artifacts_dir, "create_final_covariates.parquet"))
        except Exception:
            covariate_df = pd.DataFrame()

        # 2. GraphRAG 어댑터를 사용한 데이터 변환 및 매핑
        entities = read_indexer_entities(entity_df, relationship_df, community_level=1)
        relationships = read_indexer_relationships(relationship_df)
        text_units = read_indexer_text_units(text_unit_df)
        reports = read_indexer_reports(report_df, entity_df, community_level=1)
        
        covariates = []
        if not covariate_df.empty:
            covariates = read_indexer_covariates(covariate_df)

        # 3. 엔티티 임베딩 로드 및 바인딩
        # Local Search는 질문 벡터와 엔티티 설명 벡터 간 유사도 매칭을 사용합니다.
        description_embedding_store = store_entity_semantic_embeddings(
            entities=entities, 
            vectorstore=None # 기본 메모리 벡터 스토어 사용
        )

        # 4. Local Search용 Mixed Context Builder 생성
        # 이 객체가 핵심 엔티티와 그에 연결된 모든 +1 hop 관계(Relationships)를 수집하는 역할을 담당합니다.
        context_builder = LocalSearchMixedContext(
            community_reports=reports,
            text_units=text_units,
            entities=entities,
            relationships=relationships,
            covariates=covariates,
            entity_text_embeddings=description_embedding_store,
            token_encoder=self.token_encoder,
        )

        # 5. Local Search 엔진 초기화
        # 여기서 지정된 LLM 프롬프트에 따라 질문에 인접한 +1 노드들의 관계 서술문이 조립되어 전달됩니다.
        search_engine = LocalSearch(
            llm=self.llm,
            context_builder=context_builder,
            token_encoder=self.token_encoder,
            system_prompt=(
                "당신은 세계관 지식 그래프 전문가입니다. 제공된 인접 엔티티 정보 및 관계 기록을 참고하여, "
                "연결 관계를 바탕으로 사실에 기반해 한국어로 구체적이고 정교하게 답변하세요."
            )
        )
        
        return search_engine

    async def query(self, question: str) -> Dict[str, Any]:
        """질문을 던져 지식 그래프 및 +1 hop 연결 노드 기반 답변을 획득합니다."""
        search_engine = self.load_search_engine()
        
        # 로컬 검색 실행
        result = await search_engine.asearch(
            query=question,
            # context_params를 통해 특정 노드나 관계의 로드 가중치 조절 가능
        )
        
        # 결과 파싱
        return {
            "answer": result.response,
            "context_data": result.context_data, # 빌드된 컨텍스트 통계 및 원본 데이터 정보
            "sources": [
                f"{entity.name} (엔티티)" 
                for entity in result.context_data.get("entities", [])
            ]
        }
