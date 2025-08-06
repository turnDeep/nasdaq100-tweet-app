# ベースイメージとして軽量なpython:3.11-slimを使用
FROM python:3.11-slim

# 作業ディレクトリを設定
WORKDIR /app

# 依存関係のファイルを先にコピーし、キャッシュを有効活用
COPY requirements.txt .
# 依存関係をインストール
RUN pip install --no-cache-dir -r requirements.txt

# アプリケーションのソースコードをコピー
COPY . .

# Railwayが$PORT環境変数でポートを割り当てる
# EXPOSE命令は主にドキュメンテーションとしての役割
EXPOSE 8000

# アプリケーションを起動
# 1. 本番環境のため --reload オプションを削除
# 2. Railwayが指定するポートで待ち受けるため --port $PORT を使用
# 3. 環境変数($PORT)を展開させるため、Shell形式でコマンドを記述
CMD uvicorn main:app --host 0.0.0.0 --port $PORT
