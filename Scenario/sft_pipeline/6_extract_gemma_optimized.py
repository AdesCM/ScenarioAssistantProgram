import os
import sys

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, "model_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
os.environ["HF_HOME"] = CACHE_DIR

import json
import torch
import re
from tqdm import tqdm
from json_repair import repair_json
from dotenv import load_dotenv
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"



INSTRUCTION = (
    "주어진 소설 시나리오 텍스트에서 인물(characters), 사건(plots), 배경(locations) 개체를 추출하고, 웹 시나리오 어시스턴트에서 사용할 수 있도록 엄격한 JSON 형식으로 반환해.\n"
    "- characters의 세부 속성(details)에는 외양/상태(physical_state), 행동(action), 심리/인식(perception), 대사/발화(vocalization), 상황 맥락(location_context) 등을 포함할 것.\n"
    "- plots의 세부 속성(details)에는 발단(inciting_incident), 전개(development), 절정/결과(climax) 등을 포함할 것.\n"
    "- locations의 세부 속성(details)에는 외형적 묘사(description), 역할/맥락(context), 내부 요소(contents) 등을 포함할 것.\n"
    "출력 포맷은 반드시 다음과 같이 엄격한 JSON 스키마를 유지해야 해: {'characters': [{'id':'tmp_1', 'name':'홍길동', 'details': {'physical_state': '건장함'}}], 'plots': [...], 'locations': [...]}"
)

def clean_json(raw: str) -> dict:
    raw = re.sub(r"```(?:json)?", "", raw).strip("`").strip()
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            try:
                repaired = repair_json(match.group(), return_objects=True)
                if isinstance(repaired, dict):
                    return repaired
                if isinstance(repaired, str):
                    return json.loads(repaired)
            except Exception as e:
                raise ValueError(f"JSON parsing error after repair: {e}")
            raise ValueError(f"JSON parsing error")
    raise ValueError("JSON 블록을 찾을 수 없음")

def load_model(model_id, lora_dir):
    print(f"[1/2] Base model 로딩: {model_id}")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        model_id, token=os.environ.get("HF_TOKEN"), cache_dir=CACHE_DIR
    )
    tokenizer.padding_side = "right"
    tokenizer.model_max_length = 2048

    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",
        token=os.environ.get("HF_TOKEN"),
        cache_dir=CACHE_DIR
    )
    
    if os.path.exists(lora_dir):
        print(f"[2/2] LoRA 어댑터 로딩: {lora_dir}")
        model = PeftModel.from_pretrained(model, lora_dir)
        
    model.eval()
    print("모델 준비 완료!")
    return tokenizer, model

def extract(text: str, tokenizer, model) -> str:
    # Gemma 2 공식 Chat Template 적용
    prompt = (
        "<start_of_turn>user\n"
        f"{INSTRUCTION}\n\n"
        f"Input:\n{text}<end_of_turn>\n"
        "<start_of_turn>model\n"
    )
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=1536).to("cuda")

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
            temperature=0.1,
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id,
        )
    # 입력 프롬프트 부분을 제외한 순수 생성 부분만 추출
    generated = output_ids[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(generated, skip_special_tokens=True)

def main():
    input_file_path = os.path.join(SCRIPT_DIR, "data", "chunks.json")
    output_file_path = os.path.join(SCRIPT_DIR, "data", "extracted_gemma2_2b_optimized.json")
    progress_file_path = os.path.join(SCRIPT_DIR, "data", "progress_gemma2_2b_optimized.json")
    
    model_id = "google/gemma-4-E4B-it"
    lora_path = os.path.join(SCRIPT_DIR, "gemma2_2b_sft_optimized", "final_model")
    
    if not os.path.exists(input_file_path):
        print(f"오류: {input_file_path} 없음.")
        return

    with open(input_file_path, "r", encoding="utf-8") as f:
        chunks = json.load(f)[:200]

    progress = {}
    if os.path.exists(progress_file_path):
        with open(progress_file_path, "r", encoding="utf-8") as f:
            progress = json.load(f)

    tokenizer, model = load_model(model_id, lora_path)
    extracted_results = []
    errors = 0

    for chunk in tqdm(chunks, desc="Gemma-2 Optimized 파인튜닝 추출 중"):
        chunk_id = str(chunk["id"])

        if chunk_id in progress and not progress[chunk_id].get("error"):
            extracted_results.append({
                "id": chunk_id,
                "text": chunk["text"],
                "json": progress[chunk_id]["json"],
            })
            continue

        try:
            raw = extract(chunk["text"], tokenizer, model)
            parsed = clean_json(raw)
            progress[chunk_id] = {"error": False, "json": parsed}
            extracted_results.append({"id": chunk_id, "text": chunk["text"], "json": parsed})

        except Exception as e:
            errors += 1
            print(f"\n에러 (ID {chunk_id}): {e}")
            progress[chunk_id] = {"error": True, "json": None, "error_msg": str(e)}

        with open(progress_file_path, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)

    with open(output_file_path, "w", encoding="utf-8") as f:
        json.dump(extracted_results, f, ensure_ascii=False, indent=2)

    print(f"\n완료! 성공 {len(extracted_results)}개 / 에러 {errors}개")

if __name__ == "__main__":
    main()
