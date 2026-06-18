import os
import json
import argparse
import matplotlib.pyplot as plt
import numpy as np

# 기본 경로 설정
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def parse_args():
    parser = argparse.ArgumentParser(description="Generic SFT Model Evaluation Script")
    parser.add_argument(
        "--claude_file", 
        type=str, 
        default="data/extracted.json",
        help="Claude gold standard extracted JSON path"
    )
    parser.add_argument(
        "--base_file", 
        type=str, 
        default="data/extracted_gemma.json",
        help="Base model baseline extracted JSON path"
    )
    parser.add_argument(
        "--sft_file", 
        type=str, 
        required=True,
        help="Path to SFT model extracted JSON path"
    )
    parser.add_argument(
        "--model_name_base", 
        type=str, 
        default="Gemma Base (26B)",
        help="Display name for base model"
    )
    parser.add_argument(
        "--model_name_sft", 
        type=str, 
        default="DeepSeek SFT (1.5B)",
        help="Display name for SFT model"
    )
    parser.add_argument(
        "--output_chart", 
        type=str, 
        default="data/deepseek_sft_comparison_results.png",
        help="Output chart path"
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
    
    print(f"=== [성능 평가] {args.model_name_base} vs {args.model_name_sft} ===")
    
    claude_data = load_data(args.claude_file)
    base_data   = load_data(args.base_file)
    sft_data    = load_data(args.sft_file)
    
    if not claude_data:
        print(f"오류: 골드 기준 파일 '{args.claude_file}'이 존재하지 않습니다.")
        return
    if not sft_data:
        print(f"오류: 평가할 SFT 모델 결과 파일 '{args.sft_file}'이 존재하지 않거나 비어 있습니다.")
        return

    # 지표 계산
    m_claude = calculate_metrics(claude_data, "Claude", args.limit)
    m_base   = calculate_metrics(base_data, args.model_name_base, args.limit) if base_data else None
    m_sft    = calculate_metrics(sft_data, args.model_name_sft, args.limit)
    
    # Claude 대비 정확도(Overlap) 계산
    overlap_base = calculate_f1_overlap(claude_data, base_data, args.limit) if base_data else None
    overlap_sft  = calculate_f1_overlap(claude_data, sft_data, args.limit)
    
    print("\n" + "="*70)
    if base_data:
        print(f"{'Metric':<25} | {args.model_name_base:<20} | {args.model_name_sft:<20}")
        print("-" * 70)
        print(f"{'Schema Consistency':<25} | {m_base['valid_schema_rate']:<20.2%} | {m_sft['valid_schema_rate']:<20.2%}")
        print(f"{'Total Entities':<25} | {m_base['total_entities']:<20} | {m_sft['total_entities']:<20}")
        print(f"{'Avg Details per Entity':<25} | {m_base['avg_details_per_entity']:<20.2f} | {m_sft['avg_details_per_entity']:<20.2f}")
        print(f"{'F1-Score (vs Claude)':<25} | {overlap_base['f1_score']:<20.4f} | {overlap_sft['f1_score']:<20.4f}")
    else:
        print(f"{'Metric':<25} | {args.model_name_sft:<20}")
        print("-" * 70)
        print(f"{'Schema Consistency':<25} | {m_sft['valid_schema_rate']:<20.2%}")
        print(f"{'Total Entities':<25} | {m_sft['total_entities']:<20}")
        print(f"{'Avg Details per Entity':<25} | {m_sft['avg_details_per_entity']:<20.2f}")
        print(f"{'F1-Score (vs Claude)':<25} | {overlap_sft['f1_score']:<20.4f}")
    print("="*70)

    # 그래프 시각화 (Base 모델이 있는 경우 비교 차트 작성)
    if base_data:
        labels = ['Schema Rate', 'Avg Details', 'F1-Score']
        base_scores = [m_base['valid_schema_rate'], m_base['avg_details_per_entity']/10, overlap_base['f1_score']]
        sft_scores  = [m_sft['valid_schema_rate'], m_sft['avg_details_per_entity']/10, overlap_sft['f1_score']]
        
        x = np.arange(len(labels))
        width = 0.35
        
        fig, ax = plt.subplots(figsize=(10, 6))
        ax.bar(x - width/2, base_scores, width, label=args.model_name_base, color='#FFE873')
        ax.bar(x + width/2, sft_scores, width, label=args.model_name_sft, color='#4B8BBE')
        
        ax.set_ylabel('Scores (Details scaled by 1/10)')
        ax.set_title(f'Performance Comparison: {args.model_name_base} vs {args.model_name_sft}')
        ax.set_xticks(x)
        ax.set_xticklabels(labels)
        ax.legend()
        
        chart_path = os.path.join(SCRIPT_DIR, args.output_chart)
        plt.savefig(chart_path)
        print(f"\n시각화 결과가 '{chart_path}'에 저장되었습니다.")

if __name__ == "__main__":
    main()
