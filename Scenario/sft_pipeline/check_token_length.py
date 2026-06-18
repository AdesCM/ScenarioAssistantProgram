import os
import json
from transformers import AutoTokenizer

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(SCRIPT_DIR, "model_cache")
DATASET_FILE = os.path.join(SCRIPT_DIR, "data", "sft_dataset.jsonl")
MODEL_ID = "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B"

def main():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, cache_dir=CACHE_DIR)
    
    with open(DATASET_FILE, "r", encoding="utf-8") as f:
        lines = f.readlines()
        
    lengths = []
    truncated_count = 0
    
    for line in lines:
        item = json.loads(line)
        text = (
            f"Instruction:\n{item['instruction']}\n\n"
            f"Input:\n{item['input']}\n\n"
            f"Output:\n{item['output']}"
        )
        tokens = tokenizer.encode(text)
        lengths.append(len(tokens))
        if len(tokens) > 512:
            truncated_count += 1
            
    print(f"Total samples: {len(lengths)}")
    print(f"Max token length: {max(lengths)}")
    print(f"Min token length: {min(lengths)}")
    print(f"Average token length: {sum(lengths)/len(lengths):.2f}")
    print(f"Number of samples > 512 tokens: {truncated_count} ({truncated_count/len(lengths):.2%})")

if __name__ == "__main__":
    main()
