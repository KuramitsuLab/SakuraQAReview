import csv
import json

def convert_csv_to_json(csv_path, json_path):
    """
    DisneyのクイズCSVをquestions.json形式に変換する

    Args:
        csv_path: 入力CSVファイルのパス
        json_path: 出力JSONファイルのパス
    """
    questions = []

    with open(csv_path, 'r', encoding='utf-8') as csv_file:
        csv_reader = csv.DictReader(csv_file)

        for idx, row in enumerate(csv_reader, start=1):
            # questionIDを生成（Q001形式）
            question_id = f"Q{idx:03d}"

            # 選択肢リストを作成
            choices = [
                row['A'],
                row['B'],
                row['C'],
                row['D']
            ]

            # 正解のインデックスを取得（A=0, B=1, C=2, D=3）
            answer_letter = row['正解']  # カラム名が「正解」の方

            # JSON形式のquestionオブジェクトを作成
            question_obj = {
                "questionID": question_id,
                "keyword": "",
                "category": "ディズニー",
                "question": row['質問'],
                "choice": choices,
                "year": "",
                "reference_url": "",
                "authored_by": "disney"
            }

            questions.append(question_obj)

    # JSONファイルに書き込み
    with open(json_path, 'w', encoding='utf-8') as json_file:
        json.dump(questions, json_file, ensure_ascii=False, indent=2)

    print(f"変換完了: {len(questions)}問のクイズを {json_path} に出力しました")

if __name__ == "__main__":
    csv_path = "/Users/obarayui/Git/SakuraQAFood/Disney/DLquiz.csv"
    json_path = "/Users/obarayui/Git/SakuraQAFood/Disney/DLquiz.json"

    convert_csv_to_json(csv_path, json_path)
