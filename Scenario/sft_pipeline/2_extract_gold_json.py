import os
import json
import time
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()

# 사용할 모델 설정 ("claude" 또는 "gemini")
PROVIDER = "claude" # 변경 가능

INPUT_FILE = "data/chunks.json"
OUTPUT_FILE = "data/extracted.json"
PROGRESS_FILE = "data/progress.json"

SYSTEM_PROMPT = """You are a creative writing assistant. Extract all story entities from the following text and return ONLY a valid JSON object (no markdown, no explanation).

The JSON must follow this exact schema:
{
  "characters": [ { "id": "string", "name": "string", "details": { "custom_key1": "value", "custom_key2": "value" } } ],
  "plots":      [ { "id": "string", "name": "string", "details": { "custom_key1": "value" } } ],
  "locations":  [ { "id": "string", "name": "string", "details": { "custom_key1": "value" } } ]
}

IMPORTANT: Inside the "details" object, you MUST autonomously identify and extract ANY unique characteristics, defining elements, or notable attributes for each entity found in the text. You are completely free to invent custom key names to categorize these details logically (e.g., Characters: "무기", "성격", "외양" / Locations: "대륙", "아시아의 북동아시아 등 지리적 특성", "기후" / Plots: "핵심사건", "결과", "연결되는 다음 플롯"). Do not limit yourself—capture all rich details the text provides.
IMPORTANT: For every entity, you MUST invent a unique string starting with "tmp_" (e.g., "tmp_1", "tmp_2") for the "id" field.
"""

def extract_with_claude(text):
    import anthropic
    client = anthropic.Anthropic(api_key=os.getenv("ANTHROPIC_API_KEY"))
    
    # 최신 Claude Haiku 4.5 사용 (빠르고 저렴하며 JSON 추출에 매우 뛰어남)
    response = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        system=SYSTEM_PROMPT,
        messages=[
            {"role": "user", "content": f"Text to analyze:\n{text}"}
        ]
    )
    return response.content[0].text

def extract_with_gemini(text):
    import google.generativeai as genai
    genai.configure(api_key=os.getenv("GEMINI_API_KEY"))
    
    # 모델을 명시적으로 지정하여 일일 무료 할당량(1500회)이 넉넉한 2.0 버전 사용
    model = genai.GenerativeModel('gemini-2.0-flash')
    prompt = SYSTEM_PROMPT + f"\n\nText to analyze:\n{text}"
    
    # generation_config에 response_mime_type="application/json" 설정 시 더 안정적입니다.
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(response_mime_type="application/json")
    )
    return response.text

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} 파일이 없습니다. 먼저 1_fetch_data.py를 실행하세요.")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        chunks = json.load(f)

    progress = {}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, 'r', encoding='utf-8') as f:
            progress = json.load(f)
        print(f"이전에 작업한 {len(progress)}개의 데이터를 불러옵니다...")

    extracted_results = []
    
    for chunk in tqdm(chunks, desc="데이터 추출 중"):
        chunk_id = str(chunk['id'])
        
        # 이미 처리된 데이터는 건너뜀 (이어하기 기능)
        if chunk_id in progress and not progress[chunk_id].get("error"):
            extracted_results.append({
                "id": chunk_id,
                "text": chunk['text'],
                "json": progress[chunk_id]["json"]
            })
            continue

        try:
            if PROVIDER == "claude":
                raw_response = extract_with_claude(chunk['text'])
            elif PROVIDER == "gemini":
                raw_response = extract_with_gemini(chunk['text'])
            else:
                raise ValueError("지원하지 않는 PROVIDER 입니다.")
                
            # 마크다운 백틱(`)이 포함된 경우 제거
            clean_json_str = raw_response.strip().strip("```json").strip("```").strip()
            
            # JSON 파싱 검증
            parsed_json = json.loads(clean_json_str)
            
            progress[chunk_id] = {
                "error": False,
                "json": parsed_json
            }
            
            extracted_results.append({
                "id": chunk_id,
                "text": chunk['text'],
                "json": parsed_json
            })
            
            # Rate limit 방지 대기 (Claude Tier 1 기준 50 RPM 고려)
            time.sleep(1.5)
            
        except Exception as e:
            error_msg = str(e)
            print(f"\n에러 발생 (ID {chunk_id}): {error_msg}")
            
            # Rate Limit (429) 또는 Not Found (404) 에러 발생 시 반복문을 중단하여 데이터를 태우지 않도록 함
            if "429" in error_msg or "Quota" in error_msg or "404" in error_msg or "credit" in error_msg.lower():
                print("API 호출 한도/크레딧 부족 또는 지원되지 않는 모델입니다. 작업을 중단합니다.")
                break
                
            progress[chunk_id] = {
                "error": True,
                "json": None,
                "error_msg": error_msg
            }
            # 일반 에러 발생 시 파일에 에러 상태 기록 후 다음 작업 계속 진행
        # 매 Chunk 마다 progress 저장
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(extracted_results, f, ensure_ascii=False, indent=2)

    print(f"\n완료! {len(extracted_results)}개의 정답 JSON이 '{OUTPUT_FILE}'에 저장되었습니다.")

if __name__ == "__main__":
    main()
