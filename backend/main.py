from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import json
import asyncio
from typing import List, Dict
import os
from dotenv import load_dotenv

from database import get_db, init_db
from models import Comment
from services.market_data import MarketDataService
from services.sentiment import SentimentAnalyzer

load_dotenv()

app = FastAPI()

# CORS設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# WebSocket接続管理
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except:
                pass

manager = ConnectionManager()
market_service = MarketDataService()
sentiment_analyzer = SentimentAnalyzer()

@app.on_event("startup")
async def startup_event():
    init_db()
    # マーケットデータの定期更新を開始
    asyncio.create_task(market_data_updater())

async def market_data_updater():
    """マーケットデータを定期的に更新"""
    while True:
        try:
            data = market_service.get_latest_data()
            await manager.broadcast({
                "type": "market_update",
                "data": data
            })
        except Exception as e:
            print(f"Market data update error: {e}")
        await asyncio.sleep(60)  # 1分ごとに更新

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "post_comment":
                # コメントをDBに保存
                db = next(get_db())
                comment = Comment(
                    timestamp=datetime.utcnow(),
                    price=data["price"],
                    content=data["content"],
                    emotion_icon=data.get("emotion_icon")
                )
                db.add(comment)
                db.commit()
                db.refresh(comment)
                
                # 全クライアントにブロードキャスト
                await manager.broadcast({
                    "type": "new_comment",
                    "data": {
                        "id": comment.id,
                        "timestamp": comment.timestamp.isoformat(),
                        "price": float(comment.price),
                        "content": comment.content,
                        "emotion_icon": comment.emotion_icon
                    }
                })
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)

@app.get("/api/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy", "service": "nasdaq100-tweet-app"}

@app.get("/api/market/{symbol}/{interval}")
async def get_market_data(symbol: str, interval: str):
    """マーケットデータを取得"""
    try:
        data = market_service.get_historical_data(symbol, interval)
        return {"success": True, "data": data}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/comments")
async def get_comments(hours: int = 24):
    """指定時間内のコメントを取得"""
    db = next(get_db())
    since = datetime.utcnow() - timedelta(hours=hours)
    comments = db.query(Comment).filter(Comment.timestamp >= since).all()
    
    return {
        "comments": [
            {
                "id": c.id,
                "timestamp": c.timestamp.isoformat(),
                "price": float(c.price),
                "content": c.content,
                "emotion_icon": c.emotion_icon
            }
            for c in comments
        ]
    }

@app.get("/api/sentiment")
async def get_sentiment():
    """センチメント分析結果を取得"""
    db = next(get_db())
    analysis = sentiment_analyzer.analyze_recent_comments(db)
    return analysis

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)