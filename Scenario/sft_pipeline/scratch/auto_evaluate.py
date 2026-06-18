import os
import json
import time
import subprocess

PROGRESS_FILE = "data/progress_gemma2_2b_optimized.json"
EVAL_SCRIPT = "9_evaluate_all_sft.py"

print("자동 평가 대기 스크립트 가동 중...")
start_time = time.time()

while True:
    if os.path.exists(PROGRESS_FILE):
        try:
            with open(PROGRESS_FILE, "r", encoding="utf-8") as f:
                progress = json.load(f)
            
            success = sum(1 for v in progress.values() if not v.get("error"))
            fail = sum(1 for v in progress.values() if v.get("error"))
            total = len(progress)
            
            print(f"[{time.strftime('%H:%M:%S')}] 성공: {success}/200 | 남은 에러: {fail}개 (총 감지 청크: {total})")
            
            # 200개 모두 에러 없이 처리 완료된 경우
            if success == 200 and fail == 0:
                print("\n[!] 모든 청크의 에러 복구가 완료되었습니다! 평가를 시작합니다.")
                break
        except Exception as e:
            print(f"파일 로딩 에러: {e}")
            
    time.sleep(15)

# 평가 스크립트 실행
try:
    result = subprocess.run(["python", EVAL_SCRIPT], capture_output=True, text=True, encoding="utf-8")
    print("\n=== [ 평가 결과 ] ===")
    print(result.stdout)
    if result.stderr:
        print("=== [ 에러 출력 ] ===")
        print(result.stderr)
except Exception as e:
    print(f"평가 스크립트 실행 중 에러 발생: {e}")
