# SFT Dataset 구축 파이프라인

프레젠테이션의 '2번째 학습안' 목표를 달성하기 위해, 단편 소설 원본 텍스트로부터 상용 LLM(Claude 3.5, Gemini)을 활용해 SFT(Supervised Fine-Tuning)용 고품질 `JSONL` 데이터를 자동 생성하는 파이프라인입니다.

## 사전 준비
1. 패키지 설치:
   ```bash
   pip install -r requirements.txt
   ```
2. `.env.example` 파일을 `.env`로 이름을 바꾸고, 발급받은 API 키를 입력하세요.

## 사용 방법

### 1단계: 원천 데이터 준비 (`1_fetch_data.py`)
- `raw_data/` 폴더 안에 원하는 단편소설 또는 텍스트(.txt) 파일들을 모아둡니다.
- 스크립트를 실행하면 모델이 처리하기 좋은 길이로 텍스트를 자른 뒤 `data/chunks.json`으로 저장합니다.
- 기본으로 제공되는 `sample_story.txt`로 먼저 테스트해보세요.
```bash
python 1_fetch_data.py
```

### 2단계: 정답 JSON 추출 (`2_extract_gold_json.py`)
- 스크립트 상단의 `PROVIDER = "claude"` 부분을 `"claude"` 또는 `"gemini"`로 선택합니다.
- API를 호출하여 구조화된 엔티티 JSON을 추출하고 `data/extracted.json`으로 저장합니다.
- (진행 상황은 `data/progress.json`에 실시간 백업되므로 중간에 멈춰도 이어서 실행 가능합니다)
```bash
python 2_extract_gold_json.py
```

### 3단계: SFT 데이터셋 병합 (`3_build_sft_dataset.py`)
- 추출된 결과물을 모아 Llama, Gemma 등을 파인튜닝할 수 있는 `dataset.jsonl` 형식으로 변환합니다.
```bash
python 3_build_sft_dataset.py
```
