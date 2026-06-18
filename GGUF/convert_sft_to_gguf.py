import os
import sys
import shutil
import subprocess
import urllib.request
from dotenv import load_dotenv

# Windows cp949 인코딩 에러 방지를 위한 UTF-8 강제 활성화
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

load_dotenv()

# 경로 기본값 설정
GGUF_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(GGUF_DIR)
SFT_PIPELINE_DIR = os.path.join(PROJECT_ROOT, "Scenario", "sft_pipeline")

# 로컬에 이미 다운로드된 허깅페이스 캐시 폴더로 고정 (추가 다운로드 차단)
os.environ["HF_HOME"] = r"C:\Users\mirmi\.cache\huggingface"

# LLM 모델별 구성 설정
# (베이스 모델 ID, LoRA 상대 경로, 출력 GGUF 파일명, Modelfile 파일명)
MODEL_CONFIGS = {
    "deepseek-1.5b": {
        "base_model": "deepseek-ai/DeepSeek-R1-Distill-Qwen-1.5B",
        "lora_dir": os.path.join(SFT_PIPELINE_DIR, "deepseek_1_5b_sft_lora", "final_model"),
        "gguf_filename": "deepseek_1_5b_sft.gguf",
        "modelfile": "deepseek_1_5b_sft.Modelfile"
    },
    "qwen-4b": {
        "base_model": "Qwen/Qwen3.5-4B",
        "lora_dir": os.path.join(SFT_PIPELINE_DIR, "qwen3_5_4b_sft_lora", "final_model"),
        "gguf_filename": "qwen3_5_4b_sft.gguf",
        "modelfile": "qwen3_5_4b_sft.Modelfile"
    },
    "exaone-1.2b": {
        "base_model": "LGAI-EXAONE/EXAONE-4.0-1.2B",
        "lora_dir": os.path.join(SFT_PIPELINE_DIR, "exaone_1_2b_sft_lora", "final_model"),
        "gguf_filename": "exaone_1_2b_sft.gguf",
        "modelfile": "exaone_1_2b_sft.Modelfile"
    },
    "gemma-2b": {
        "base_model": "google/gemma-4-E4B-it",
        "lora_dir": os.path.join(SFT_PIPELINE_DIR, "gemma2_2b_sft_optimized", "final_model"),
        "gguf_filename": "gemma_sft.gguf",
        "modelfile": "gemma_sft.Modelfile"
    }
}

CONVERT_SCRIPT_URL = "https://raw.githubusercontent.com/ggml-org/llama.cpp/master/convert_hf_to_gguf.py"
CONVERT_SCRIPT_NAME = "convert_hf_to_gguf.py"

def setup_environment():
    """변환에 필요한 Python 종속 라이브러리 설치 및 스크립트 다운로드"""
    print("[1/5] 환경 검사 및 패키지 설치 진행 중...")
    
    # gguf 및 sentencepiece 패키지 설치 시도
    try:
        import gguf
        import sentencepiece
        print("  [OK] 필요한 패키지(gguf, sentencepiece)가 이미 설치되어 있습니다.")
    except ImportError:
        print("  ! 필요한 패키지를 설치합니다 (pip install gguf sentencepiece)...")
        subprocess.check_call([sys.executable, "-m", "pip", "install", "gguf", "sentencepiece", "peft", "transformers", "torch"])

    # convert_hf_to_gguf.py 스크립트 다운로드
    script_path = os.path.join(GGUF_DIR, CONVERT_SCRIPT_NAME)
    if not os.path.exists(script_path):
        print(f"  ! {CONVERT_SCRIPT_NAME} 스크립트를 다운로드합니다...")
        urllib.request.urlretrieve(CONVERT_SCRIPT_URL, script_path)
        print("  [OK] 다운로드 완료.")
    else:
        print(f"  [OK] {CONVERT_SCRIPT_NAME} 스크립트가 이미 존재합니다.")

def merge_lora(base_model_id, lora_dir, temp_merged_dir):
    """베이스 모델과 LoRA 어댑터를 병합하여 임시 디렉토리에 저장"""
    print(f"\n[2/5] 모델 병합 시작:")
    print(f"  - 베이스 모델: {base_model_id}")
    print(f"  - LoRA 경로: {lora_dir}")
    print(f"  - 병합본 저장 경로: {temp_merged_dir}")
    
    import torch
    from transformers import AutoModelForCausalLM, AutoTokenizer
    from peft import PeftModel

    # 토크나이저 복사
    print("  - 토크나이저 로딩 중...")
    HF_TOKEN = os.environ.get("HF_TOKEN")
    tokenizer = AutoTokenizer.from_pretrained(base_model_id, token=HF_TOKEN, trust_remote_code=True)
    tokenizer.save_pretrained(temp_merged_dir)
    print("  [OK] 토크나이저 저장 완료.")

    # FP16 정밀도로 모델 로드 및 병합
    print("  - 가중치 병합 처리 중 (VRAM 공간 확인 권장)...")
    base_model = AutoModelForCausalLM.from_pretrained(
        base_model_id,
        torch_dtype=torch.float16,
        device_map="cpu",  # VRAM 부족을 최소화하기 위해 CPU 로딩 권장
        trust_remote_code=True,
        token=HF_TOKEN
    )
    
    model = PeftModel.from_pretrained(base_model, lora_dir)
    merged_model = model.merge_and_unload()
    merged_model.save_pretrained(temp_merged_dir)
    print("  [OK] 가중치 병합 및 저장 완료.")

