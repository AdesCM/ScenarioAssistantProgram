import matplotlib.pyplot as plt
import numpy as np
import json
import os

# 폰트 설정 (윈도우 한글 폰트 설정)
plt.rcParams['font.family'] = 'Malgun Gothic'
plt.rcParams['axes.unicode_minus'] = False # 마이너스 기호 깨짐 방지
plt.rcParams['font.size'] = 12

SAVE_DIR = "data/paper_charts"
os.makedirs(SAVE_DIR, exist_ok=True)

def fig2_pie_chart():
    labels = ['Valid Samples', 'Filtered (Error/Low Quality)']
    sizes = [1419, 581]
    colors = ['#4CAF50', '#FF5252']
    explode = (0.1, 0) 

    plt.figure(figsize=(8, 6))
    plt.pie(sizes, explode=explode, labels=labels, colors=colors, autopct='%1.1f%%', shadow=True, startangle=140)
    plt.title('SFT Dataset Filtering Ratio (n=2,000)')
    plt.savefig(f"{SAVE_DIR}/fig2_data_filtering_ratio.png", dpi=300)
    plt.close()

def fig3_entity_frequency():
    # Claude 기준 평균 추출 수
    entities = ['Characters', 'Plots', 'Locations']
    counts = [3.2, 1.5, 1.8]
    colors = ['#1f77b4', '#ff7f0e', '#2ca02c']

    plt.figure(figsize=(10, 6))
    plt.bar(entities, counts, color=colors)
    plt.title('Average Entity Frequency per Scene (Teacher Model)')
    plt.ylabel('Average Count')
    plt.grid(axis='y', linestyle='--', alpha=0.7)
    plt.savefig(f"{SAVE_DIR}/fig3_entity_frequency.png", dpi=300)
    plt.close()

def fig4_training_metrics():
    # 실제 수치 반영 (Simplified for chart)
    epochs = [1, 2, 3, 4]
    loss = [1.84, 1.25, 0.92, 0.72]
    accuracy = [65.2, 74.8, 81.5, 85.27]

    fig, ax1 = plt.subplots(figsize=(10, 6))

    ax1.set_xlabel('에포크 (Epochs)')
    ax1.set_ylabel('학습 손실 (Training Loss)', color='tab:red')
    ax1.plot(epochs, loss, color='tab:red', marker='o', linewidth=3, label='손실 (Loss)')
    ax1.tick_params(axis='y', labelcolor='tab:red')

    ax2 = ax1.twinx()
    ax2.set_ylabel('토큰 예측 정확도 (%)', color='tab:blue')
    ax2.plot(epochs, accuracy, color='tab:blue', marker='s', linewidth=3, label='정확도 (Accuracy)')
    ax2.tick_params(axis='y', labelcolor='tab:blue')

    plt.title('에포크별 학습 손실 및 토큰 예측 정확도 추이')
    fig.tight_layout()
    plt.savefig(f"{SAVE_DIR}/fig4_training_metrics.png", dpi=300)
    plt.close()

def fig5_detailed_comparison():
    models = ['Claude 3.5', 'Gemma Base', 'Gemma SFT']
    char = [3.2, 1.8, 4.1]
    plot = [1.5, 0.4, 1.2]
    loc = [1.8, 1.1, 1.4]

    x = np.arange(len(models))
    width = 0.25

    fig, ax = plt.subplots(figsize=(12, 7))
    ax.bar(x - width, char, width, label='Characters', color='#3498db')
    ax.bar(x, plot, width, label='Plots', color='#e67e22')
    ax.bar(x + width, loc, width, label='Locations', color='#2ecc71')

    ax.set_ylabel('Average Count per Scene')
    ax.set_title('Entity Extraction Performance by Model')
    ax.set_xticks(x)
    ax.set_xticklabels(models)
    ax.legend()
    ax.grid(axis='y', linestyle='--', alpha=0.6)

    plt.savefig(f"{SAVE_DIR}/fig5_detailed_model_comparison.png", dpi=300)
    plt.close()

def fig6_hallucination_format():
    labels = ['Gemma Base', 'Gemma SFT']
    format_compliance = [53, 100]
    hallucination = [47, 0]

    plt.figure(figsize=(10, 7))
    plt.bar(labels, format_compliance, label='Format Compliance (%)', color='#2ecc71')
    plt.bar(labels, hallucination, bottom=format_compliance, label='Hallucination/Error (%)', color='#e74c3c')

    plt.ylabel('Percentage (%)')
    plt.title('Format Compliance vs. Hallucination Rate')
    plt.legend(loc='lower right')
    plt.savefig(f"{SAVE_DIR}/fig6_hallucination_format_compliance.png", dpi=300)
    plt.close()

def fig7_speed_quality():
    configs = ['512 Tokens', '1024 Tokens']
    success_rate = [27, 93.5] # %
    time_per_chunk = [100, 300] # seconds (1m40s vs 5m)

    fig, ax1 = plt.subplots(figsize=(10, 6))

    ax1.set_xlabel('Max Output Token Length')
    ax1.set_ylabel('Success Rate (%)', color='#9b59b6')
    ax1.plot(configs, success_rate, color='#9b59b6', marker='D', markersize=10, linewidth=4, label='Success Rate')
    ax1.tick_params(axis='y', labelcolor='#9b59b6')
    ax1.set_ylim(0, 110)

    ax2 = ax1.twinx()
    ax2.set_ylabel('Time per Chunk (sec)', color='#34495e')
    ax2.bar(configs, time_per_chunk, alpha=0.3, color='#34495e', width=0.4, label='Inference Time')
    ax2.tick_params(axis='y', labelcolor='#34495e')
    ax2.set_ylim(0, 400)

    plt.title('Inference Speed vs. Extraction Quality Trade-off')
    fig.tight_layout()
    plt.savefig(f"{SAVE_DIR}/fig7_speed_quality_tradeoff.png", dpi=300)
    plt.close()

if __name__ == "__main__":
    fig2_pie_chart()
    fig3_entity_frequency()
    fig4_training_metrics()
    fig5_detailed_comparison()
    fig6_hallucination_format()
    fig7_speed_quality()
    print(f"All charts generated successfully in {SAVE_DIR}/")
