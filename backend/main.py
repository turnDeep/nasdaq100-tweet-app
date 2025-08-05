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
import logging

from database import get_db, init_db
from models import Comment
from services.market_data import MarketDataService
from services.sentiment import SentimentAnalyzer

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

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
        logger.info(f"WebSocket connected. Total connections: {len(self.active_connections)}")

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)
        logger.info(f"WebSocket disconnected. Total connections: {len(self.active_connections)}")

    async def broadcast(self, message: dict):
        disconnected = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")
                disconnected.append(connection)
        
        # 切断されたコネクションを削除
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

manager = ConnectionManager()
market_service = MarketDataService()
sentiment_analyzer = SentimentAnalyzer()

@app.on_event("startup")
async def startup_event():
    init_db()
    logger.info("Database initialized")
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
            logger.info(f"Market data updated: {data['price']}")
        except Exception as e:
            logger.error(f"Market data update error: {e}")
        
        # 5分ごとに更新（レート制限対策）
        await asyncio.sleep(300)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_json()
            
            if data["type"] == "post_comment":
                # コメントをDBに保存
                db = next(get_db())
                try:
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
                    logger.info(f"New comment posted: {comment.content[:50]}...")
                except Exception as e:
                    logger.error(f"Error saving comment: {e}")
                    db.rollback()
                finally:
                    db.close()
                
    except WebSocketDisconnect:
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
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
        logger.error(f"Error getting market data: {e}")
        # エラーでも空のデータを返す
        return {"success": True, "data": []}

@app.get("/api/comments")
async def get_comments(hours: int = 24):
    """指定時間内のコメントを取得"""
    db = next(get_db())
    try:
        since = datetime.utcnow() - timedelta(hours=hours)
        comments = db.query(Comment).filter(Comment.timestamp >= since).order_by(Comment.timestamp.desc()).all()
        
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
    except Exception as e:
        logger.error(f"Error getting comments: {e}")
        return {"comments": []}
    finally:
        db.close()

@app.get("/api/sentiment")
async def get_sentiment():
    """センチメント分析結果を取得"""
    db = next(get_db())
    try:
        analysis = sentiment_analyzer.analyze_recent_comments(db)
        return analysis
    except Exception as e:
        logger.error(f"Error getting sentiment: {e}")
        return {"buy_percentage": 50, "sell_percentage": 50, "total_comments": 0}
    finally:
        db.close()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
