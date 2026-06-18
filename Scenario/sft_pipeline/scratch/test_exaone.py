import os
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer, BitsAndBytesConfig
from dotenv import load_dotenv

load_dotenv()

# 모델 캐시 경로 설정
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PARENT_DIR = os.path.dirname(SCRIPT_DIR)
CACHE_DIR = os.path.join(PARENT_DIR, "model_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
os.environ["HF_HOME"] = CACHE_DIR
print(f"모델 캐시 경로: {CACHE_DIR}")

HF_TOKEN = os.environ.get("HF_TOKEN")
model_id = "LGAI-EXAONE/EXAONE-4.0-1.2B"

print("Loading tokenizer...")
tokenizer = AutoTokenizer.from_pretrained(model_id, token=HF_TOKEN, trust_remote_code=True)
print("Pad token:", tokenizer.pad_token)
if tokenizer.pad_token is None:
    tokenizer.pad_token = tokenizer.eos_token
    tokenizer.pad_token_id = tokenizer.eos_token_id
print("Updated Pad token:", tokenizer.pad_token)

print("Loading model in 4bit...")
bnb_config = BitsAndBytesConfig(
    load_in_4bit=True,
    bnb_4bit_use_double_quant=True,
    bnb_4bit_quant_type="nf4",
    bnb_4bit_compute_dtype=torch.bfloat16,
)

model = AutoModelForCausalLM.from_pretrained(
    model_id,
    quantization_config=bnb_config,
    device_map="auto",
    trust_remote_code=True,
    token=HF_TOKEN
)
print("Model loaded successfully!")
