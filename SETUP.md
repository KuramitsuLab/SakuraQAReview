# セットアップガイド

レビューアプリケーションのセットアップ手順を説明します。

## 前提条件

- モダンなWebブラウザ（Chrome, Firefox, Safari, Edge）
- ローカル実行の場合: Python 3またはNode.js

## セットアップ方法

### 方法1: ローカルで実行（推奨）

#### Step 1: リポジトリの取得

```bash
# リポジトリをクローン
git clone https://github.com/obarayui/qareview_notimg.git
cd qareview_notimg
```

#### Step 2: HTTPサーバーの起動

**Python 3を使用:**
```bash
python3 -m http.server 8000
```

**Node.jsを使用:**
```bash
# http-serverがインストールされていない場合
npm install -g http-server

# サーバー起動
http-server -p 8000
```

**VSCodeのLive Serverを使用:**
1. VSCodeで`qareview_notimg`フォルダを開く
2. `index.html`を右クリック
3. "Open with Live Server"を選択

#### Step 3: ブラウザでアクセス

```
http://localhost:8000
```

### 方法2: GitHub Pagesで公開

#### Step 1: GitHubにプッシュ

```bash
git add .
git commit -m "Setup food quiz app"
git push origin main
```

#### Step 2: GitHub Pagesを有効化

1. GitHubリポジトリのページにアクセス
2. **Settings** → **Pages** に移動
3. **Source**で`main`ブランチを選択
4. **Folder**で`/ (root)`を選択
5. **Save**をクリック

#### Step 3: 公開URLにアクセス

数分後、以下のようなURLで公開されます:
```
https://obarayui.github.io/qareview_notimg/
```

## ファイル構造の確認

セットアップが正しく完了しているか確認:

```
qareview_notimg/
├── index.html              ✓ ホーム画面
├── review.html             ✓ レビュー画面
├── css/
│   └── style.css          ✓ スタイルシート
├── js/
│   ├── app.js             ✓ メインロジック
│   ├── github.js          ✓ データ取得
│   └── storage.js         ✓ データ保存
├── quiz/
│   └── questions.json     ✓ 問題データ
└── README.md              ✓ 使用方法
```

## 動作確認

### 1. ホーム画面

- ブラウザでアクセス
- 「SakuraQA レビューツール」のタイトルが表示される
- レビューアー名入力欄が表示される
- 問題セットカードが表示される

### 2. レビュー画面

1. レビューアー名を入力
2. 問題セットをクリック
3. 問題が表示されることを確認
4. 選択肢をクリックできることを確認
5. 「回答を提出」ボタンが有効化されることを確認

### 3. データ保存

1. 問題に回答して提出
2. ブラウザのコンソール（F12）を開く
3. 以下を実行して結果が保存されているか確認:
   ```javascript
   StorageManager.getAllResults()
   ```

## トラブルシューティング

### 問題: "Failed to fetch"エラー

**原因**: file://プロトコルでアクセスしている

**解決策**:
- HTTPサーバーを起動してアクセス
- `file:///path/to/index.html`ではなく`http://localhost:8000`を使用

### 問題: 問題データが表示されない

**原因**: `quiz/questions.json`が存在しない、または形式が不正

**確認**:
```bash
ls -la quiz/questions.json
cat quiz/questions.json | head -n 20
```

**解決策**:
- questions.jsonファイルが存在することを確認
- JSONの形式が正しいことを確認（配列形式）
- ブラウザのコンソールでエラーメッセージを確認

### 問題: スタイルが適用されない

**原因**: CSSファイルのパスが間違っている

**確認**:
- ブラウザの開発者ツールで Network タブを開く
- 404エラーになっているファイルがないか確認

**解決策**:
- `css/style.css`が存在することを確認
- HTMLファイルでのパス指定が正しいことを確認

### 問題: localStorageにデータが保存されない

**原因**: ブラウザのlocalStorageが無効化されている

**解決策**:
- ブラウザの設定でCookieとサイトデータを有効化
- シークレットモード/プライベートブラウジングを解除
- ブラウザのデータをクリアしていないか確認

## カスタマイズ

### 問題セットの変更

1. CSVファイルから問題を作成:
   ```bash
   python3 convert_csv_to_json.py
   ```

2. 生成された`questions.json`を`quiz/`フォルダに配置

3. ブラウザをリロードして動作確認

### スタイルのカスタマイズ

`css/style.css`の`:root`セクションで色を変更:

```css
:root {
    --primary-color: #ff6b35;      /* メインカラー */
    --secondary-color: #f7931e;    /* サブカラー */
    --success-color: #4caf50;      /* 正解の色 */
    --error-color: #f44336;        /* 不正解の色 */
}
```

## よくある質問

**Q: オフラインで動作しますか？**

A: はい。一度ページを読み込めば、インターネット接続なしで動作します（ローカル実行の場合）。

**Q: スマートフォンでも使えますか？**

A: はい。レスポンシブデザインなので、スマートフォンやタブレットでも快適に使用できます。

**Q: データはどこに保存されますか？**

A: ブラウザのlocalStorageに保存されます。サーバーには送信されません。

**Q: 複数人でレビュー結果を共有できますか？**

A: エクスポート機能でJSON/CSV形式でダウンロードして共有できます。

**Q: 問題を追加できますか？**

A: はい。`questions.json`形式で問題を作成し、`quiz/`フォルダに配置してください。

## サポート

問題が発生した場合は、以下をご確認ください:

1. ブラウザのコンソール（F12）でエラーメッセージを確認
2. README.mdのトラブルシューティングセクションを参照
3. GitHubのIssuesで質問・報告

## 次のステップ

- [README.md](README.md) - 使用方法を確認
- [Claude_food_review.md](Claude_food_review.md) - 詳細な仕様を確認
- レビューを開始しよう！
