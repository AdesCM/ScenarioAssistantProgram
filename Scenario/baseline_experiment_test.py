import os
import requests
import json
import time

# 간단한 F1-Score 및 JSON 에러율 측정 스크립트
# 요구사항: 로컬 Ollama 실행 중 (기본 포트 11434) 및 테스트할 모델 (예: llama3) 준비

OLLAMA_URL = "http://localhost:11434/api/generate"
MODEL_NAME = "gemma4:26b" # 사용 중인 모델 이름으로 변경하세요 (예: qwen2.5)

DATASET_PATH = "e:\\Work\\ScenarioAssistantApplication\\ScenarioAssistantApplication\\Scenario\\dataset_200.json"
PROGRESS_PATH = "e:\\Work\\ScenarioAssistantApplication\\ScenarioAssistantApplication\\Scenario\\experiment_progress.json"

if not os.path.exists(DATASET_PATH):
    print(f"Error: {DATASET_PATH} 파일이 존재하지 않습니다.")
    exit(1)

with open(DATASET_PATH, 'r', encoding='utf-8') as f:
    test_samples = json.load(f)

# 기존 진행 상황 로드 (이어서 하기)
progress = {}
if os.path.exists(PROGRESS_PATH):
    try:
        with open(PROGRESS_PATH, 'r', encoding='utf-8') as f:
            progress = json.load(f)
        print(f"💾 이전에 저장된 {len(progress)}개의 실행 데이터를 불러왔습니다. 이어서 테스트를 진행합니다!")
    except Exception as e:
        print(f"진행 파일 로드 중 에러: {e}")

system_prompt = """You are a creative writing assistant. Extract all story entities from the following text and return ONLY a valid JSON object (no markdown, no explanation).

The JSON must follow this exact schema:
{
  "characters": [ { "id": "string", "name": "string", "details": { "custom_key1": "value", "custom_key2": "value" } } ],
  "plots":      [ { "id": "string", "name": "string", "details": { "custom_key1": "value" } } ],
  "locations":  [ { "id": "string", "name": "string", "details": { "custom_key1": "value" } } ]
}

IMPORTANT: Inside the "details" object, you MUST autonomously identify and extract ANY unique characteristics, defining elements, or notable attributes for each entity found in the text. You are completely free to invent custom key names to categorize these details logically (e.g., Characters: "무기", "성격", "외양", "이명" / Locations: "기후", "특산물", "지배세력" / Plots: "핵심사건", "결과"). Do not limit yourself—capture all rich details the text provides.
IMPORTANT: For every entity, you MUST invent a unique string starting with "tmp_" (e.g., "tmp_1", "tmp_2") for the "id" field.

Text to analyze:
"""

print(f"\n[{MODEL_NAME}] 모델 평가 테스트 시작 (Zero-shot Baseline)\n")

total_samples = len(test_samples)
json_errors = sum(1 for p in progress.values() if p.get('has_error', False))
precision_total = sum(p.get('precision', 0) for p in progress.values())
recall_total = sum(p.get('recall', 0) for p in progress.values())

for i, sample in enumerate(test_samples):
    sample_id = str(sample.get('id', i+1))
    
    # 이미 진행된 데이터는 알아서 스킵됨!
    if sample_id in progress:
        print(f"샘플 {sample_id}: [이미 처리됨, 패스합니다]")
        continue
        
    print(f"\n▶ 샘플 {sample_id}: {sample['text']}")
    
    start_time = time.time()
    
    # Ollama API 호출
    payload = {
        "model": MODEL_NAME,
        "prompt": system_prompt + sample['text'],
        "stream": False,
        "format": "json" # Ollama JSON 포맷 강제
    }
    
    current_has_error = False
    try:
        response = requests.post(OLLAMA_URL, json=payload, timeout=60)
        response.raise_for_status()
        result_text = response.json().get('response', '').strip()
        print(f"-> 모델 응답: {result_text}")
        
        # 실제 웹앱과 동일한 JSON 파싱 시도
        extracted_data = json.loads(result_text)
        
        extracted_entities = []
        if isinstance(extracted_data, dict):
            for cat in ['characters', 'plots', 'locations']:
                if cat in extracted_data and isinstance(extracted_data[cat], list):
                    for item in extracted_data[cat]:
                        if isinstance(item, dict) and 'name' in item:
                            # 모델이 name 필드에 dict 구조를 할루시네이션할 경우 방어
                            extracted_entities.append(str(item['name']).strip())
        else:
            raise ValueError("응답이 지정된 스키마에 부합하지 않음")
            
    except Exception as e:
        print(f"-> [에러] JSON 파싱 실패 또는 포맷 불량: {e}")
        json_errors += 1
        current_has_error = True
        extracted_entities = [] # 에러 시 빈 리스트
        
    expected_set = set(sample['expected_entities'])
    predicted_set = set(extracted_entities)
    
    # 평가 지표 산출
    true_positives = len(expected_set.intersection(predicted_set))
    precision = true_positives / len(predicted_set) if len(predicted_set) > 0 else 0
    recall = true_positives / len(expected_set) if len(expected_set) > 0 else 0
    
    precision_total += precision
    recall_total += recall
    
    print(f"-> 소요 시간: {time.time() - start_time:.2f}초 | P: {precision:.2f}, R: {recall:.2f}")
    
    # === 진척도 자동 저장 로직 ===
    progress[sample_id] = {
        'has_error': current_has_error,
        'precision': precision,
        'recall': recall
    }
    with open(PROGRESS_PATH, 'w', encoding='utf-8') as f:
        json.dump(progress, f, ensure_ascii=False, indent=2)

# 최종 지표 계산
avg_precision = precision_total / total_samples
avg_recall = recall_total / total_samples
f1_score = (2 * avg_precision * avg_recall) / (avg_precision + avg_recall) if (avg_precision + avg_recall) > 0 else 0
json_error_rate = (json_errors / total_samples) * 100

print("\n====================================")
print("           실험 결과 요약             ")
print("====================================")
print(f"총 샘플 수: {total_samples}")
print(f"JSON 포맷 에러율: {json_error_rate:.1f}%")
print(f"정밀도 (Precision): {avg_precision:.3f}")
print(f"재현율 (Recall): {avg_recall:.3f}")
print(f"F1-Score: {f1_score:.3f}")
print("====================================")
print("이 결과는 현재 배포된 로컬 Zero-shot 모델의 초기 Baseline입니다.")
print("기말 목표: SFT를 통해 위 F1-Score를 0.90대 이상, 에러율은 1% 미만으로 도달하는 것입니다.")
