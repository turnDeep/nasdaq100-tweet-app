from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
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
from decimal import Decimal

from database import get_db, init_db
from models import Comment
from services.market_data import MarketDataService
from services.sentiment import SentimentAnalyzer

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

# CORS設定 - より明示的に設定
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "*"],
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["*"],
    expose_headers=["*"],
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
        if websocket in self.active_connections:
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
    logger.info(f"Backend running on port {os.getenv('PORT', 8000)}")
    logger.info("CORS enabled for all origins")
    # マーケットデータの定期更新を開始
    asyncio.create_task(market_data_updater())

async def market_data_updater():
    """マーケットデータを定期的に更新"""
    await asyncio.sleep(10)  # 初回は10秒待つ
    
    while True:
        try:
            data = market_service.get_latest_data()
            await manager.broadcast({
                "type": "market_update",
                "data": data
            })
            logger.info(f"Market data broadcasted: {data['price']}")
        except Exception as e:
            logger.error(f"Market data update error: {e}")
        
        # 5分ごとに更新
        await asyncio.sleep(300)

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    db: Session = None
    
    try:
        while True:
            data = await websocket.receive_json()
            logger.info(f"Received WebSocket message: {data}")
            
            if data["type"] == "post_comment":
                # 新しいDBセッションを作成
                db = next(get_db())
                try:
                    # データ検証
                    price = float(data.get("price", 0))
                    content = str(data.get("content", "")).strip()
                    emotion_icon = data.get("emotion_icon")
                    
                    # タイムスタンプの処理
                    # クライアントから送られてきた場合はそれを使用、なければ現在時刻-15分
                    if "timestamp" in data:
                        # クライアントから送られたタイムスタンプ（秒単位のUNIXタイム）
                        timestamp = datetime.fromtimestamp(data["timestamp"])
                    else:
                        # 15分遅延を考慮（Yahoo Financeのディレイに合わせる）
                        timestamp = datetime.utcnow() - timedelta(minutes=15)
                    
                    if not content:
                        logger.warning("Empty comment content received")
                        continue
                    
                    # コメントをDBに保存
                    comment = Comment(
                        timestamp=timestamp,
                        price=Decimal(str(price)),
                        content=content,
                        emotion_icon=emotion_icon
                    )
                    db.add(comment)
                    db.commit()
                    db.refresh(comment)
                    
                    # 保存成功をログ
                    logger.info(f"Comment saved: ID={comment.id}, timestamp={comment.timestamp}, content={comment.content[:50]}...")
                    
                    # 全クライアントにブロードキャスト
                    broadcast_data = {
                        "type": "new_comment",
                        "data": {
                            "id": comment.id,
                            "timestamp": comment.timestamp.isoformat(),
                            "price": float(comment.price),
                            "content": comment.content,
                            "emotion_icon": comment.emotion_icon
                        }
                    }
                    await manager.broadcast(broadcast_data)
                    logger.info(f"Comment broadcasted: {broadcast_data}")
                    
                except Exception as e:
                    logger.error(f"Error saving comment: {e}")
                    if db:
                        db.rollback()
                finally:
                    if db:
                        db.close()
                        db = None
                
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        manager.disconnect(websocket)
    finally:
        if db:
            db.close()

@app.get("/api/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "healthy", "service": "nasdaq100-tweet-app"}

@app.get("/api/market/{symbol}/{interval}")
async def get_market_data(symbol: str, interval: str):
    """マーケットデータを取得"""
    try:
        logger.info(f"Fetching market data for {symbol} with interval {interval}")
        data = market_service.get_historical_data(symbol, interval)
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error getting market data: {e}")
        # エラーでも空のデータを返す
        return {"success": True, "data": []}

@app.get("/api/comments")
async def get_comments(hours: int = 24, interval: str = None, db: Session = Depends(get_db)):
    """指定時間内のコメントを取得（時間足に応じてフィルタリング）"""
    try:
        # 時間足ごとの集計期間を定義（分単位）
        interval_hours = {
            "1m": 0.5,    # 30分
            "3m": 1,      # 1時間
            "5m": 2,      # 2時間
            "15m": 4,     # 4時間
            "1H": 12,     # 12時間
            "4H": 24,     # 24時間
            "1D": 168,    # 1週間
            "1W": 720     # 30日
        }
        
        # intervalが指定されている場合は、それに応じた期間を使用
        if interval and interval in interval_hours:
            hours = interval_hours[interval]
        
        since = datetime.utcnow() - timedelta(hours=hours)
        comments = db.query(Comment).filter(
            Comment.timestamp >= since
        ).order_by(Comment.timestamp.desc()).all()
        
        logger.info(f"Found {len(comments)} comments in the last {hours} hours for interval {interval}")
        
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

@app.get("/api/sentiment")
async def get_sentiment(interval: str = None, db: Session = Depends(get_db)):
    """センチメント分析結果を取得（時間足に応じた期間）"""
    try:
        # 時間足ごとの集計期間を定義（時間単位）
        interval_hours = {
            "1m": 0.5,    # 30分
            "3m": 1,      # 1時間
            "5m": 2,      # 2時間
            "15m": 4,     # 4時間
            "1H": 12,     # 12時間
            "4H": 24,     # 24時間
            "1D": 168,    # 1週間
            "1W": 720     # 30日
        }
        
        hours = interval_hours.get(interval, 1)
        analysis = sentiment_analyzer.analyze_recent_comments(db, hours)
        return analysis
    except Exception as e:
        logger.error(f"Error getting sentiment: {e}")
        return {"buy_percentage": 50, "sell_percentage": 50, "total_comments": 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)