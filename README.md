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
- **CSS**: スタイリング

### インフラ
- **Docker & Docker Compose**: コンテナ化
- **Railway / VPS**: デプロイメントプラットフォーム

---

## 🚀 デプロイ方法

### 🔧 ローカル開発環境

#### 前提条件
- Docker & Docker Compose
- Node.js 18以上
- Python 3.11以上（オプション）

#### セットアップ手順

1. **リポジトリをクローン**
```bash
git clone https://github.com/yourusername/nasdaq100-tweet-app.git
cd nasdaq100-tweet-app
```

2. **環境変数の設定**
```bash
# backend/.env を作成（既に存在する場合はスキップ）
cat > backend/.env << EOF
DATABASE_URL=postgresql://user:password@localhost:5432/nasdaq100_app
PORT=8000
EOF
```

3. **バックエンド＋データベースの起動**
```bash
# Docker Composeでバックエンドとデータベースを起動
docker-compose up -d
```

4. **フロントエンドの起動**
```bash
# 別ターミナルで実行
cd frontend
npm install  # 初回のみ
npm start    # http://localhost:3000 で起動
```

#### 動作確認
- フロントエンド: http://localhost:3000
- バックエンドAPI: http://localhost:8000
- API ドキュメント: http://localhost:8000/docs

#### 開発時のコマンド

```bash
# ログの確認
docker-compose logs -f backend

# データベースのリセット
docker-compose down -v
docker-compose up -d

# バックエンドの再起動
docker-compose restart backend
```

---

### 🖥️ Xserver VPS デプロイ

#### 前提条件
- Xserver VPSインスタンス（Ubuntu 22.04推奨）
- ドメイン（オプション）
- SSH接続設定済み

#### デプロイ手順

1. **VPSの初期設定**
```bash
# VPSにSSH接続
ssh user@your-vps-ip

# 必要なパッケージのインストール
sudo apt update
sudo apt install -y docker.io docker-compose git nginx certbot python3-certbot-nginx

# Dockerの権限設定
sudo usermod -aG docker $USER
newgrp docker
```

2. **アプリケーションのデプロイ**
```bash
# リポジトリをクローン
git clone https://github.com/yourusername/nasdaq100-tweet-app.git
cd nasdaq100-tweet-app

# 環境変数の設定
cp backend/.env.example backend/.env
nano backend/.env  # DATABASE_URLなどを本番用に編集

# 本番用docker-compose.ymlを作成
cat > docker-compose.prod.yml << 'EOF'
version: '3.8'

services:
  db:
    image: postgres:15
    environment:
      POSTGRES_USER: produser
      POSTGRES_PASSWORD: strongpassword
      POSTGRES_DB: nasdaq100_prod
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: always

  backend:
    build: 
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: postgresql://produser:strongpassword@db:5432/nasdaq100_prod
    depends_on:
      - db
    restart: always

  frontend:
    build: 
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    environment:
      REACT_APP_API_URL: http://your-domain.com:8000
    depends_on:
      - backend
    restart: always

volumes:
  postgres_data:
EOF

# アプリケーションの起動
docker-compose -f docker-compose.prod.yml up -d --build
```

3. **Nginxリバースプロキシの設定**
```bash
# Nginx設定ファイルを作成
sudo nano /etc/nginx/sites-available/nasdaq100

# 以下の内容を記入
server {
    listen 80;
    server_name your-domain.com;

    # フロントエンド
    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # バックエンドAPI
    location /api {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # WebSocket
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}

# 設定を有効化
sudo ln -s /etc/nginx/sites-available/nasdaq100 /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

4. **SSL証明書の設定（オプション）**
```bash
sudo certbot --nginx -d your-domain.com
```

5. **自動起動の設定**
```bash
# systemdサービスファイルを作成
sudo nano /etc/systemd/system/nasdaq100.service

[Unit]
Description=NASDAQ100 Tweet App
After=docker.service
Requires=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/user/nasdaq100-tweet-app
ExecStart=/usr/bin/docker-compose -f docker-compose.prod.yml up -d
ExecStop=/usr/bin/docker-compose -f docker-compose.prod.yml down
User=user

[Install]
WantedBy=multi-user.target

# サービスを有効化
sudo systemctl enable nasdaq100
sudo systemctl start nasdaq100
```

#### メンテナンスコマンド

```bash
# アプリケーションの更新
cd nasdaq100-tweet-app
git pull
docker-compose -f docker-compose.prod.yml up -d --build

# ログの確認
docker-compose -f docker-compose.prod.yml logs -f

# バックアップ
docker exec nasdaq100-tweet-app_db_1 pg_dump -U produser nasdaq100_prod > backup.sql

# リストア
docker exec -i nasdaq100-tweet-app_db_1 psql -U produser nasdaq100_prod < backup.sql
```

---

## 📁 プロジェクト構成

```
nasdaq100-tweet-app/
├── Dockerfile              # バックエンド本番用
├── docker-compose.yml      # ローカル開発用
├── docker-compose.prod.yml # VPS本番用（作成する）
├── railway.json           # Railway設定
├── backend/
│   ├── Dockerfile         # ローカル開発用
│   ├── database.py        # DB接続設定
│   ├── main.py           # FastAPIアプリ
│   ├── models.py         # SQLAlchemyモデル
│   ├── requirements.txt   # Python依存関係
│   └── services/
│       ├── market_data.py # マーケットデータ
│       └── sentiment.py   # センチメント分析
└── frontend/
    ├── Dockerfile         # 本番用
    ├── package.json
    ├── public/
    ├── src/
    │   ├── App.js
    │   ├── components/
    │   ├── services/
    │   └── styles/
    └── build/            # ビルド成果物

```

---

## 🔧 環境変数

### バックエンド
```env
DATABASE_URL=postgresql://user:password@db:5432/nasdaq100_app
PORT=8000
```

### フロントエンド
```env
REACT_APP_API_URL=http://localhost:8000  # 本番では適切なURLに変更
```

---

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

---

## 🎨 使い方

1. **チャート表示**: ページを開くと自動的にナスダック100のチャートが表示
2. **時間枠変更**: ヘッダーの時間枠ボタンをクリックして切り替え
3. **コメント投稿**: 
   - 「NEW POST」ボタンをクリック
   - コメントと感情アイコンを選択
   - 投稿ボタンをクリック
4. **センチメント確認**: ヘッダー右側の「みんなのポジション」で確認

---

## 🧪 テスト

```bash
# バックエンドテスト
cd backend
pytest

# フロントエンドテスト
cd frontend
npm test
```

---

## 🐛 トラブルシューティング

### ローカル開発
- `docker-compose logs -f` でログを確認
- ポート競合時は他のサービスを停止
- `docker-compose down -v` でクリーンスタート

### Railway
- Logsタブでデプロイログを確認
- 環境変数が正しく設定されているか確認
- Generate Domainを忘れずに実行

### VPS
- `systemctl status nasdaq100` でサービス状態確認
- ファイアウォールでポートが開いているか確認
- Nginxログ: `/var/log/nginx/error.log`

---

## 📝 ライセンス

MIT License

---

## 🤝 コントリビューション

プルリクエストを歓迎します！大きな変更の場合は、まずissueを作成して変更内容を議論してください。

---

## 📞 サポート

問題が発生した場合は、[Issues](https://github.com/yourusername/nasdaq100-tweet-app/issues)ページで報告してください。
