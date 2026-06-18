import os
import sys
import torch

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

from transformers import AutoTokenizer, AutoModelForCausalLM, BitsAndBytesConfig
from peft import PeftModel
from dotenv import load_dotenv

load_dotenv()

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, "model_cache")

# Test instructions
INSTRUCTION_EXTRACTION = (
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

INSTRUCTION_TRAINING = (
    "주어진 소설 시나리오 텍스트에서 인물(characters), 사건(plots), 배경(locations) 개체를 추출하고, 웹 시나리오 어시스턴트에서 사용할 수 있도록 엄격한 JSON 형식으로 반환해.\n"
    "- characters의 세부 속성(details)에는 외양/상태(physical_state), 행동(action), 심리/인식(perception), 대사/발화(vocalization), 상황 맥락(location_context) 등을 포함할 것.\n"
    "- plots의 세부 속성(details)에는 발단(inciting_incident), 전개(development), 절정/결과(climax) 등을 포함할 것.\n"
    "- locations의 세부 속성(details)에는 외형적 묘사(description), 역할/맥락(context), 내부 요소(contents) 등을 포함할 것.\n"
    "출력 포맷은 반드시 다음과 같이 엄격한 JSON 스키마를 유지해야 해: {'characters': [{'id':'tmp_1', 'name':'홍길동', 'details': {'physical_state': '건장함'}}], 'plots': [...], 'locations': [...]}"
)

def load_model(model_id, lora_dir):
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
    if lora_dir and os.path.exists(lora_dir):
        model = PeftModel.from_pretrained(model, lora_dir)
    model.eval()
    return tokenizer, model

def extract(text: str, instruction: str, tokenizer, model) -> str:
    prompt = f"Instruction:\n{instruction}\n\nInput:\n{text}\n\nOutput:\n"
    inputs = tokenizer(prompt, return_tensors="pt", truncation=True, max_length=768).to("cuda")
    with torch.no_grad():
        output_ids = model.generate(
            **inputs,
            max_new_tokens=1024,
            temperature=0.1,
            do_sample=True,
            pad_token_id=tokenizer.pad_token_id,
        )
    generated = output_ids[0][inputs["input_ids"].shape[1]:]
    return tokenizer.decode(generated, skip_special_tokens=True)

def main():
    model_id = "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B"
    lora_dir = os.path.join(SCRIPT_DIR, "deepseek_1_5b_sft_lora", "final_model")
    
    # Load base model alone first
    print("Loading base tokenizer and model...")
    tokenizer_base, model_base = load_model(model_id, lora_dir="")
    
    test_text = (
        "질그릇이 땅에 부딪치는 소리가 났다고 들렸는데, 마당에는 아무도 없다.\n"
        "부엌에 쥐가 들었나? 샛문을 열어 보려니까,\n"
        "“아 아 아이 아아 아야!”\n"
        "하는 소리가 뒤란 곁으로 들려온다. 샛문을 열려던 박씨는 뒷문을 밀었다.\n"
        "장독대 밑. 비스듬 한 켠 아래, 아다다가 입을 헤벌리고 납작하니 엎뎌져 두 다리만을 힘없이 버지럭거리고 있다. 그리고 머리 편으로 한 발쯤 나가선 깨어진 동이 조각이 질서 없이 너저분하게 된장 속에 묻혀 있다."
    )
    
    print("\n=== [BASE MODEL] INSTRUCTION_EXTRACTION ===")
    raw_base_ext = extract(test_text, INSTRUCTION_EXTRACTION, tokenizer_base, model_base)
    print(raw_base_ext)
    
    # Load LoRA model
    print("\nLoading LoRA tokenizer and model...")
    tokenizer_lora, model_lora = load_model(model_id, lora_dir)
    
    print("\n=== [LORA MODEL] INSTRUCTION_EXTRACTION ===")
    raw_lora_ext = extract(test_text, INSTRUCTION_EXTRACTION, tokenizer_lora, model_lora)
    print(raw_lora_ext)
    
    print("\n=== [LORA MODEL] INSTRUCTION_TRAINING ===")
    raw_lora_train = extract(test_text, INSTRUCTION_TRAINING, tokenizer_lora, model_lora)
    print(raw_lora_train)

if __name__ == "__main__":
    main()
