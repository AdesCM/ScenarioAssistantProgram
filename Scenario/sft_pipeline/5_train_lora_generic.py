# Windows cp949 인코딩 에러 방지를 위한 pathlib 패치 (trl 라이브러리 내부 파일 읽기 에러 방지)
import pathlib
original_read_text = pathlib.Path.read_text
def patched_read_text(self, encoding=None, errors=None):
    if encoding is None:
        encoding = 'utf-8'
    return original_read_text(self, encoding=encoding, errors=errors)
pathlib.Path.read_text = patched_read_text

import os
import argparse
import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, BitsAndBytesConfig
from peft import LoraConfig, prepare_model_for_kbit_training
from trl import SFTTrainer
from dotenv import load_dotenv

load_dotenv()


# VRAM 메모리 단편화 방지 (OOM 예방)
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# 모델 다운로드 경로를 현재 프로젝트 폴더의 model_cache로 강제 지정
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, "model_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
os.environ["HF_HOME"] = CACHE_DIR
print(f"모델 캐시 경로: {CACHE_DIR}")

def parse_args():
    parser = argparse.ArgumentParser(description="Generic LoRA Fine-Tuning Script")
    parser.add_argument(
        "--model_id", 
        type=str, 
        default="deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
        help="Hugging Face model ID to fine-tune"
    )
    parser.add_argument(
        "--output_dir", 
        type=str, 
        default="deepseek_1_5b_sft_lora",
        help="Directory to save the trained model"
    )
    parser.add_argument(
        "--epochs", 
        type=int, 
        default=4,
        help="Number of training epochs"
    )
    parser.add_argument(
        "--batch_size", 
        type=int, 
        default=1,
        help="Batch size per device"
    )
    parser.add_argument(
        "--grad_accum", 
        type=int, 
        default=8,
        help="Gradient accumulation steps"
    )
    parser.add_argument(
        "--lr", 
        type=float, 
        default=2e-4,
        help="Learning rate"
    )
    parser.add_argument(
        "--lora_r", 
        type=int, 
        default=32,
        help="LoRA rank (r)"
    )
    parser.add_argument(
        "--lora_alpha", 
        type=int, 
        default=64,
        help="LoRA alpha"
    )
    parser.add_argument(
        "--dataset_file", 
        type=str, 
        default="data/sft_dataset.jsonl",
        help="Path to SFT dataset jsonl"
    )
    return parser.parse_args()

def main():
    args = parse_args()
    
    print(f"=== SFT Training configuration ===")
    print(f"Model ID: {args.model_id}")
    print(f"Output Dir: {args.output_dir}")
    print(f"Epochs: {args.epochs}")
    print(f"Batch Size: {args.batch_size}")
    print(f"Grad Accumulation: {args.grad_accum}")
    print(f"Learning Rate: {args.lr}")
    print(f"LoRA Rank: {args.lora_r}")
    print(f"LoRA Alpha: {args.lora_alpha}")
    print(f"Dataset File: {args.dataset_file}")
    print("==================================")
    
    HF_TOKEN = os.environ.get("HF_TOKEN")

    print(f"Loading tokenizer and model: {args.model_id}")
    tokenizer = AutoTokenizer.from_pretrained(args.model_id, token=HF_TOKEN, trust_remote_code=True)
    
    # Pad token 설정 (Qwen, DeepSeek 등 pad_token이 명시되지 않은 모델 대비)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id
        
    tokenizer.padding_side = 'right'
    tokenizer.model_max_length = 1024  # 시퀀스 길이 1024 제한 (기존 512에서 확장)

    # QLoRA를 위해 4-bit 양자화 설정
    bnb_config = BitsAndBytesConfig(
        load_in_4bit=True,
        bnb_4bit_use_double_quant=True,
        bnb_4bit_quant_type="nf4",
        bnb_4bit_compute_dtype=torch.bfloat16,
    )
    
    model = AutoModelForCausalLM.from_pretrained(
        args.model_id,
        quantization_config=bnb_config,
        device_map="auto",
        trust_remote_code=True,
        token=HF_TOKEN
    )
    model = prepare_model_for_kbit_training(model)

    # LoRA config
    # target_modules="all-linear"를 설정하여 Attention 모듈뿐만 아니라 MLP 레이어까지 모두 학습
    peft_config = LoraConfig(
        r=args.lora_r,
        lora_alpha=args.lora_alpha,
        target_modules="all-linear",
        lora_dropout=0.05,
        bias="none",
        task_type="CAUSAL_LM"
    )

    print(f"Loading dataset: {args.dataset_file}")
    raw_dataset = load_dataset('json', data_files=args.dataset_file, split='train')

    # Pre-tokenize dataset with custom loss masking (-100 for prompt tokens)
    def preprocess_function(examples):
        batch_input_ids = []
        batch_attention_mask = []
        batch_labels = []
        
        for instruction, input_text, output in zip(examples['instruction'], examples['input'], examples['output']):
            prompt = f"Instruction:\n{instruction}\n\nInput:\n{input_text}\n\nOutput:\n"
            target = output
            
            prompt_ids = tokenizer.encode(prompt, add_special_tokens=True)
            target_ids = tokenizer.encode(target, add_special_tokens=False) + [tokenizer.eos_token_id]
            
            input_ids = prompt_ids + target_ids
            labels = [-100] * len(prompt_ids) + target_ids
            
            if len(input_ids) > 1024:
                input_ids = input_ids[:1024]
                labels = labels[:1024]
                
            attention_mask = [1] * len(input_ids)
            
            batch_input_ids.append(input_ids)
            batch_attention_mask.append(attention_mask)
            batch_labels.append(labels)
            
        return {
            "input_ids": batch_input_ids,
            "attention_mask": batch_attention_mask,
            "labels": batch_labels
        }

    print("Pre-tokenizing dataset and applying completion loss masking...")
    dataset = raw_dataset.map(
        preprocess_function,
        batched=True,
        remove_columns=raw_dataset.column_names
    )

    from peft import get_peft_model
    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    training_args = TrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.grad_accum,
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",
        save_steps=100,
        logging_steps=10,
        learning_rate=args.lr,
        fp16=False,
        bf16=True,
        max_grad_norm=0.3,
        warmup_ratio=0.03,
        lr_scheduler_type="cosine"
    )

    from transformers import Trainer, DataCollatorForSeq2Seq
    collator = DataCollatorForSeq2Seq(tokenizer, pad_to_multiple_of=8, return_tensors="pt", padding=True)

    trainer = Trainer(
        model=model,
        train_dataset=dataset,
        data_collator=collator,
        args=training_args,
    )

    print("Starting LoRA Fine-Tuning with completion-only loss...")
    trainer.train()
    
    final_save_path = os.path.join(args.output_dir, "final_model")
    print(f"Saving final model to {final_save_path}")
    trainer.model.save_pretrained(final_save_path)
    tokenizer.save_pretrained(final_save_path)
    print("Fine-tuning completed successfully!")

if __name__ == "__main__":
    main()
