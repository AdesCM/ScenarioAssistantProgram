import json
import os
import matplotlib.pyplot as plt
import numpy as np

CLAUDE_FILE = "data/extracted.json"
GEMMA_FILE = "data/extracted_gemma.json"
EXAONE_FILE = "data/extracted_exaone.json"

def load_data(filepath):
    if not os.path.exists(filepath):
        return []
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def calculate_metrics(data, name):
    total_entities = 0
    total_details = 0
    valid_schema_count = 0
    
    for item in data:
        json_obj = item.get("json", {})
        if not isinstance(json_obj, dict):
            continue
            
        # 스키마 준수 확인
        if "characters" in json_obj and "plots" in json_obj and "locations" in json_obj:
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
        "processed_chunks": len(data),
        "valid_schema_rate": valid_schema_count / len(data) if len(data) > 0 else 0,
        "total_entities": total_entities,
        "avg_details_per_entity": avg_details
    }

def calculate_f1_overlap(claude_data, target_data):
    # 단순화된 F1-Score (이름 기반 Overlap)
    # Claude를 Pseudo-Gold 정답으로 간주
    target_dict = {str(item['id']): item.get('json', {}) for item in target_data}
    
    total_true_positives = 0
    total_claude_entities = 0
    total_target_entities = 0
    
    for claude_item in claude_data:
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

def visualize_metrics(claude_metrics, gemma_metrics, exaone_metrics, gemma_overlap, exaone_overlap):
    models = ['Claude 3.5 Haiku', 'Gemma4:26b', 'EXAONE 3.0']
    colors = ['#4B8BBE', '#FFE873', '#D0104C']
    
    fig, axes = plt.subplots(1, 3, figsize=(18, 5))
    
    # 1. Volume: Total Entities
    axes[0].bar(models, [claude_metrics['total_entities'], gemma_metrics['total_entities'], exaone_metrics['total_entities']], color=colors)
    axes[0].set_title('Total Extracted Entities (Volume)')
    axes[0].set_ylabel('Count')
    
    # 2. Detail Depth: Avg Details per Entity
    axes[1].bar(models, [claude_metrics['avg_details_per_entity'], gemma_metrics['avg_details_per_entity'], exaone_metrics['avg_details_per_entity']], color=colors)
    axes[1].set_title('Avg Details per Entity (Clarity)')
    axes[1].set_ylabel('Average Count')
    
    # 3. Accuracy: Precision, Recall, F1
    x = np.arange(3)
    width = 0.35
    
    metrics_names = ['Precision', 'Recall', 'F1-Score']
    gemma_scores = [gemma_overlap['precision'], gemma_overlap['recall'], gemma_overlap['f1_score']]
    exaone_scores = [exaone_overlap['precision'], exaone_overlap['recall'], exaone_overlap['f1_score']]
    
    axes[2].bar(x - width/2, gemma_scores, width, label='Gemma4:26b', color='#FFE873')
    axes[2].bar(x + width/2, exaone_scores, width, label='EXAONE 3.0', color='#D0104C')
    
    axes[2].set_xticks(x)
    axes[2].set_xticklabels(metrics_names)
    axes[2].set_title('Accuracy vs Claude (Pseudo-Gold)')
    axes[2].set_ylim(0, 1.0)
    axes[2].legend()
    
    plt.tight_layout()
    plt.savefig('data/evaluation_results.png')
    print("평가 차트가 'data/evaluation_results.png' 에 저장되었습니다.")

def main():
    print("=== 포스터 논문용 데이터 추출 평가 스크립트 (3자 비교) ===")
    
    claude_data = load_data(CLAUDE_FILE)
    gemma_data = load_data(GEMMA_FILE)
    exaone_data = load_data(EXAONE_FILE)
    
    print(f"로드된 데이터: Claude ({len(claude_data)}건), Gemma ({len(gemma_data)}건), EXAONE ({len(exaone_data)}건)")
    
    if len(claude_data) == 0:
        print("기준 데이터인 Claude 결과가 없습니다. 먼저 추출을 완료해주세요.")
        return
        
    claude_metrics = calculate_metrics(claude_data, "Claude")
    gemma_metrics = calculate_metrics(gemma_data, "Gemma")
    exaone_metrics = calculate_metrics(exaone_data, "EXAONE")
    
    gemma_overlap = calculate_f1_overlap(claude_data, gemma_data)
    exaone_overlap = calculate_f1_overlap(claude_data, exaone_data)
    
    print("\n--- 1. 정량적 지표 (Volume & Format) ---")
    print(f"[Claude] Total Entities: {claude_metrics['total_entities']}, Avg Details: {claude_metrics['avg_details_per_entity']:.2f}, Schema Rate: {claude_metrics['valid_schema_rate']:.2%}")
    print(f"[Gemma]  Total Entities: {gemma_metrics['total_entities']}, Avg Details: {gemma_metrics['avg_details_per_entity']:.2f}, Schema Rate: {gemma_metrics['valid_schema_rate']:.2%}")
    print(f"[EXAONE] Total Entities: {exaone_metrics['total_entities']}, Avg Details: {exaone_metrics['avg_details_per_entity']:.2f}, Schema Rate: {exaone_metrics['valid_schema_rate']:.2%}")
    
    print("\n--- 2. Gemma 정확도 평가 (Claude 기준) ---")
    print(f"Precision (정밀도): {gemma_overlap['precision']:.4f}")
    print(f"Recall (재현율)   : {gemma_overlap['recall']:.4f}")
    print(f"F1-Score (조화평균): {gemma_overlap['f1_score']:.4f}")
    
    print("\n--- 3. EXAONE 정확도 평가 (Claude 기준) ---")
    print(f"Precision (정밀도): {exaone_overlap['precision']:.4f}")
    print(f"Recall (재현율)   : {exaone_overlap['recall']:.4f}")
    print(f"F1-Score (조화평균): {exaone_overlap['f1_score']:.4f}")
    
    visualize_metrics(claude_metrics, gemma_metrics, exaone_metrics, gemma_overlap, exaone_overlap)

if __name__ == "__main__":
    main()
