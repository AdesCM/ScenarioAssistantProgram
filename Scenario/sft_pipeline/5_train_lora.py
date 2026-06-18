import os
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, BitsAndBytesConfig
from peft import LoraConfig, get_peft_model, prepare_model_for_kbit_training
from trl import SFTTrainer
from dotenv import load_dotenv

load_dotenv()

# VRAM 메모리 단편화 방지 (OOM 예방)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# ── 모델 다운로드 경로를 C드라이브가 아닌 현재 프로젝트 폴더(E드라이브)로 강제 지정 ──
CACHE_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
os.environ["HF_HOME"] = CACHE_DIR
print(f"모델 캐시 경로: {CACHE_DIR}")

# Configurations
MODEL_ID = "google/gemma-4-E4B-it" # Gemma 4 4B (16GB VRAM 이내에서 학습 가능)
DATASET_FILE = "data/sft_dataset.jsonl"
OUTPUT_DIR = "gemma4_4b_sft_lora"
HF_TOKEN = os.environ.get("HF_TOKEN")

def main():
    print(f"Loading tokenizer and model: {MODEL_ID}")
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)
    tokenizer.padding_side = 'right'
    tokenizer.model_max_length = 512   # 시퀀스 길이 512 제한 → VRAM 절약

    # Load model in 4-bit for memory efficiency (QLoRA)
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        quantization_config=bnb_config,
        device_map="auto",
        token=HF_TOKEN
    )
    model = prepare_model_for_kbit_training(model)

    # All-Linear Target Modules: Gemma4 MoE 구조 전체에 LoRA 적용
    target_modules = "all-linear"
    
    peft_config = LoraConfig(
        r=32,
        lora_alpha=64,
        target_modules=target_modules,
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )
    # SFTTrainer가 peft_config를 받아 직접 LoRA 래핑을 처리하므로 get_peft_model 불필요

    print(f"Loading dataset: {DATASET_FILE}")
    dataset = load_dataset('json', data_files=DATASET_FILE, split='train')

    # Formatting function for SFT (SFTTrainer는 배치가 아닌 단일 example을 넘겨줌)
    def formatting_prompts_func(example):
        text = (
            f"Instruction:\n{example['instruction']}\n\n"
            f"Input:\n{example['input']}\n\n"
            f"Output:\n{example['output']}"
        )
        return text

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=4,
        per_device_train_batch_size=1,        # 16GB VRAM: 배치 1로 설정
        gradient_accumulation_steps=8,        # 실질 배치=8 유지 (1×8)
        gradient_checkpointing=True,           # VRAM 절약 (속도와 트레이드오프)
        optim="paged_adamw_32bit",
        save_steps=100,
        logging_steps=10,
        learning_rate=2e-4,
        fp16=False,
        bf16=True,
        max_grad_norm=0.3,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine"
    )

    trainer = SFTTrainer(
        model=model,
        train_dataset=dataset,
        peft_config=peft_config,
        formatting_func=formatting_prompts_func,
        # max_seq_length는 TrainingArguments의 max_length로 대체됨 (trl 최신 버전)
        args=training_args,
    )

    print("Starting LoRA Fine-Tuning...")
    trainer.train()
    
    print(f"Saving final model to {OUTPUT_DIR}/final_model")
    trainer.model.save_pretrained(f"{OUTPUT_DIR}/final_model")
    tokenizer.save_pretrained(f"{OUTPUT_DIR}/final_model")

if __name__ == "__main__":
    main()
