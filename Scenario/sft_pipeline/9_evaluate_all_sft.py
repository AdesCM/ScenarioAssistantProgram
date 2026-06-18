import os
import json
import argparse
import matplotlib.pyplot as plt
import numpy as np

# 폰트 설정 (윈도우 한글 폰트 설정)
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False # 마이너스 기호 깨짐 방지
plt.rcParams['font.size'] = 11

# 기본 경로 설정
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate All SFT Models (Gemma, DeepSeek, Qwen, EXAONE)")
    parser.add_argument(
        "--claude_file", 
        type=str, 
        default="data/extracted.json",
        help="Claude gold standard extracted JSON path"
    )
    parser.add_argument(
        "--limit", 
        type=int, 
        default=200,
        help="Number of chunks to compare"
    )
    return parser.parse_args()

def load_data(filepath):
    abs_path = os.path.join(SCRIPT_DIR, filepath)
    if not os.path.exists(abs_path):
        return []
    with open(abs_path, 'r', encoding='utf-8') as f:
        return json.load(f)

def calculate_metrics(data, name, limit=200):
    subset = data[:limit]
    total_entities = 0
    total_details = 0
    valid_schema_count = 0
    
    for item in subset:
        json_obj = item.get("json", {})
        if not isinstance(json_obj, dict):
            continue
            
        # 스키마 준수 확인 (characters, plots, locations 모두 포함 확인)
        if all(key in json_obj for key in ["characters", "plots", "locations"]):
            valid_schema_count += 1
            
        # 엔티티 및 세부사항 수 계산
        for key in ["characters", "plots", "locations"]:
            entities = json_obj.get(key, [])
            if isinstance(entities, list):
                for entity in entities:
                    if isinstance(entity, dict):
                        total_entities += 1
                        details = entity.get("details", {})
                        if isinstance(details, dict):
                            total_details += len(details.keys())
                        
    avg_details = total_details / total_entities if total_entities > 0 else 0
    
    return {
        "model": name,
        "processed_chunks": len(subset),
        "valid_schema_rate": valid_schema_count / len(subset) if len(subset) > 0 else 0,
        "total_entities": total_entities,
        "avg_details_per_entity": avg_details
    }

def calculate_f1_overlap(claude_data, target_data, limit=200):
    c_subset = claude_data[:limit]
    t_subset = target_data[:limit]
    
    target_dict = {str(item['id']): item.get('json', {}) for item in t_subset}
    
    total_true_positives = 0
    total_claude_entities = 0
    total_target_entities = 0
    
    for claude_item in c_subset:
        chunk_id = str(claude_item['id'])
        claude_json = claude_item.get('json', {})
        target_json = target_dict.get(chunk_id, {})
        
        for key in ["characters", "plots", "locations"]:
            c_entities = [str(e.get('name', '')).lower() for e in claude_json.get(key, []) if isinstance(e, dict)]
            t_entities = [str(e.get('name', '')).lower() for e in target_json.get(key, []) if isinstance(e, dict)]
            
            total_claude_entities += len(c_entities)
            total_target_entities += len(t_entities)
            
            # 교집합 (이름이 일치하거나 포함되는 경우)
            for t_name in t_entities:
                if any(c_name in t_name or t_name in c_name for c_name in c_entities if c_name and t_name):
                    total_true_positives += 1
                    
    precision = total_true_positives / total_target_entities if total_target_entities > 0 else 0
    recall = total_true_positives / total_claude_entities if total_claude_entities > 0 else 0
    f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0
    
    return {
        "precision": precision,
        "recall": recall,
        "f1_score": f1_score
    }

def main():
    args = parse_args()
    
    model_configs = [
        {"name": "Gemma Base (2.6B)", "file": "data/extracted_gemma.json"},
        {"name": "Gemma SFT Opt (4B)", "file": "data/extracted_gemma2_2b_optimized.json"},
        {"name": "DeepSeek SFT (1.5B)", "file": "data/extracted_deepseek_1_5b_finetuned.json"},
        {"name": "Qwen SFT (4B)", "file": "data/extracted_finetuned_200.json"},
        {"name": "EXAONE SFT (1.2B)", "file": "data/extracted_exaone_1_2b_finetuned.json"}
    ]
    
    print("=== [SFT 모델 통합 성능 평가] ===")
    
    claude_data = load_data(args.claude_file)
    if not claude_data:
        print(f"오류: 골드 기준 파일 '{args.claude_file}'이 존재하지 않습니다.")
        return
        
    results = []
    
    for config in model_configs:
        name = config["name"]
        filepath = config["file"]
        
        data = load_data(filepath)
        if not data:
            print(f"경고: '{name}' 결과 파일 ({filepath})이 존재하지 않거나 비어 있습니다. 건너뜁니다.")
            continue
            
        metrics = calculate_metrics(data, name, args.limit)
        overlap = calculate_f1_overlap(claude_data, data, args.limit)
        
        metrics.update(overlap)
        results.append(metrics)
        
    if not results:
        print("오류: 평가할 결과 데이터가 존재하지 않습니다.")
        return

    # 터미널 표 출력
    print("\n" + "="*95)
    print(f"{'Model Name':<22} | {'Schema Rate':<12} | {'Total Entities':<15} | {'Avg Details/Entity':<20} | {'F1-Score':<10}")
    print("-" * 95)
    for res in results:
        print(f"{res['model']:<22} | {res['valid_schema_rate']:<12.2%} | {res['total_entities']:<15} | {res['avg_details_per_entity']:<20.2f} | {res['f1_score']:<10.4f}")
    print("="*95)

    # 그래프 시각화
    models = [res["model"] for res in results]
    schema_rates = [res["valid_schema_rate"] for res in results]
    avg_details = [res["avg_details_per_entity"] / 10.0 for res in results] # 1/10 스케일링
    f1_scores = [res["f1_score"] for res in results]
    
    x = np.arange(len(models))
    width = 0.25
    
    fig, ax = plt.subplots(figsize=(12, 7))
    ax.bar(x - width, schema_rates, width, label='Schema Consistency', color='#2ecc71')
    ax.bar(x, avg_details, width, label='Avg Details (scaled 1/10)', color='#FFE873')
    ax.bar(x + width, f1_scores, width, label='F1-Score (vs Claude)', color='#4B8BBE')
    
    ax.set_ylabel('Score / Value (scaled)')
    ax.set_title('SFT 모델 전체 성능 비교 (Gemma, DeepSeek, Qwen, EXAONE)')
    ax.set_xticks(x)
    ax.set_xticklabels(models)
    ax.legend()
    ax.grid(axis='y', linestyle='--', alpha=0.6)
    
    chart_path = os.path.join(SCRIPT_DIR, "data", "all_models_sft_comparison.png")
    plt.savefig(chart_path, dpi=300)
    plt.close()
    
    print(f"\n통합 비교 차트 시각화 결과가 '{chart_path}'에 저장되었습니다.")

if __name__ == "__main__":
    main()
