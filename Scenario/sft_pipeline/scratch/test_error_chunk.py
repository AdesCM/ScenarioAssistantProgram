import os
import json
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel

SCRIPT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE_DIR = os.path.join(SCRIPT_DIR, "model_cache")
os.environ["HF_HOME"] = CACHE_DIR

MODEL_ID = "google/gemma-4-E4B-it"
LORA_DIR = os.path.join(SCRIPT_DIR, "gemma2_2b_sft_optimized", "final_model")
INPUT_FILE = os.path.join(SCRIPT_DIR, "data", "chunks.json")

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

def main():
    print("Loading chunks...")
    with open(INPUT_FILE, "r", encoding="utf-8") as f:
        chunks = json.load(f)
    
    # ID 21번 찾기 (chunks 리스트 내에서 id=21 또는 21번째 아이템)
    target_chunk = None
    for chunk in chunks:
        if str(chunk["id"]) == "74":
            target_chunk = chunk
            break
            
    if not target_chunk:
        print("Target chunk 21 not found, using the 21st chunk in the list")
        target_chunk = chunks[20]
        
    print(f"Target Chunk ID: {target_chunk['id']}")
    print(f"Text snippet: {target_chunk['text'][:150]}...")
    
    print("Loading model and LoRA adapter...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, cache_dir=CACHE_DIR)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto",
        cache_dir=CACHE_DIR
    )
    model = PeftModel.from_pretrained(model, LORA_DIR)
    model.eval()
    
    # Gemma 2 Official Chat Template
    prompt = (
        "<start_of_turn>user\n"
        f"{INSTRUCTION}\n\n"
        f"Input:\n{target_chunk['text']}<end_of_turn>\n"
        "<start_of_turn>model\n"
    )
    
    inputs = tokenizer(prompt, return_tensors="pt").to("cuda")
    
    print("Generating raw output...")
    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
            temperature=0.1,
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id
        )
        
    generated = output_ids[0][inputs["input_ids"].shape[1]:]
    raw_output = tokenizer.decode(generated, skip_special_tokens=True)
    
    print("\n" + "="*50)
    print("RAW MODEL OUTPUT:")
    print("="*50)
    print(raw_output)
    print("="*50)

if __name__ == "__main__":
    main()
