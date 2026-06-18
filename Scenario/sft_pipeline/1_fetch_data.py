import os
import json
from datasets import load_dataset

OUTPUT_FILE = "data/chunks.json"
TARGET_COUNT = 2000

def main():
    if not os.path.exists("data"):
        os.makedirs("data")

    print("Hugging Face에서 한국어 소설 데이터셋을 다운로드 중입니다...")
    print("사용 데이터셋: werty1248/Korean-1930-Novel-Scene-Summarize")
    print("(약 1만 개 이상의 한국어 소설 씬 데이터 포함)")
    
    try:
        # 데이터셋 로드 (학습용 split 사용)
        ds = load_dataset('werty1248/Korean-1930-Novel-Scene-Summarize', split='train')
    except Exception as e:
        print(f"데이터셋 다운로드 실패: {e}")
        print("huggingface-cli login 또는 인터넷 연결을 확인해주세요.")
        return

    all_chunks = []
    chunk_id = 1
    
    print(f"\n총 {len(ds)}개의 씬 중 {TARGET_COUNT}개를 추출합니다...")
    
    for row in ds:
        # 이 데이터셋은 'text' 컬럼에 원본 씬 내용이 들어있습니다.
        text = row.get("text", "")
        
        # 데이터가 비어있거나 너무 짧은 경우 패스
        if not text or len(text.strip()) < 50:
            continue
            
        all_chunks.append({
            "id": chunk_id,
            "source_file": "hf_korean_1930_novel",
            "chunk_index": chunk_id,
            "text": text.strip()
        })
        
        chunk_id += 1
        
        # 목표 수량에 도달하면 종료
        if chunk_id > TARGET_COUNT:
            break
            
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(all_chunks, f, ensure_ascii=False, indent=2)
        
    print(f"\n완료! 총 {len(all_chunks)}개의 텍스트 청크가 '{OUTPUT_FILE}'에 저장되었습니다.")
    print("이제 2_extract_gold_json.py 를 실행하여 엔티티를 추출할 수 있습니다.")

if __name__ == "__main__":
    main()
