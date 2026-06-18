import os
import json
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from tqdm import tqdm
from dotenv import load_dotenv

load_dotenv()

INPUT_FILE = "data/chunks.json"
OUTPUT_FILE = "data/extracted_exaone.json"
PROGRESS_FILE = "data/progress_exaone.json"
MODEL_ID = "LGAI-EXAONE/EXAONE-3.0-7.8B-Instruct"

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

def setup_model():
    token = os.environ.get("HF_TOKEN")
    print(f"Loading EXAONE model '{MODEL_ID}' to GPU...")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, trust_remote_code=True, token=token)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, 
        torch_dtype=torch.bfloat16, 
        device_map="auto", 
        trust_remote_code=True,
        token=token
    )
    return model, tokenizer

def extract_with_exaone(text, model, tokenizer):
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"Text to analyze:\n{text}"}
    ]
    
    input_ids = tokenizer.apply_chat_template(
        messages, 
        tokenize=True, 
        add_generation_prompt=True, 
        return_tensors="pt"
    ).to(model.device)
    
    output = model.generate(
        input_ids,
        max_new_tokens=2048,
        eos_token_id=tokenizer.eos_token_id,
        do_sample=False,
        temperature=0.0
    )
    
    # 생성된 텍스트 부분만 추출
    generated_text = tokenizer.decode(output[0][input_ids.shape[-1]:], skip_special_tokens=True)
    return generated_text

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

    # 모델은 처음 한 번만 로드
    model, tokenizer = setup_model()
    
    extracted_results = []
    
    for chunk in tqdm(chunks, desc="EXAONE 데이터 추출 중"):
        chunk_id = str(chunk['id'])
        
        # 이미 처리된 데이터는 건너뜀
        if chunk_id in progress and not progress[chunk_id].get("error"):
            extracted_results.append({
                "id": chunk_id,
                "text": chunk['text'],
                "json": progress[chunk_id]["json"]
            })
            continue

        try:
            raw_response = extract_with_exaone(chunk['text'], model, tokenizer)
                
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
            
        except Exception as e:
            error_msg = str(e)
            print(f"\n에러 발생 (ID {chunk_id}): {error_msg}")
            
            progress[chunk_id] = {
                "error": True,
                "json": None,
                "error_msg": error_msg
            }
            
        # 매 Chunk 마다 progress 저장
        with open(PROGRESS_FILE, 'w', encoding='utf-8') as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)

    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        json.dump(extracted_results, f, ensure_ascii=False, indent=2)

    print(f"\n완료! {len(extracted_results)}개의 정답 JSON이 '{OUTPUT_FILE}'에 저장되었습니다.")

if __name__ == "__main__":
    main()
