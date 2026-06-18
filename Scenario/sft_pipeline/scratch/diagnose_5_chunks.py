import os
import json
import torch
import re
from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
CACHE_DIR = os.path.join(PARENT_DIR, "model_cache")

INSTRUCTION = (
    "주어진 소설 시나리오 텍스트에서 인물(characters), 사건(plots), 배경(locations) 개체를 추출하고, 웹 시나리오 어시스턴트에서 사용할 수 있도록 엄격한 JSON 형식으로 반환해.\n"
    "- characters의 세부 속성(details)에는 외양/상태(physical_state), 행동(action), 심리/인식(perception), 대사/발화(vocalization), 상황 맥락(location_context) 등을 포함할 것.\n"
    "- plots의 세부 속성(details)에는 발단(inciting_incident), 전개(development), 절정/결과(climax) 등을 포함할 것.\n"
    "- locations의 세부 속성(details)에는 외형적 묘사(description), 역할/맥락(context), 내부 요소(contents) 등을 포함할 것.\n"
    "출력 포맷은 반드시 다음과 같이 엄격한 JSON 스키마를 유지해야 해: {'characters': [{'id':'tmp_1', 'name':'홍길동', 'details': {'physical_state': '건장함'}}], 'plots': [...], 'locations': [...]}"
)

def main():
    model_id = "google/gemma-4-E4B-it"
    lora_path = os.path.join(PARENT_DIR, "gemma2_2b_sft_optimized", "final_model")
    chunks_path = os.path.join(PARENT_DIR, "data", "chunks.json")
    
    with open(chunks_path, "r", encoding="utf-8") as f:
        chunks = json.load(f)
        
    failed_ids = ["74", "88", "126", "141", "173"]
    target_chunks = [c for c in chunks if str(c["id"]) in failed_ids]
    
    print("Loading weights...")
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    tokenizer = AutoTokenizer.from_pretrained(model_id, cache_dir=CACHE_DIR)
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        quantization_config=bnb_config,
        device_map="auto",
        cache_dir=CACHE_DIR,
    )
    model = PeftModel.from_pretrained(model, lora_path)
    
    print("\nStarting diagnostic generation for failed chunks...")
    for chunk in target_chunks:
        chunk_id = chunk["id"]
        print(f"\n================================ [ Chunk {chunk_id} ] ================================")
        prompt = '<start_of_turn>user\n' + INSTRUCTION + '\n\nInput:\n' + chunk['text'] + '<end_of_turn>\n<start_of_turn>model\n'
        inputs = tokenizer(prompt, return_tensors='pt', truncation=True, max_length=1536).to('cuda')
        
        with torch.no_grad():
            outputs = model.generate(
                **inputs,
                max_new_tokens=1024,
                temperature=0.1,
                do_sample=True,
                repetition_penalty=1.0,
            )
            
        generated_ids = outputs[0][inputs.input_ids.shape[1]:]
        raw_output = tokenizer.decode(generated_ids, skip_special_tokens=True).strip()
        print("--- [ Raw Output ] ---")
        print(raw_output)
        
        # Test cleaning
        print("--- [ Regex Match Try ] ---")
        match = re.search(r"\{.*\}", raw_output, re.DOTALL)
        if match:
            print("Found JSON block between braces.")
        else:
            print("WARNING: No JSON block enclosed in braces found!")

if __name__ == "__main__":
    main()
