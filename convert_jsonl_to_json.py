#!/usr/bin/env python3
"""
JSONLファイルをquestions.json形式に変換するスクリプト
"""
import json
import sys

def convert_jsonl_to_questions(ai_path, human_path, output_path):
    """
    2つのJSONLファイルを読み込んで、questions.json形式に変換

    Args:
        ai_path: Disneybenchmark_AI.jsonlのパス
        human_path: Disneybenchmark_human.jsonlのパス
        output_path: 出力ファイルのパス
    """
    questions = []
    question_id = 1

    # Disneybenchmark_AI.jsonlを処理
    print(f"読み込み中: {ai_path}")
    with open(ai_path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f, start=1):
            if not line.strip():
                continue

            data = json.loads(line)

            # answer (A, B, C, D) を選択肢のテキストに変換
            answer_index = {'A': 0, 'B': 1, 'C': 2, 'D': 3}[data['answer']]
            answer_text = data['choices'][answer_index]

            # authored_byを40問ごとに変更
            if i <= 40:
                authored_by = "GPT"
            elif i <= 80:
                authored_by = "Claude"
            else:
                authored_by = "Gemini"

            question = {
                "questionID": f"Q{question_id:03d}",
                "keyword": "",
                "category": "ディズニー",
                "question": data['question'],
                "choice": data['choices'],
                "answer": answer_text,
                "year": "",
                "reference_url": "",
                "authored_by": authored_by
            }

            questions.append(question)
            question_id += 1

    print(f"AI問題数: {len(questions)}")

    # Disneybenchmark_human.jsonlを処理
    print(f"読み込み中: {human_path}")
    with open(human_path, 'r', encoding='utf-8') as f:
        for line in f:
            if not line.strip():
                continue

            data = json.loads(line)

            # answer (A, B, C, D) を選択肢のテキストに変換
            answer_index = {'A': 0, 'B': 1, 'C': 2, 'D': 3}[data['answer']]
            answer_text = data['choices'][answer_index]

            question = {
                "questionID": f"Q{question_id:03d}",
                "keyword": "",
                "category": "ディズニー",
                "question": data['question'],
                "choice": data['choices'],
                "answer": answer_text,
                "year": "",
                "reference_url": "",
                "authored_by": "human"
            }

            questions.append(question)
            question_id += 1

    print(f"合計問題数: {len(questions)}")

    # JSON形式で出力
    print(f"出力中: {output_path}")
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(questions, f, ensure_ascii=False, indent=2)

    print("変換完了！")
    print(f"- AI問題: {question_id - 121}問 (GPT: 40問, Claude: 40問, Gemini: {question_id - 161}問)")
    print(f"- Human問題: 120問")
    print(f"- 合計: {len(questions)}問")

if __name__ == "__main__":
    ai_path = "Disney/Disneybenchmark_AI.jsonl"
    human_path = "Disney/Disneybenchmark_human.jsonl"
    output_path = "quiz/questions.json"

    try:
        convert_jsonl_to_questions(ai_path, human_path, output_path)
    except Exception as e:
        print(f"エラー: {e}", file=sys.stderr)
        sys.exit(1)
