FROM python:3.11-slim

WORKDIR /app

# バックエンドの依存関係のインストール
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# バックエンドのソースコードをコピー
COPY backend/ .

# データベースのマイグレーション用スクリプト（オプション）
RUN python -c "from database import init_db; init_db()" || true

# ポート8000を公開
EXPOSE 8000

# 環境変数PORTを使用（Railwayが自動設定）
ENV PORT=8000

# アプリケーションの起動（$PORTを使用）
CMD uvicorn main:app --host 0.0.0.0 --port $PORT