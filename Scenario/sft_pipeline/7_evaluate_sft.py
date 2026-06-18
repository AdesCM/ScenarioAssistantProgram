import json
import os
import matplotlib.pyplot as plt
import numpy as np

# 경로 설정
CLAUDE_FILE     = "data/extracted.json"
GEMMA_BASE_FILE = "data/extracted_gemma.json"
GEMMA_SFT_FILE  = "data/extracted_finetuned_200.json"

def load_data(filepath):
    if not os.path.exists(filepath):
        return []
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def calculate_metrics(data, name, limit=200):
    # 비교를 위해 동일한 개수만 사용
    subset = data[:limit]
    total_entities = 0
    total_details = 0
    valid_schema_count = 0
    
    for item in subset:
        json_obj = item.get("json", {})
        if not isinstance(json_obj, dict):
            continue
            
        # 스키마 준수 확인 (인물, 사건, 장소가 모두 있어야 함)
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
    # Claude를 Pseudo-Gold 정답으로 간주
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
    print("=== [성능 비교] Gemma 26B (Base) vs Gemma 4B (Fine-Tuned) ===")
    
    claude_data = load_data(CLAUDE_FILE)
    base_data   = load_data(GEMMA_BASE_FILE)
    sft_data    = load_data(GEMMA_SFT_FILE)
    
    if not sft_data:
        print("에러: 파인튜닝된 모델의 추출 결과가 없습니다.")
        return

    # 지표 계산
    m_claude = calculate_metrics(claude_data, "Claude")
    m_base   = calculate_metrics(base_data, "Gemma Base (26B)")
    m_sft    = calculate_metrics(sft_data, "Gemma SFT (4B)")
    
    # Claude 대비 정확도(Overlap) 계산
    overlap_base = calculate_f1_overlap(claude_data, base_data)
    overlap_sft  = calculate_f1_overlap(claude_data, sft_data)
    
    print("\n" + "="*50)
    print(f"{'Metric':<25} | {'Base (26B)':<15} | {'SFT (4B)':<15}")
    print("-" * 50)
    print(f"{'Schema Consistency':<25} | {m_base['valid_schema_rate']:<15.2%} | {m_sft['valid_schema_rate']:<15.2%}")
    print(f"{'Total Entities':<25} | {m_base['total_entities']:<15} | {m_sft['total_entities']:<15}")
    print(f"{'Avg Details per Entity':<25} | {m_base['avg_details_per_entity']:<15.2f} | {m_sft['avg_details_per_entity']:<15.2f}")
    print(f"{'F1-Score (vs Claude)':<25} | {overlap_base['f1_score']:<15.4f} | {overlap_sft['f1_score']:<15.4f}")
    print("="*50)

    # 그래프 시각화
    labels = ['Schema Rate', 'Avg Details', 'F1-Score']
    base_scores = [m_base['valid_schema_rate'], m_base['avg_details_per_entity']/10, overlap_base['f1_score']] # Scale details for visibility
    sft_scores  = [m_sft['valid_schema_rate'], m_sft['avg_details_per_entity']/10, overlap_sft['f1_score']]
    
    x = np.arange(len(labels))
    width = 0.35
    
    fig, ax = plt.subplots(figsize=(10, 6))
    ax.bar(x - width/2, base_scores, width, label='Gemma Base (26B)', color='#FFE873')
    ax.bar(x + width/2, sft_scores, width, label='Gemma SFT (4B)', color='#FF7F50')
    
    ax.set_ylabel('Scores')
    ax.set_title('Gemma Base vs Fine-Tuned Performance Comparison')
    ax.set_xticks(x)
    ax.set_xticklabels(labels)
    ax.legend()
    
    plt.savefig('data/sft_comparison_results.png')
    print("\n시각화 결과가 'data/sft_comparison_results.png'에 저장되었습니다.")

if __name__ == "__main__":
    main()
