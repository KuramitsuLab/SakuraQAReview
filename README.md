# SakuraQA レビューツール - 運用ガイド

このドキュメントは、SakuraQAのレビューツールの実際の運用方法とデータの流れを説明します。

---

## 📋 目次

1. [プロジェクト概要](#プロジェクト概要)
2. [アクセス方法](#アクセス方法)
3. [データセット](#データセット)
4. [レビューの流れ](#レビューの流れ)
5. [データの保存先](#データの保存先)
6. [システムアーキテクチャ](#システムアーキテクチャ)
7. [データ分析](#データ分析)

---

## プロジェクト概要

**SakuraQA レビューツール**は、4択クイズをレビューし、その結果をAWS S3に保存するWebアプリケーションです。

### 主な機能

- ✅ カテゴリ別の問題をレビュー
- 💾 1問ごとにリアルタイムでS3に保存
- 📊 レビュー結果の統計表示
- 📝 各問題へのコメント機能
- 🔄 途中保存と再開機能

---

## アクセス方法

### 本番環境（GitHub Pages）

**URL**: https://obarayui.github.io/qareview_notimg/

ブラウザで上記URLにアクセスすると、レビューツールが利用できます。

### ローカル環境

開発・テスト用にローカルで実行する場合：

```bash
cd /Users/obarayui/Git/qareview_notimg
python3 -m http.server 8000 --bind 127.0.0.1
```

その後、http://127.0.0.1:8000 にアクセス

---

## データセット

### 問題ファイルの場所

```
/quiz/questions.json
```

### 問題数

問題セットに応じて変動します

### データ形式

各問題は以下の形式で保存されています：

```json
{
  "questionID": "Q001",
  "keyword": "キーワード例",
  "category": "カテゴリ名",
  "question": "問題文がここに入ります",
  "choice": [
    "選択肢1",        // インデックス0（正解）
    "選択肢2",
    "選択肢3",
    "選択肢4"
  ],
  "year": "2024",
  "reference_url": "https://example.com/reference",
  "authored_by": "SakuraQA"
}
```

**重要**: 正解は常に`choice`配列の**最初の要素（インデックス0）**です。

---

## レビューの流れ

### 1. レビュー開始

アプリケーションのURLにアクセスして、レビューアー名とカテゴリを選択します。

### 2. 問題に回答

1. **問題文**と**4つの選択肢**が表示される
2. 1つの選択肢を選択
3. **「回答を提出」**ボタンをクリック

### 3. 結果の表示

- 正誤判定が即座に表示される
- 正解の選択肢がハイライトされる
- 選択した選択肢（不正解の場合）もハイライトされる

### 4. コメント入力（オプション）

- 問題についてのコメントを入力可能
- コメントは後でS3に保存される

### 5. 次の問題へ

- **「次の問題へ」**ボタンで次の問題に進む
- 最後の問題では**「レビュー完了」**ボタンが表示される

### 6. レビュー完了

- 正解数・正解率などの統計が表示される
- 自動的にホーム画面に戻る

---

## データの保存先

### ローカル保存（localStorage）

すべてのレビュー結果は、まずブラウザの`localStorage`に保存されます。

**キー**: `review_results`

**形式**: JSON配列

### AWS S3への保存

レビュー結果は1問回答するごとに、AWS S3に自動保存されます。

#### 保存先

**S3バケット**: `sakuraqa-review-results`

**ファイルパス**: `review.json`

**リージョン**: `ap-northeast-1`（東京）

#### アクセス方法

```
AWS Console
→ S3
→ sakuraqa-review-results
→ review.json
```

### データ形式

S3の`review.json`は以下の形式で保存されています：

```json
[
  {
    "review_id": "review_1730369876543_abc12345",
    "question_id": "Q001",
    "question_set": "カテゴリ名",
    "question_index": 0,
    "keyword": "キーワード",
    "category": "カテゴリ名",
    "question_text": "問題文がここに入ります",
    "reviewer_name": "田中太郎",
    "answer": "選択肢1",
    "correct_answer": "選択肢1",
    "is_correct": true,
    "timestamp": "2025-10-31T12:34:56.789Z",
    "comment": "コメント例"
  },
  {
    "review_id": "review_1730369901234_def67890",
    "question_id": "Q002",
    "question_set": "カテゴリ名",
    "question_index": 1,
    "keyword": "キーワード2",
    "category": "カテゴリ名",
    "question_text": "別の問題文の例",
    "reviewer_name": "田中太郎",
    "answer": "選択肢2",
    "correct_answer": "選択肢1",
    "is_correct": false,
    "timestamp": "2025-10-31T12:35:23.456Z",
    "comment": ""
  }
]
```

### データ構造の詳細

| フィールド | 型 | 説明 |
|-----------|-----|------|
| `review_id` | String | レビューの一意識別子（タイムスタンプ + ランダム文字列） |
| `question_id` | String | 問題ID（例: Q001） |
| `question_set` | String | 問題セット名（例: 食） |
| `question_index` | Number | 問題のインデックス番号（0から開始） |
| `keyword` | String | 問題のキーワード |
| `category` | String | カテゴリ名 |
| `question_text` | String | 問題文 |
| `reviewer_name` | String | レビューアー名 |
| `answer` | String | 選択した回答 |
| `correct_answer` | String | 正解の選択肢 |
| `is_correct` | Boolean | 正誤判定（true=正解、false=不正解） |
| `timestamp` | String | 回答日時（ISO 8601形式） |
| `comment` | String | コメント（オプション） |

### データの追記方式

- **1問回答するごとに**、Lambda関数が`review.json`を読み込み、新しいレビューデータを追加してS3に保存
- 同じ`review_id`が既に存在する場合は、そのレビューを更新（コメント追加など）
- 複数のレビューアーのデータが同一ファイルに蓄積される

---

## システムアーキテクチャ

### データフロー図

```
┌─────────────────────────────────────┐
│  ブラウザ（GitHub Pages）            │
│  https://obarayui.github.io/        │
│        qareview_notimg/             │
└─────────────┬───────────────────────┘
              │
              │ 1. 問題データを取得
              ↓
┌─────────────────────────────────────┐
│  GitHub Repository（Raw Content）    │
│  quiz/questions.json                │
└─────────────────────────────────────┘

              ↓ ユーザーが回答

┌─────────────────────────────────────┐
│  localStorage                        │
│  review_results                     │
└─────────────┬───────────────────────┘
              │
              │ 2. 1問ごとにAPI送信
              ↓
┌─────────────────────────────────────┐
│  API Gateway (HTTP API)             │
│  POST /review                       │
└─────────────┬───────────────────────┘
              │
              │ 3. Lambda関数を呼び出し
              ↓
┌─────────────────────────────────────┐
│  AWS Lambda                         │
│  SaveReviewToS3                     │
│  - review.jsonを取得                │
│  - 新規データを追加                 │
│  - S3に保存                         │
└─────────────┬───────────────────────┘
              │
              │ 4. データを保存
              ↓
┌─────────────────────────────────────┐
│  AWS S3                             │
│  Bucket: sakuraqa-review-results    │
│  File: review.json                  │
└─────────────────────────────────────┘
```

### 使用しているAWSサービス

1. **API Gateway (HTTP API)**
   - エンドポイント: `https://ogllpkngp1.execute-api.ap-northeast-1.amazonaws.com/review`
   - メソッド: POST
   - CORS有効化

2. **AWS Lambda**
   - 関数名: `SaveReviewToS3`
   - ランタイム: Node.js 20.x
   - 役割: S3への読み書き処理

3. **AWS S3**
   - バケット名: `sakuraqa-review-results`
   - ファイル: `review.json`
   - アクセス: Lambda経由のみ（プライベート）

4. **CloudWatch Logs**
   - Lambda関数の実行ログを記録
   - エラー監視・デバッグに使用

---

## データ分析

### S3からデータをダウンロード

1. **AWS Console** → **S3**
2. バケット `sakuraqa-review-results` を開く
3. `review.json` をクリック
4. **ダウンロード** ボタンをクリック

### データの分析方法

#### 1. ブラウザのコンソールで統計を表示

```javascript
// 開発者ツール（F12）のConsoleで実行
const stats = StorageManager.getStatistics();
console.log(stats);
```

出力例：
```javascript
{
  total: 108,
  correct: 95,
  incorrect: 13,
  accuracy: 87.96,
  byCategory: {
    "カテゴリ1": { total: 50, correct: 45, incorrect: 5, accuracy: 90.00 },
    "カテゴリ2": { total: 30, correct: 25, incorrect: 5, accuracy: 83.33 }
  },
  byReviewer: {
    "田中太郎": { total: 108, correct: 95, incorrect: 13, accuracy: 87.96 }
  }
}
```

#### 2. JSON/CSVでエクスポート

```javascript
// JSON形式でダウンロード
StorageManager.exportToJSON();

// CSV形式でダウンロード（Excel対応）
StorageManager.exportToCSV();
```

#### 3. Python/Pandas で分析

```python
import pandas as pd
import json

# S3からダウンロードしたreview.jsonを読み込み
with open('review.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# DataFrameに変換
df = pd.DataFrame(data)

# 正解率を計算
accuracy = df['is_correct'].mean() * 100
print(f"全体の正解率: {accuracy:.2f}%")

# カテゴリ別の正解率
category_stats = df.groupby('category')['is_correct'].agg(['count', 'sum', 'mean'])
print(category_stats)

# レビューアー別の正解率
reviewer_stats = df.groupby('reviewer_name')['is_correct'].agg(['count', 'sum', 'mean'])
print(reviewer_stats)
```

#### 4. Amazon Athena で分析（高度）

S3に保存されたデータを、Amazon Athenaを使ってSQLで分析することも可能です。

詳細は[DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)の「次のステップ」セクションを参照してください。

---

## トラブルシューティング

### データが保存されない

**確認事項**:
1. ブラウザのコンソール（F12）でエラーを確認
2. API GatewayのCORS設定を確認
3. Lambda関数のCloudWatch Logsを確認

**詳細**: [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md)のトラブルシューティングセクション

### S3のreview.jsonが見つからない

**原因**: まだ1問も回答していない

**解決**: 少なくとも1問回答すると`review.json`が作成されます

### データが重複して保存される

**原因**: ネットワークエラーで再試行した場合

**解決**: Lambda関数は`review_id`で重複をチェックしているため、通常は重複しません

---

## まとめ

このレビューツールは、以下の流れでデータを管理します：

1. **questions.json**（GitHub）から問題を取得
2. ユーザーがレビューを実行
3. **localStorage**（ブラウザ）に即座に保存
4. **API Gateway → Lambda → S3**の経路で`review.json`に追記保存
5. S3の`review.json`で全レビューデータを一元管理

すべてのデータは1つの`review.json`ファイルにJSON配列形式で保存され、後から分析や統計処理が可能です。

---

## 関連ドキュメント

- [README.md](./README.md) - プロジェクト全体の説明
- [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md) - AWS環境の構築手順
- [Claude_food_review.md](./Claude_food_review.md) - プロジェクト仕様書
