import os
import subprocess
import time
import sys

# VRAM 메모리 단편화 방지
os.environ["PYTORCH_CUDA_ALLOC_CONF"] = "expandable_segments:True"

# 한글 출력 버퍼링 방지
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))

def run_command(command, log_filepath):
    print(f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] 명령어 실행 시작:")
    print(f"  {command}")
    print(f"  로그 저장 경로: {log_filepath}")
    
    with open(log_filepath, "w", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            command,
            shell=True,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=SCRIPT_DIR,
            text=True
        )
        
        # 주기적으로 종료 여부 확인 및 시간 모니터링
        start_time = time.time()
        while process.poll() is None:
            time.sleep(10)
            elapsed = time.time() - start_time
            # 매 1분마다 경과 보고(콘솔에만 출력)
            if int(elapsed) % 60 < 10:
                print(f"  실행 중... ({int(elapsed)//60}분 경과)", end="\r")
                
        exit_code = process.returncode
        elapsed_time = time.time() - start_time
        
    print(f"\n[{time.strftime('%Y-%m-%d %H:%M:%S')}] 명령어 실행 완료 (Exit Code: {exit_code}, 소요시간: {int(elapsed_time)//60}분 {int(elapsed_time)%60}초)")
    return exit_code

def main():
    print("=========================================================")
    print(" SFT 모델 통합 데이터 추출 및 비교 평가 파이프라인")
    print("=========================================================")
    
    # 1. Qwen 3.5 4B 남은 청크 추출 (이어하기 지원됨)
    print("\n[1단계] Qwen 3.5 4B SFT 모델 엔티티 추출 진행")
    qwen_command = (
        "python 6_extract_finetuned_json_generic.py "
        "--model_id Qwen/Qwen3.5-4B "
        "--lora_dir qwen3_5_4b_sft_lora/final_model "
        "--output_file data/extracted_finetuned_200.json "
        "--progress_file data/progress_finetuned_200.json "
        "--limit 200"
    )
    qwen_log = os.path.join(SCRIPT_DIR, "extract_qwen3_5_4b_pipeline.log")
    run_command(qwen_command, qwen_log)
    
    # 2. EXAONE 4.0 1.2B SFT 모델 청크 추출
    print("\n[2단계] EXAONE 4.0 1.2B SFT 모델 엔티티 추출 진행")
    exaone_command = (
        "python 6_extract_finetuned_json_generic.py "
        "--model_id LGAI-EXAONE/EXAONE-4.0-1.2B "
        "--lora_dir exaone_1_2b_sft_lora/final_model "
        "--output_file data/extracted_exaone_1_2b_finetuned.json "
        "--progress_file data/progress_exaone_1_2b_finetuned.json "
        "--limit 200"
    )
    exaone_log = os.path.join(SCRIPT_DIR, "extract_exaone_1_2b_pipeline.log")
    run_command(exaone_command, exaone_log)
    
    # 3. 통합 평가 스크립트 실행
    print("\n[3단계] SFT 모델 통합 평가 및 차트 생성 진행")
    eval_command = "python 9_evaluate_all_sft.py --claude_file data/extracted.json --limit 200"
    eval_log = os.path.join(SCRIPT_DIR, "evaluate_all_sft_pipeline.log")
    run_command(eval_command, eval_log)
    
    print("\n=========================================================")
    print(" 파이프라인 전체 과정이 완료되었습니다.")
    print("=========================================================")

if __name__ == "__main__":
    main()