def convert_to_gguf(temp_merged_dir, output_gguf_path, extra_args=None):
    """임시 병합 모델을 GGUF f16 포맷으로 변환"""
    if extra_args is None:
        extra_args = []
    print(f"\n[3/5] GGUF 변환 시작:")
    print(f"  - 출력 GGUF 파일: {output_gguf_path}")
    
    script_path = os.path.join(GGUF_DIR, CONVERT_SCRIPT_NAME)
    
    # convert_hf_to_gguf.py 실행
    cmd = [
        sys.executable, script_path,
        temp_merged_dir,
        "--outtype", "f16",
        "--outfile", output_gguf_path
    ] + extra_args
    
    print(f"  실행 명령어: {' '.join(cmd)}")
    subprocess.check_call(cmd)
    print("  [OK] GGUF 파일 생성 성공.")

def main():
    print("==========================================================")
    print(" SFT 모델 -> GGUF 원클릭 병합 및 변환 도구")
    print("==========================================================")
    
    setup_environment()
    
    available_models = []
    for model_name, cfg in MODEL_CONFIGS.items():
        if os.path.exists(cfg["lora_dir"]):
            available_models.append((model_name, cfg))
            print(f"  [FOUND] {model_name}: {cfg['lora_dir']}")
        else:
            print(f"  [SKIP] {model_name} (학습 어댑터가 존재하지 않음)")
            
    if not available_models:
        print("\n[오류] sft_pipeline 디렉토리 내에 학습된 어댑터가 하나도 식별되지 않았습니다.")
        print("sft_pipeline의 학습 스크립트가 성공적으로 완료되었는지 먼저 확인해 주세요.")
        return

    for model_name, cfg in available_models:
        output_gguf_path = os.path.join(GGUF_DIR, cfg["gguf_filename"])
        if os.path.exists(output_gguf_path):
            print(f"\n>>> [{model_name}] GGUF 파일이 이미 존재하여 빌드를 건너뜁니다: {cfg['gguf_filename']} <<<")
            continue

        print(f"\n\n>>> [{model_name}] 모델 처리를 개시합니다. <<<")
        
        temp_merged_dir = os.path.join(GGUF_DIR, f"temp_merged_{model_name}")
        
        try:
            # 1단계: 병합
            merge_lora(cfg["base_model"], cfg["lora_dir"], temp_merged_dir)
            
            # Qwen3.5 모델의 경우 MTP 헤더를 제외하는 옵션 추가
            extra_args = []
            if "qwen3.5" in cfg["base_model"].lower() or "qwen-4b" in model_name:
                print("  [INFO] Qwen 3.5 아키텍처용 MTP 제외 필터 적용 (--no-mtp)")
                extra_args = ["--no-mtp"]
            
            # 2단계: GGUF 변환
            convert_to_gguf(temp_merged_dir, output_gguf_path, extra_args)
            
            print(f"\n[4/5] 임시 리소스 정돈:")
            shutil.rmtree(temp_merged_dir)
            print(f"  [OK] 임시 폴더 삭제 완료: {temp_merged_dir}")
            
            print(f"\n[5/5] [SUCCESS] {model_name} 모델의 GGUF 빌드 성공!")
            print(f"  - GGUF 파일 경로: {output_gguf_path}")
            
        except Exception as e:
            print(f"\n[오류 발생] {model_name} 작업 중 실패: {str(e)}")
            import traceback
            traceback.print_exc()
            # 디버깅을 위해 에러 발생 시 임시 폴더 삭제 비활성화
            # if os.path.exists(temp_merged_dir):
            #     shutil.rmtree(temp_merged_dir)
            continue
            
    print("\n\n==========================================================")
    print(" GGUF 변환 절차가 완료되었습니다.")
    print("==========================================================")
    print("\n[Ollama에 최종 모델 등록하는 방법]")
    for model_name, cfg in available_models:
        gguf_path = os.path.join(GGUF_DIR, cfg["gguf_filename"])
        if os.path.exists(gguf_path):
            print(f"\n* {model_name} 모델 등록 명령어:")
            print(f"  cd {GGUF_DIR}")
            print(f"  ollama create {model_name}-sft -f {cfg['modelfile']}")
            
if __name__ == "__main__":
    main()
