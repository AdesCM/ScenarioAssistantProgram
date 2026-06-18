import os
import json

INPUT_FILE = "data/extracted.json"
OUTPUT_FILE = "data/sft_dataset.jsonl"

def main():
    if not os.path.exists(INPUT_FILE):
        print(f"Error: {INPUT_FILE} 파일이 없습니다. 먼저 2_extract_gold_json.py를 실행하세요.")
        return

    with open(INPUT_FILE, 'r', encoding='utf-8') as f:
        extracted_data = json.load(f)

    instruction = (
        "주어진 소설 시나리오 텍스트에서 인물(characters), 사건(plots), 배경(locations) 개체를 추출하고, 웹 시나리오 어시스턴트에서 사용할 수 있도록 엄격한 JSON 형식으로 반환해.\n"
        "- characters의 세부 속성(details)에는 외양/상태(physical_state), 행동(action), 심리/인식(perception), 대사/발화(vocalization), 상황 맥락(location_context) 등을 포함할 것.\n"
        "- plots의 세부 속성(details)에는 발단(inciting_incident), 전개(development), 절정/결과(climax) 등을 포함할 것.\n"
        "- locations의 세부 속성(details)에는 외형적 묘사(description), 역할/맥락(context), 내부 요소(contents) 등을 포함할 것.\n"
        "출력 포맷은 반드시 다음과 같이 엄격한 JSON 스키마를 유지해야 해: {'characters': [{'id':'tmp_1', 'name':'홍길동', 'details': {'physical_state': '건장함'}}], 'plots': [...], 'locations': [...]}"
    )
    
    success_count = 0
    with open(OUTPUT_FILE, 'w', encoding='utf-8') as f:
        for item in extracted_data:
            # 오류 없이 정상 추출된 데이터만 사용
            if item.get("json"):
                sft_record = {
                    "instruction": instruction,
                    "input": item["text"],
                    "output": json.dumps(item["json"], ensure_ascii=False)
                }
                # JSON Lines 형식으로 한 줄씩 저장
                f.write(json.dumps(sft_record, ensure_ascii=False) + "\n")
                success_count += 1

    print(f"SFT 데이터셋 구축 완료! (총 {success_count}개)")
    print(f"저장 위치: {OUTPUT_FILE}")
    print("이 파일을 사용하여 Llama, Gemma, Qwen 등의 모델을 Instruction Tuning(SFT) 할 수 있습니다.")

if __name__ == "__main__":
    main()
