import os
import sys
import argparse
import json
import torch
import re
from tqdm import tqdm
from dotenv import load_dotenv
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()

# VRAM 메모리 단편화 방지
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, "model_cache")

# 프롬프트 (학습 때 사용한 instruction과 동일)
INSTRUCTION = (
    "주어진 소설 시나리오 텍스트에서 인물(characters), 사건(plots), 배경(locations) 개체를 추출하고, 웹 시나리오 어시스턴트에서 사용할 수 있도록 엄격한 JSON 형식으로 반환해.\n"
    "- characters의 세부 속성(details)에는 외양/상태(physical_state), 행동(action), 심리/인식(perception), 대사/발화(vocalization), 상황 맥락(location_context) 등을 포함할 것.\n"
    "- plots의 세부 속성(details)에는 발단(inciting_incident), 전개(development), 절정/결과(climax) 등을 포함할 것.\n"
    "- locations의 세부 속성(details)에는 외형적 묘사(description), 역할/맥락(context), 내부 요소(contents) 등을 포함할 것.\n"
    "출력 포맷은 반드시 다음과 같이 엄격한 JSON 스키마를 유지해야 해: {'characters': [{'id':'tmp_1', 'name':'홍길동', 'details': {'physical_state': '건장함'}}], 'plots': [...], 'locations': [...]}"
)

def parse_args():
    parser = argparse.ArgumentParser(description="Generic SFT Model Extraction Script")
    parser.add_argument(
        "--model_id", 
        type=str, 
        default="deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
        help="Base model ID used for fine-tuning"
    )
    parser.add_argument(
        "--lora_dir", 
        type=str, 
        default="deepseek_1_5b_sft_lora/final_model",
        help="Path to the saved LoRA adapter model"
    )
    parser.add_argument(
        "--output_file", 
        type=str, 
        default="data/extracted_deepseek_1_5b_finetuned.json",
        help="Output file for extracted entities JSON"
    )
    parser.add_argument(
        "--progress_file", 
        type=str, 
        default="data/progress_deepseek_1_5b_finetuned.json",
        help="Progress tracking file"
    )
    parser.add_argument(
        "--limit", 
        type=int, 
        default=200,
        help="Number of chunks to process for evaluation (default: 200)"
    )
    return parser.parse_args()

def clean_json(raw: str) -> dict:
    """모델 출력에서 JSON만 파싱"""
    # 마크다운 코드블록 제거
    raw = re.sub(r"```(?:json)?", "", raw).strip("`").strip()
    # 중괄호 기준으로 JSON 추출
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            # 특수한 경우: JSON 내부에 파싱 불가능한 문자가 섞인 경우,
            # 간단히 raw JSON parsing 실패 에러 발생시킴
            raise ValueError(f"JSON parsing error for content: {match.group()}")
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
        model_id, token=os.environ.get("HF_TOKEN"), cache_dir=CACHE_DIR, trust_remote_code=True
    )
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id
        
    tokenizer.padding_side = "right"
    tokenizer.model_max_length = 2048

    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",
        token=os.environ.get("HF_TOKEN"),
        cache_dir=CACHE_DIR,
        trust_remote_code=True
    )
    
    # LoRA 디렉토리가 존재하는 경우에만 로딩 (Base 모델 단독 평가도 지원할 수 있도록 함)
    if os.path.exists(lora_dir):
        print(f"[2/2] LoRA 어댑터 로딩: {lora_dir}")
        model = PeftModel.from_pretrained(model, lora_dir)
    else:
        print(f"[2/2] 경고: LoRA 디렉토리 '{lora_dir}'가 없어 Base 모델 자체로 추출을 진행합니다.")
        
    model.eval()
    print("모델 준비 완료!")
    return tokenizer, model

def extract(text: str, tokenizer, model) -> str:
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
    args = parse_args()
    
    # 절대경로 매핑
    input_file_path = os.path.join(SCRIPT_DIR, "data", "chunks.json")
    output_file_path = os.path.join(SCRIPT_DIR, args.output_file)
    progress_file_path = os.path.join(SCRIPT_DIR, args.progress_file)
    lora_path = os.path.join(SCRIPT_DIR, args.lora_dir)
    
    if not os.path.exists(input_file_path):
        print(f"오류: {input_file_path} 없음. 먼저 1_fetch_data.py를 실행하세요.")
        return

    with open(input_file_path, "r", encoding="utf-8") as f:
        chunks = json.load(f)[:args.limit]

    # 이어하기 지원
    progress = {}
    if os.path.exists(progress_file_path):
        with open(progress_file_path, "r", encoding="utf-8") as f:
            progress = json.load(f)
        done = sum(1 for v in progress.values() if not v.get("error"))
        print(f"이전 진행분 {done}개 불러옴, 이어서 시작합니다.")

    tokenizer, model = load_model(args.model_id, lora_path)

    extracted_results = []
    errors = 0

    for chunk in tqdm(chunks, desc=f"{args.model_id} 추출 진행 중"):
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
            
            # DeepSeek-R1의 경우 </think> 태그 이후 결과만 가져오기
            if "</think>" in raw:
                raw = raw.split("</think>")[-1].strip()
                
            parsed = clean_json(raw)

            progress[chunk_id] = {"error": False, "json": parsed}
            extracted_results.append({"id": chunk_id, "text": chunk["text"], "json": parsed})

        except Exception as e:
            errors += 1
            print(f"\n에러 (ID {chunk_id}): {e}")
            progress[chunk_id] = {"error": True, "json": None, "error_msg": str(e)}

        # 매 청크마다 진행상황 저장
        with open(progress_file_path, "w", encoding="utf-8") as f:
            json.dump(progress, f, ensure_ascii=False, indent=2)

    with open(output_file_path, "w", encoding="utf-8") as f:
        json.dump(extracted_results, f, ensure_ascii=False, indent=2)

    print(f"\n완료! 성공 {len(extracted_results)}개 / 에러 {errors}개")
    print(f"결과 저장: {output_file_path}")

if __name__ == "__main__":
    main()
