# デプロイメントガイド

このガイドでは、SakuraQA レビューアプリケーションをGitHub Pagesにデプロイし、レビュー結果をAWS S3に保存する環境を構築する手順を説明します。

## 目次

1. [GitHub Pagesへのデプロイ](#1-github-pagesへのデプロイ)
2. [AWS S3の設定](#2-aws-s3の設定)
3. [AWS Cognitoの設定](#3-aws-cognitoの設定)
4. [アプリケーションの設定](#4-アプリケーションの設定)
5. [動作確認](#5-動作確認)

---

## 1. GitHub Pagesへのデプロイ

### 1.1 リポジトリの準備

リポジトリがGitHubにプッシュされていることを確認してください。

```bash
git status
git add .
git commit -m "Prepare for GitHub Pages deployment"
git push origin main
```

### 1.2 GitHub Pagesの有効化

1. GitHubリポジトリページにアクセス
2. **Settings** タブをクリック
3. 左サイドバーから **Pages** を選択
4. **Source** セクションで以下を選択：
   - Branch: `main`
   - Folder: `/ (root)`
5. **Save** をクリック

数分後、以下のようなURLでアプリケーションにアクセスできます：
```
https://<username>.github.io/<repository-name>/
```

### 1.3 ベースURLの設定（必要に応じて）

リポジトリ名がパスに含まれる場合、`index.html`と`review.html`内のパスを調整する必要があります。

例：`https://username.github.io/qareview_notimg/`の場合

**修正が必要な箇所**：
- CSS/JSファイルのパス
- 問題ファイルのパス（`QUESTIONS_PATH`）

---

## 2. AWS S3の設定

レビュー結果をS3に保存するための設定を行います。

### 2.1 S3バケットの作成

1. AWS Management Consoleにログイン
2. **S3** サービスに移動
3. **バケットを作成** をクリック

**バケット設定**：
- **バケット名**: `sakuraqa-review-results`（任意のユニークな名前）
- **リージョン**: `ap-northeast-1`（東京リージョン推奨）
- **パブリックアクセスをブロック**: すべてチェック（セキュリティのため）

4. **バケットを作成** をクリック

**注意**: このバケットには`review.json`という単一のファイルにすべてのレビュー結果が保存されます。

---

## 3. AWS Lambda関数の作成

レビューデータをS3に保存するLambda関数を作成します。

### 3.1 Lambda関数の作成

1. AWS Management Consoleで **Lambda** サービスに移動
2. **関数の作成** をクリック
3. 以下の設定で作成：

**基本的な情報**：
- **関数名**: `SaveReviewToS3`
- **ランタイム**: `Node.js 20.x` または最新バージョン
- **アーキテクチャ**: `x86_64`

4. **関数の作成** をクリック

### 3.2 Lambda関数のコード

1. 関数の **コード** タブで、`lambda/index.mjs`の内容をコピー＆ペースト
2. **Deploy** ボタンをクリック

### 3.3 環境変数の設定

1. **設定** タブ → **環境変数** をクリック
2. 以下の環境変数を追加：

| キー | 値 |
|------|-----|
| `S3_BUCKET_NAME` | `sakuraqa-review-results`（作成したバケット名） |

**注意**: `AWS_REGION`は予約済み環境変数のため、手動で設定する必要はありません。Lambda関数は自動的に実行中のリージョンを取得します。

### 3.4 IAMロールの権限設定

Lambda関数がS3にアクセスできるよう権限を設定します。

1. **設定** タブ → **アクセス権限** をクリック
2. **実行ロール** の下にある **ロール名** をクリック（IAMコンソールに移動）
3. **許可を追加** → **インラインポリシーを作成** をクリック
4. JSONタブで以下のポリシーを追加：

```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:GetObject",
                "s3:PutObject"
            ],
            "Resource": "arn:aws:s3:::sakuraqa-review-results/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:ListBucket"
            ],
            "Resource": "arn:aws:s3:::sakuraqa-review-results"
        }
    ]
}
```

5. ポリシー名: `S3ReviewAccessPolicy`
6. **ポリシーの作成** をクリック

### 3.5 タイムアウトの設定

1. **設定** タブ → **一般設定** → **編集** をクリック
2. **タイムアウト**: `30秒` に設定（デフォルトの3秒では不足する可能性があります）
3. **保存** をクリック

---

## 4. API Gatewayの設定

Lambda関数をHTTP APIとして公開します。

### 4.1 API Gatewayの作成

1. AWS Management Consoleで **API Gateway** サービスに移動
2. **APIを作成** をクリック
3. **HTTP API** を選択して **構築** をクリック

**API作成**：
- **API名**: `ReviewAPI`
- **統合を追加**: **Lambda** を選択
- **Lambda関数**: 先ほど作成した `SaveReviewToS3` を選択
- **APIパス**: `/review`
- **メソッド**: `POST`

4. **次へ** → **次へ** → **作成** をクリック

### 4.2 CORSの設定

1. 作成したAPIを選択
2. 左メニューから **CORS** をクリック
3. **Configure CORS** をクリック
4. 以下のように設定：

   - **Access-Control-Allow-Origin**: `*`
     - ローカルテストとGitHub Pagesの両方で使うため、まずは`*`に設定
     - 本番環境では`https://<username>.github.io`に制限推奨

   - **Access-Control-Allow-Headers**:
     - `content-type` を入力（小文字で入力）

   - **Access-Control-Allow-Methods**:
     - `POST` にチェック
     - `OPTIONS` にチェック

   - **Access-Control-Expose-Headers**: （空欄でOK）

   - **Access-Control-Max-Age**: `300`（オプション、デフォルトでOK）

   - **Access-Control-Allow-Credentials**: チェックなし

5. **保存** をクリック

**重要**: CORS設定を保存すると、API Gatewayが自動的にOPTIONSメソッドを処理するようになります。Lambda関数のOPTIONSハンドリングコードは使用されません。

### 4.3 APIエンドポイントURLを控える

1. 左メニューから **ステージ** をクリック
2. **$default** ステージを選択
3. **呼び出しURL** をコピー（例: `https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com`）

**最終的なAPIエンドポイント**は以下の形式になります：
```
https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/review
```

このURLを次のステップで使用します。

---

## 5. アプリケーションの設定

### 5.1 AWS設定ファイルの作成

プロジェクトルートに`js/aws-config.js`ファイルを作成します。テンプレートをコピー：

```bash
cp js/aws-config.example.js js/aws-config.js
```

`js/aws-config.js`を開き、以下の値を設定：

```javascript
const AWS_CONFIG = {
    region: 'ap-northeast-1',
    bucketName: 'sakuraqa-review-results', // 実際のバケット名に置き換え
    apiEndpoint: 'https://xxxxxxxxxx.execute-api.ap-northeast-1.amazonaws.com/review', // 実際のAPI GatewayのURLに置き換え
    enableS3Upload: true
};
```

**重要**: `apiEndpoint`は手順4.3で取得したAPI Gateway URLに置き換えてください。

### 5.2 .gitignoreの設定（セキュリティ）

AWS設定を`.gitignore`に追加してGitにコミットしないようにします：

```bash
echo "js/aws-config.js" >> .gitignore
```

これにより、APIエンドポイントURLやその他の設定情報が公開リポジトリにコミットされるのを防ぎます。

### 5.3 設定の確認

`review.html`で正しくスクリプトが読み込まれているか確認：

```html
<!-- AWS設定ファイル（存在しない場合はAPI送信機能が無効化されます） -->
<script src="js/aws-config.js"></script>

<script src="js/github.js"></script>
<script src="js/storage.js"></script>
<script src="js/app.js"></script>
```

---

## 6. 動作確認

### 6.1 ローカルでのテスト

```bash
python3 -m http.server 8000 --bind 127.0.0.1
```

http://127.0.0.1:8000 にアクセスして、以下を確認：

1. レビューアー名を入力
2. カテゴリを選択
3. 問題に回答して提出
4. ブラウザの開発者ツールのコンソールで「APIに保存成功」メッセージを確認

### 6.2 S3バケットの確認

AWS Management Console → S3 → バケット内に`review.json`ファイルが作成されているか確認：

```
review.json  ← すべてのレビューデータが1つのファイルに保存される
```

`review.json`の内容例：
```json
[
  {
    "review_id": "review_1698765432000_abc12345",
    "question_id": "Q001",
    "question_set": "食",
    "question_index": 0,
    "keyword": "寿司",
    "category": "食",
    "question_text": "寿司の発祥地は？",
    "reviewer_name": "田中太郎",
    "answer": "東京",
    "correct_answer": "東京",
    "is_correct": true,
    "timestamp": "2025-10-31T12:34:56.789Z",
    "comment": "知っていました"
  }
]
```

### 6.3 Lambda関数のログ確認

1. AWS Management Console → CloudWatch → ロググループ
2. `/aws/lambda/SaveReviewToS3` ロググループを選択
3. 最新のログストリームを確認
4. 正常に動作していれば「Successfully updated review.json in S3」などのログが表示される

### 6.4 GitHub Pagesでの確認

GitHub Pagesのデプロイが完了したら、URLにアクセスして同様に動作を確認します。

---

## 7. トラブルシューティング

### CORSエラーが発生する場合

**症状**: コンソールに「Access to fetch at '...' from origin '...' has been blocked by CORS policy: Response to preflight request doesn't pass access control check」

**解決策**:
1. **API GatewayのCORS設定を確認**
   - AWS Console → API Gateway → ReviewAPI → CORS
   - `Access-Control-Allow-Origin`が`*`または`http://127.0.0.1:8000`を含むか確認
   - `Access-Control-Allow-Methods`に`POST`と`OPTIONS`が両方選択されているか確認
   - `Access-Control-Allow-Headers`に`content-type`が含まれているか確認

2. **CORS設定を再保存**
   - CORS設定画面で何も変更せず、もう一度「保存」をクリック
   - 設定が正しく反映されるまで1-2分待つ

3. **curlでOPTIONSリクエストをテスト**（ターミナルで実行）:
   ```bash
   curl -X OPTIONS "https://YOUR_API_ID.execute-api.ap-northeast-1.amazonaws.com/review" \
     -H "Origin: http://127.0.0.1:8000" \
     -H "Access-Control-Request-Method: POST" \
     -i
   ```
   - レスポンスヘッダーに`access-control-allow-origin`が含まれているか確認

4. **ブラウザのキャッシュをクリア**して再試行
   - ハードリロード: Cmd + Shift + R (Mac) / Ctrl + Shift + R (Windows)

5. **別のブラウザまたはシークレットモード**で試す

### API呼び出しが失敗する場合

**症状**: 「API保存エラー」がコンソールに表示される

**解決策**:
1. `js/aws-config.js`の`apiEndpoint`が正しいか確認（`/review`パスを含めること）
2. API GatewayのステージURLを確認
3. Lambda関数が正しくデプロイされているか確認
4. CloudWatch Logsで詳細なエラーを確認

### S3にデータが保存されない

**症状**: API呼び出しは成功するがS3にファイルが作成されない

**解決策**:
1. LambdaのIAMロールに`s3:GetObject`と`s3:PutObject`権限があるか確認
2. 環境変数`S3_BUCKET_NAME`が正しいバケット名に設定されているか確認
3. CloudWatch Logsでエラーメッセージを確認
4. Lambda関数のタイムアウトが十分か確認（30秒推奨）

### データが重複して保存される

**症状**: 同じレビューが複数回保存される

**解決策**:
1. Lambda関数のコードで`findIndex`による既存レビューの検索が正しく動作しているか確認
2. `review_id`が一意に生成されているか確認

### Lambda関数がタイムアウトする

**症状**: 502 Bad Gateway エラーが発生する

**解決策**:
1. Lambda関数の設定でタイムアウトを30秒に設定
2. S3バケットへのネットワークアクセスが正常か確認
3. Lambda関数のメモリを増やす（デフォルトの128MBから256MBへ）

---

## 8. セキュリティに関する注意事項

### 1. API Gatewayのアクセス制限

- 本番環境では`Access-Control-Allow-Origin`を`*`ではなく、特定のドメイン（`https://<username>.github.io`）に制限してください
- API Keyやカスタムオーソライザーの使用を検討してください
- レート制限（スロットリング）を設定して、過度なリクエストを防いでください

### 2. Lambda関数のセキュリティ

- 環境変数に機密情報を保存する場合は、AWS Secrets Managerの使用を検討してください
- Lambda関数のIAMロールは最小権限の原則に従ってください（`s3:GetObject`と`s3:PutObject`のみ）
- VPC内でLambdaを実行する場合は、適切なセキュリティグループを設定してください

### 3. S3バケットのセキュリティ

- S3バケットは必ずプライベートに設定してください（パブリックアクセスをすべてブロック）
- バケットポリシーでLambda実行ロールのみアクセスを許可してください
- S3サーバー側暗号化（SSE-S3またはSSE-KMS）を有効にすることを推奨します
- バージョニングを有効にして、誤削除や上書きからデータを保護してください

### 4. データ保護

- S3に保存されるデータには個人情報（レビューアー名など）が含まれる可能性があります
- 適切なデータ保護方針に従い、GDPRや個人情報保護法に準拠してください
- データの保存期間を定義し、ライフサイクルポリシーで古いデータを自動削除することを検討してください

### 5. 設定ファイルの管理

- `js/aws-config.js`を`.gitignore`に追加し、GitHubにコミットしないでください
- 代わりに`js/aws-config.example.js`をテンプレートとして提供してください
- デプロイ時にCI/CDパイプラインで設定ファイルを動的に生成することを推奨します

---

## 9. 費用について

### GitHub Pages
- 無料（パブリックリポジトリの場合）
- 帯域制限: 月100GB
- ビルド時間制限: 月10時間

### AWS Lambda
- 無料枠: 月100万リクエスト、40万GB秒のコンピューティング時間
- 超過後: ~$0.20/100万リクエスト、~$0.0000166667/GB秒
- **想定コスト**: 月1,000レビューの場合、ほぼ無料

### AWS API Gateway
- HTTP API: 無料枠なし
- コスト: ~$1.00/100万リクエスト
- **想定コスト**: 月1,000レビューの場合、$0.001（約0.15円）

### AWS S3
- 無料枠（12ヶ月間）: 5GBのストレージ、20,000 GETリクエスト、2,000 PUTリクエスト
- ストレージ: ~$0.025/GB/月
- リクエスト: GET ~$0.0004/1,000リクエスト、PUT ~$0.005/1,000リクエスト
- **想定コスト**: review.jsonが10MBの場合、月$0.01未満

### 合計想定コスト
- 小規模利用（月1,000レビュー）: **ほぼ無料〜月数円**
- 中規模利用（月10,000レビュー）: **月数十円**

---

## 10. 次のステップ

### 基本的な改善

- [ ] API GatewayにAPI Keyを追加して、アクセスを制限
- [ ] Lambda関数のテストケースを作成
- [ ] S3バケットのバージョニングとバックアップ設定
- [ ] CloudWatch Alarmsでエラー監視を設定

### 高度な機能追加

- [ ] DynamoDBを使用した高速な検索・集計機能
- [ ] Amazon Athenaでreview.jsonを分析
- [ ] QuickSightでダッシュボード作成
- [ ] CloudFrontを使用したコンテンツ配信の高速化

### 開発環境の改善

- [ ] CI/CDパイプラインの構築（GitHub Actions）
- [ ] ローカル開発環境でLambdaをテストする仕組み（SAM/Serverless Framework）
- [ ] Lambda関数のユニットテスト追加

### データ管理

- [ ] S3ライフサイクルポリシーで古いバックアップを自動削除
- [ ] review.jsonのサイズが大きくなった場合の分割戦略
- [ ] データエクスポート機能（CSV、Excel形式）

---

## 11. アーキテクチャの概要

```
┌─────────────────┐
│  GitHub Pages   │
│  (Frontend)     │
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│  API Gateway    │
│  (HTTP API)     │
└────────┬────────┘
         │
         ↓
┌─────────────────┐        ┌─────────────────┐
│  Lambda         │───────→│  S3 Bucket      │
│  SaveReviewToS3 │  R/W   │  review.json    │
└─────────────────┘        └─────────────────┘
         │
         ↓
┌─────────────────┐
│  CloudWatch     │
│  Logs           │
└─────────────────┘
```

**データフロー**:
1. ユーザーが問題に回答して提出
2. フロントエンド（JavaScript）がAPI Gatewayに POST リクエスト
3. API GatewayがLambda関数を呼び出し
4. Lambda関数がS3から`review.json`を取得
5. 新しいレビューデータを追加または既存データを更新
6. Lambda関数がS3に`review.json`を保存
7. 成功レスポンスをフロントエンドに返却

---

## 12. 参考リンク

- [GitHub Pages Documentation](https://docs.github.com/ja/pages)
- [AWS Lambda Documentation](https://docs.aws.amazon.com/lambda/)
- [AWS API Gateway HTTP API](https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api.html)
- [AWS S3 Documentation](https://docs.aws.amazon.com/s3/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [CloudWatch Logs](https://docs.aws.amazon.com/cloudwatch/)
