import os
import json
import torch
import re
from tqdm import tqdm
from dotenv import load_dotenv
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel

load_dotenv()

# ── 경로 설정 ──────────────────────────────────────────────
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

SCRIPT_DIR      = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR       = os.path.join(SCRIPT_DIR, "model_cache", "hub")

BASE_MODEL_ID   = "google/gemma-4-E4B-it"
LORA_DIR        = os.path.join(SCRIPT_DIR, "gemma4_4b_sft_lora", "final_model")

INPUT_FILE      = os.path.join(SCRIPT_DIR, "data", "chunks.json")
OUTPUT_FILE     = os.path.join(SCRIPT_DIR, "data", "extracted_finetuned_200.json")
PROGRESS_FILE   = os.path.join(SCRIPT_DIR, "data", "progress_finetuned_200.json")

HF_TOKEN        = os.environ.get("HF_TOKEN")

# ── 프롬프트 (학습 때 사용한 instruction과 동일) ────────────
INSTRUCTION = (
    "주어진 소설 시나리오 텍스트에서 인물(characters), 사건(plots), 배경(locations) 개체를 추출하고, "
    "웹 시나리오 어시스턴트에서 사용할 수 있도록 엄격한 JSON 형식으로 반환해. "
    "반드시 아래 스키마를 따르고, JSON 외의 텍스트(마크다운, 설명문)는 절대 출력하지 마.\n\n"
    "출력 스키마:\n"
    "{\n"
    "  \"characters\": [{\"id\": \"tmp_1\", \"name\": \"이름\", \"details\": {\"role\": \"역할\", \"personality\": \"성격\", \"action\": \"행동\", \"physical_state\": \"신체상태\"}}],\n"
    "  \"plots\":      [{\"id\": \"tmp_x\", \"name\": \"사건명\", \"details\": {\"inciting_incident\": \"발단\", \"climax\": \"절정\", \"result\": \"결과\", \"cause_and_effect\": \"인과관계\"}}],\n"
    "  \"locations\":  [{\"id\": \"tmp_x\", \"name\": \"장소명\", \"details\": {\"description\": \"묘사\", \"atmosphere\": \"분위기\", \"period\": \"시대적배경\"}}]\n"
    "}"
)

def clean_json(raw: str) -> dict:
    """모델 출력에서 JSON만 파싱"""
    # 마크다운 코드블록 제거
    raw = re.sub(r"```(?:json)?", "", raw).strip("`").strip()
    # 중괄호 기준으로 JSON 추출
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        return json.loads(match.group())
    raise ValueError("JSON 블록을 찾을 수 없음")

def load_model():
    print(f"[1/2] Base model 로딩: {BASE_MODEL_ID}")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(
        BASE_MODEL_ID, token=HF_TOKEN, cache_dir=CACHE_DIR
    )
    tokenizer.padding_side = "right"
    tokenizer.model_max_length = 2048

    model = AutoModelForCausalLM.from_pretrained(
        BASE_MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto",
        token=HF_TOKEN,
        cache_dir=CACHE_DIR,
    )
    print(f"[2/2] LoRA 어댑터 로딩: {LORA_DIR}")
    model = PeftModel.from_pretrained(model, LORA_DIR)
    model.eval()
    print("모델 준비 완료!")
    return tokenizer, model

def extract(text: str, tokenizer, model) -> dict:
    prompt = f"Instruction:\n{INSTRUCTION}\n\nInput:\n{text}\n\nOutput:\n"
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=768).to("cuda")

    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
            temperature=0.1,
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id,
        )
    # 입력 토큰 이후 부분만 디코딩
    generated = output_ids[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(generated, skip_special_tokens=True)

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"오류: {INPUT_FILE} 없음. 먼저 1_fetch_data.py를 실행하세요.")
        return

    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        chunks = json.load(f)[:200]  # 성능 비교를 위해 200개로 제한

    # 이어하기 지원
    progress = {}
    if os.path.exists(PROGRESS_FILE):
        with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
            progress = json.load(f)
        done = sum(1 for v in progress.values() if not v.get("error"))
        print(f"이전 진행분 {done}개 불러옴, 이어서 시작합니다.")

    tokenizer, model = load_model()

    extracted_results = []
    errors = 0

    for chunk in tqdm(chunks, desc="파인튜닝 모델 추출 중"):
        chunk_id = str(chunk["id"])

        # 이미 성공한 항목은 스킵
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

        # 매 청크마다 진행상황 저장
        with open(PROGRESS_FILE, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(extracted_results, f, ensure_ascii=False, indent=2)

    print(f"\n완료! 성공 {len(extracted_results)}개 / 에러 {errors}개")
    print(f"결과 저장: {OUTPUT_FILE}")

if __name__ == "__main__":
    main()
