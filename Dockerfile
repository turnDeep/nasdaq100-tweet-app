FROM python:3.11-slim

WORKDIR /app

# バックエンドの依存関係のインストール
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# バックエンドのソースコードをコピー
COPY backend/ .

# ポート環境変数の設定（Railwayが自動設定）
ENV PORT=8000

# ポートを公開
EXPOSE $PORT

# アプリケーションの起動
# シェルを使わずに直接起動
ENTRYPOINT ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]