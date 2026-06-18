import os
import json
from datetime import datetime

def convert_to_detail_fields(details_dict):
    if not details_dict:
        return []
    detail_fields = []
    for k, v in details_dict.items():
        detail_fields.append({
            "key": str(k),
            "type": "text",
            "value": str(v),
            "tags": []
        })
    return detail_fields

def main():
    sft_pipeline_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    scenario_dir = os.path.dirname(sft_pipeline_dir)
    
    extracted_path = os.path.join(sft_pipeline_dir, "data", "extracted_finetuned_200.json")
    output_path = os.path.join(scenario_dir, "universe_qwen_sft_backup.json")
    
    if not os.path.exists(extracted_path):
        print(f"Error: '{extracted_path}' not found.")
        return
        
    with open(extracted_path, "r", encoding="utf-8") as f:
        chunks = json.load(f)
        
    print(f"Loaded {len(chunks)} chunks from Qwen SFT extracted data.")
    
    # 중복 제거 병합용 딕셔너리 (name 기준)
    merged_characters = {}
    merged_plots = {}
    merged_locations = {}
    
    char_id_counter = 1
    plot_id_counter = 1
    loc_id_counter = 1
    
    now_str = datetime.now().toLocaleDateString('ko-KR') if hasattr(datetime.now(), 'toLocaleDateString') else datetime.now().strftime("%Y. %m. %d.")
    placeholder_img = "https://placehold.co/400x600/5f6368/FFFFFF?text=Image"
    
    for chunk in chunks:
        chunk_json = chunk.get("json", {})
        if not chunk_json:
            continue
            
        # 1. Characters 병합
        for char in chunk_json.get("characters", []):
            name = char.get("name", "").strip()
            if not name:
                continue
            details = char.get("details", {})
            if name not in merged_characters:
                merged_characters[name] = {
                    "id": f"char_{char_id_counter}",
                    "name": name,
                    "lastEdited": now_str,
                    "imageUrl": placeholder_img,
                    "details": {}
                }
                char_id_counter += 1
            # 속성 병합
            if isinstance(details, dict):
                merged_characters[name]["details"].update(details)
                
        # 2. Plots 병합
        for plot in chunk_json.get("plots", []):
            name = plot.get("name", "").strip()
            if not name:
                continue
            details = plot.get("details", {})
            if name not in merged_plots:
                merged_plots[name] = {
                    "id": f"plot_{plot_id_counter}",
                    "name": name,
                    "lastEdited": now_str,
                    "imageUrl": placeholder_img,
                    "details": {}
                }
                plot_id_counter += 1
            # 속성 병합
            if isinstance(details, dict):
                merged_plots[name]["details"].update(details)
                
        # 3. Locations 병합
        for loc in chunk_json.get("locations", []):
            name = loc.get("name", "").strip()
            if not name:
                continue
            details = loc.get("details", {})
            if name not in merged_locations:
                merged_locations[name] = {
                    "id": f"loc_{loc_id_counter}",
                    "name": name,
                    "lastEdited": now_str,
                    "imageUrl": placeholder_img,
                    "details": {}
                }
                loc_id_counter += 1
            # 속성 병합
            if isinstance(details, dict):
                merged_locations[name]["details"].update(details)
                
    # details를 DetailField[] 형식으로 최종 변환
    final_characters = []
    for char in merged_characters.values():
        char["details"] = convert_to_detail_fields(char["details"])
        final_characters.append(char)
        
    final_plots = []
    for plot in merged_plots.values():
        plot["details"] = convert_to_detail_fields(plot["details"])
        final_plots.append(plot)
        
    final_locations = []
    for loc in merged_locations.values():
        loc["details"] = convert_to_detail_fields(loc["details"])
        final_locations.append(loc)
        
    # Universe 백업 규격 생성
    universe_backup = [
        {
            "id": "qwen_sft_universe",
            "name": "Qwen SFT 추출 세계관 (한국 단편 소설)",
            "lastEditedBy": now_str,
            "iconAsset": "assets/placeholder_icon.png",
            "characters": final_characters,
            "plots": final_plots,
            "locations": final_locations,
            "timeline": []
        }
    ]
    
    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(universe_backup, f, ensure_ascii=False, indent=2)
        
    print(f"Successfully converted and saved backup to: {output_path}")
    print(f"Summary:")
    print(f"  - Characters: {len(final_characters)}")
    print(f"  - Plots: {len(final_plots)}")
    print(f"  - Locations: {len(final_locations)}")

if __name__ == "__main__":
    main()
