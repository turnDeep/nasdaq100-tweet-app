# ビルドステージ
FROM node:18-alpine AS builder

WORKDIR /app

# 依存関係のインストール（キャッシュ効率化）
COPY package*.json ./
RUN npm ci --only=production

# ソースコードのコピー
COPY . .

# ビルド時に環境変数を受け取る
ARG REACT_APP_API_URL
ENV REACT_APP_API_URL=${REACT_APP_API_URL}

# 本番ビルド実行
RUN npm run build

# 実行ステージ（軽量イメージ）
FROM node:18-alpine

WORKDIR /app

# serveをインストール（静的ファイルサーバー）
RUN npm install -g serve

# ビルド成果物のみコピー
COPY --from=builder /app/build ./build

# Railwayが自動設定するPORT環境変数を使用
EXPOSE ${PORT:-3000}

# 静的ファイルをサーブ
CMD serve -s build -l ${PORT:-3000}