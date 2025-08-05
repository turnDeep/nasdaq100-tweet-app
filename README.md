# ナスダック100 つぶやきチャート

ナスダック100指数のリアルタイムチャート上に、コメントや感情アイコンを投稿・表示できるソーシャルトレーディングアプリケーションです。

## 🌟 主な機能

- **リアルタイムチャート**: ナスダック100指数のキャンドルスティックチャートをリアルタイム表示
- **コメント投稿**: チャート上の任意の価格にコメントと感情アイコンを投稿
- **時間枠切り替え**: 1分足から週足まで7つの時間枠に対応
- **センチメント分析**: ユーザーの投稿からBUY/SELLのセンチメントを自動分析
- **WebSocket通信**: リアルタイムでコメントを共有
- **レスポンシブデザイン**: モバイル・デスクトップ両対応

## 🛠 技術スタック

### バックエンド
- **FastAPI**: 高速なPython製Webフレームワーク
- **PostgreSQL**: リレーショナルデータベース
- **SQLAlchemy**: ORM
- **yfinance**: Yahoo Finance APIクライアント
- **WebSocket**: リアルタイム通信

### フロントエンド
- **React**: UIライブラリ
- **Lightweight Charts**: TradingView製チャートライブラリ
- **WebSocket**: リアルタイム通信
- **CSS**: スタイリング（CSS Modules不使用）

### インフラ
- **Docker & Docker Compose**: コンテナ化
- **Railway**: デプロイメントプラットフォーム

## 📦 セットアップ

### 前提条件
- Docker & Docker Compose
- Node.js 18以上（ローカル開発時）
- Python 3.11以上（ローカル開発時）

### クイックスタート

1. リポジトリをクローン
```bash
git clone https://github.com/yourusername/nasdaq100-tweet-app.git
cd nasdaq100-tweet-app
```

2. Docker Composeで起動
```bash
docker-compose up --build
```

3. ブラウザでアクセス
- フロントエンド: http://localhost:3000
- バックエンドAPI: http://localhost:8000
- API ドキュメント: http://localhost:8000/docs

### ローカル開発

#### バックエンド
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload
```

#### フロントエンド
```bash
cd frontend
npm install
npm start
```

## 📁 プロジェクト構成

```
nasdaq100-tweet-app/
├── backend/
│   ├── database.py          # データベース接続設定
│   ├── main.py             # FastAPIアプリケーション
│   ├── models.py           # SQLAlchemyモデル
│   ├── requirements.txt    # Python依存関係
│   ├── services/
│   │   ├── __init__.py
│   │   ├── market_data.py  # マーケットデータ取得
│   │   └── sentiment.py    # センチメント分析
│   └── Dockerfile
├── frontend/
│   ├── public/
│   │   └── index.html
│   ├── src/
│   │   ├── App.js
│   │   ├── index.js
│   │   ├── components/
│   │   │   ├── Chart.js              # チャートコンポーネント
│   │   │   ├── CommentBubble.js      # コメントバブル
│   │   │   ├── PositionIndicator.js  # ポジションインジケーター
│   │   │   ├── PostModal.js          # 投稿モーダル
│   │   │   └── TimeFrameSelector.js  # 時間枠セレクター
│   │   ├── services/
│   │   │   └── websocket.js          # WebSocketサービス
│   │   └── styles/
│   │       └── App.css               # グローバルスタイル
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
├── railway.json            # Railway設定
└── README.md
```

## 🔧 環境変数

### バックエンド (.env)
```env
DATABASE_URL=postgresql://user:password@db:5432/nasdaq100_app
PORT=8000
```

### フロントエンド
```env
REACT_APP_API_URL=http://localhost:8000
```

## 🚀 Railwayへのデプロイ

1. [Railway](https://railway.app)にサインアップ
2. 新しいプロジェクトを作成
3. GitHubリポジトリを接続
4. 環境変数を設定：
   - `DATABASE_URL`: PostgreSQLのURL（自動生成）
   - `PORT`: 8000
5. デプロイを実行

## 💻 API エンドポイント

### REST API
- `GET /api/health` - ヘルスチェック
- `GET /api/market/{symbol}/{interval}` - マーケットデータ取得
- `GET /api/comments?hours=24` - コメント一覧取得
- `GET /api/sentiment` - センチメント分析結果

### WebSocket
- `WS /ws` - リアルタイム通信
  - `post_comment` - コメント投稿
  - `new_comment` - 新規コメント通知
  - `market_update` - マーケット更新

## 🎨 使い方

1. **チャート表示**: ページを開くと自動的にナスダック100のチャートが表示されます
2. **時間枠変更**: ヘッダーの時間枠ボタンをクリックして切り替え
3. **コメント投稿**: 
   - 「NEW POST」ボタンをクリック
   - コメントと感情アイコンを選択
   - 投稿ボタンをクリック
4. **センチメント確認**: ヘッダー右側の「みんなのポジション」で確認

## 🧪 開発者向け情報

### コード規約
- バックエンド: PEP 8準拠
- フロントエンド: ESLint推奨設定

### テスト実行
```bash
# バックエンド
cd backend
pytest

# フロントエンド
cd frontend
npm test
```

### ビルド
```bash
# フロントエンド本番ビルド
cd frontend
npm run build
```

## 📝 ライセンス

MIT License

## 🤝 コントリビューション

プルリクエストを歓迎します！大きな変更の場合は、まずissueを作成して変更内容を議論してください。

## 📞 サポート

問題が発生した場合は、[Issues](https://github.com/yourusername/nasdaq100-tweet-app/issues)ページで報告してください。