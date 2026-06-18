import os
import pathlib

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, "model_cache")
os.makedirs(CACHE_DIR, exist_ok=True)
os.environ["HF_HOME"] = CACHE_DIR

original_read_text = pathlib.Path.read_text
def patched_read_text(self, encoding=None, errors=None):
    if encoding is None:
        encoding = 'utf-8'
    return original_read_text(self, encoding=encoding, errors=errors)
pathlib.Path.read_text = patched_read_text

import torch
from datasets import load_dataset
from transformers import AutoModelForCausalLM, AutoTokenizer, TrainingArguments, BitsAndBytesConfig
from peft import LoraConfig, prepare_model_for_kbit_training, get_peft_model
from transformers import Trainer, DataCollatorForSeq2Seq
from dotenv import load_dotenv

load_dotenv()

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

load_dotenv()

os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

MODEL_ID = "google/gemma-4-E4B-it"
OUTPUT_DIR = "gemma2_2b_sft_optimized"
DATASET_FILE = "data/sft_dataset.jsonl"
HF_TOKEN = os.environ.get("HF_TOKEN")

def main():
    print(f"=== Optimized Gemma-2 SFT Training ===")
    print(f"Model ID: {MODEL_ID}")
    
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, token=HF_TOKEN)
    if tokenizer.pad_token is None:
        tokenizer.pad_token = tokenizer.eos_token
        tokenizer.pad_token_id = tokenizer.eos_token_id
    tokenizer.padding_side = 'right'
    tokenizer.model_max_length = 1024

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

    peft_config = LoraConfig(
        r=16,
        lora_alpha=32,
        target_modules="all-linear",
        lora_dropout=0.1,
        bias="none",
        task_type="CAUSAL_LM"
    )

    raw_dataset = load_dataset('json', data_files=DATASET_FILE, split='train')

    def preprocess_function(examples):
        batch_input_ids = []
        batch_attention_mask = []
        batch_labels = []
        
        for instruction, input_text, output in zip(examples['instruction'], examples['input'], examples['output']):
            # Gemma 2 Official Chat Template
            prompt = (
                "<start_of_turn>user\n"
                f"{instruction}\n\n"
                f"Input:\n{input_text}<end_of_turn>\n"
                "<start_of_turn>model\n"
            )
            target = f"{output}<end_of_turn>"
            
            # 통합 인코딩으로 Token Boundary Mismatch 완전 차단
            full_text = prompt + target
            full_ids = tokenizer.encode(full_text, add_special_tokens=True)
            prompt_ids = tokenizer.encode(prompt, add_special_tokens=True)
            
            prompt_length = len(prompt_ids)
            
            # 프롬프트 영역만 -100으로 완벽하게 마스킹
            labels = [-100] * prompt_length + full_ids[prompt_length:]
            
            input_ids = full_ids
            if len(input_ids) > 1024:
                input_ids = input_ids[:1024]
                labels = labels[:1024]
                
            attention_mask = [1] * len(input_ids)
            
            if len(labels) < len(input_ids):
                labels = labels + [-100] * (len(input_ids) - len(labels))
            elif len(labels) > len(input_ids):
                labels = labels[:len(input_ids)]
                
            batch_input_ids.append(input_ids)
            batch_attention_mask.append(attention_mask)
            batch_labels.append(labels)
            
        return {
            "input_ids": batch_input_ids,
            "attention_mask": batch_attention_mask,
            "labels": batch_labels
        }

    print("Pre-tokenizing dataset and applying perfect alignment masking...")
    dataset = raw_dataset.map(
        preprocess_function,
        batched=True,
        remove_columns=raw_dataset.column_names
    )

    model = get_peft_model(model, peft_config)
    model.print_trainable_parameters()

    training_args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=4,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=16, # 실질 배치 16으로 안정성 향상
        gradient_checkpointing=True,
        optim="paged_adamw_8bit",
        save_steps=100,
        logging_steps=10,
        learning_rate=5e-5, # 학습률 하향 조정으로 Representation Collapse 방지
        fp16=False,
        bf16=True,
        max_grad_norm=0.3,
        warmup_ratio=0.1,   # 웜업 증가
        lr_scheduler_type="cosine"
    )

    collator = DataCollatorForSeq2Seq(tokenizer, pad_to_multiple_of=8, return_tensors="pt", padding=True)

    trainer = Trainer(
        model=model,
        train_dataset=dataset,
        data_collator=collator,
        args=training_args,
    )

    print("Starting Optimized Gemma-2 LoRA Fine-Tuning...")
    trainer.train()
    
    final_save_path = os.path.join(OUTPUT_DIR, "final_model")
    print(f"Saving final model to {final_save_path}")
    trainer.model.save_pretrained(final_save_path)
    tokenizer.save_pretrained(final_save_path)
    print("Fine-tuning completed successfully!")

if __name__ == "__main__":
    main()
