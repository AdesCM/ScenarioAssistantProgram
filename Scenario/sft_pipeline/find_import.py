import os
import sys

target = 'DataCollatorForCompletionOnlyLM'
search_dir = None

# Try to find site-packages containing trl
for path in sys.path:
    if 'site-packages' in path:
        test_dir = os.path.join(path, 'trl')
        if os.path.exists(test_dir):
            search_dir = test_dir
            break

if not search_dir:
    print("trl not found in sys.path")
    sys.exit(1)

print(f"Searching in: {search_dir}")
found = False
for root, dirs, files in os.walk(search_dir):
    for f in files:
        if f.endswith('.py'):
            p = os.path.join(root, f)
            try:
                with open(p, 'r', encoding='utf-8') as file:
                    if target in file.read():
                        print(f"Found in: {p}")
                        found = True
            except Exception:
                pass

if not found:
    print("Not found in trl directory.")
