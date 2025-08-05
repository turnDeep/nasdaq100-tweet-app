FROM node:18-alpine

WORKDIR /app

# 依存関係のインストール
COPY package.json package-lock.json* ./
RUN npm install

# アプリケーションのコピー
COPY . .

# ポート3000を公開
EXPOSE 3000

# 開発サーバーの起動
CMD ["npm", "start"]