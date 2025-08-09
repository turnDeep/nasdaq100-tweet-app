from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
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
                logger.info(f"Broadcasted message to a connection: {message['type']}")
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
    
    # デモデータを作成（開発/テスト用）
    db = next(get_db())
    try:
        # 既存のコメント数を確認
        existing_count = db.query(Comment).count()
        logger.info(f"Found {existing_count} existing comments in database")
        
        # デモデータがない場合は作成
        if existing_count == 0:
            logger.info("Creating demo comments...")
            demo_comments = [
                {"content": "ナスダック強気！🚀", "emotion_icon": "🚀", "price": 17100.50},
                {"content": "この辺で買い増し検討中", "emotion_icon": "😊", "price": 17050.25},
                {"content": "利確しました。様子見", "emotion_icon": "😎", "price": 17150.75},
                {"content": "下落トレンドかも？", "emotion_icon": "😢", "price": 16950.00},
                {"content": "長期的には上昇すると思う", "emotion_icon": "🤔", "price": 17000.00},
            ]
            
            for i, demo in enumerate(demo_comments):
                comment = Comment(
                    timestamp=datetime.now(timezone.utc) - timedelta(minutes=i*10),
                    price=Decimal(str(demo["price"])),
                    content=demo["content"],
                    emotion_icon=demo["emotion_icon"]
                )
                db.add(comment)
            
            db.commit()
            logger.info(f"Created {len(demo_comments)} demo comments")
            
        # コメントを表示（デバッグ用）
        comments = db.query(Comment).order_by(Comment.timestamp.desc()).limit(5).all()
        for c in comments:
            logger.info(f"Comment {c.id}: timestamp={c.timestamp}, price={c.price}, content={c.content[:30]}")
            
    except Exception as e:
        logger.error(f"Error in startup: {e}")
        db.rollback()
    finally:
        db.close()
    
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
                    
                    # タイムスタンプの処理を改善
                    if "timestamp" in data and data["timestamp"]:
                        # クライアントから送られたタイムスタンプ（秒単位のUNIXタイム）
                        # timezone-awareなdatetimeに変換
                        timestamp = datetime.fromtimestamp(data["timestamp"], tz=timezone.utc)
                    else:
                        # 現在時刻をUTCで取得（timezone-aware）
                        timestamp = datetime.now(timezone.utc)
                    
                    if not content:
                        logger.warning("Empty comment content received")
                        await websocket.send_json({
                            "type": "error",
                            "message": "コメント内容が空です"
                        })
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
                    logger.info(f"Comment saved: ID={comment.id}, timestamp={comment.timestamp}, price={comment.price}, content={comment.content[:50]}...")
                    
                    # 全クライアントにブロードキャスト
                    broadcast_data = {
                        "type": "new_comment",
                        "data": {
                            "id": comment.id,
                            "timestamp": comment.timestamp.isoformat() if comment.timestamp else datetime.now(timezone.utc).isoformat(),
                            "price": float(comment.price),
                            "content": comment.content,
                            "emotion_icon": comment.emotion_icon
                        }
                    }
                    await manager.broadcast(broadcast_data)
                    logger.info(f"Comment broadcasted: ID={broadcast_data['data']['id']}")
                    
                    # 送信者に確認メッセージを送信
                    await websocket.send_json({
                        "type": "comment_saved",
                        "data": broadcast_data["data"]
                    })
                    
                except Exception as e:
                    logger.error(f"Error saving comment: {e}", exc_info=True)
                    if db:
                        db.rollback()
                    await websocket.send_json({
                        "type": "error",
                        "message": f"コメントの保存に失敗しました: {str(e)}"
                    })
                finally:
                    if db:
                        db.close()
                        db = None
                
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
        manager.disconnect(websocket)
    except Exception as e:
        logger.error(f"WebSocket error: {e}", exc_info=True)
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
    """コメントを取得（フィルタリングを緩和）"""
    try:
        # すべてのコメントを取得（フィルタリングなし）
        comments = db.query(Comment).order_by(Comment.timestamp.desc()).all()
        
        logger.info(f"Found {len(comments)} total comments in database")
        
        # デバッグ用：最初の5件のコメントを詳細ログ
        for i, c in enumerate(comments[:5]):
            logger.info(f"Comment {i}: id={c.id}, timestamp={c.timestamp}, price={c.price}, content={c.content[:30]}")
        
        result = {
            "comments": [
                {
                    "id": c.id,
                    "timestamp": c.timestamp.isoformat() if c.timestamp else datetime.now(timezone.utc).isoformat(),
                    "price": float(c.price),
                    "content": c.content,
                    "emotion_icon": c.emotion_icon
                }
                for c in comments
            ]
        }
        
        logger.info(f"Returning {len(result['comments'])} comments")
        return result
        
    except Exception as e:
        logger.error(f"Error getting comments: {e}", exc_info=True)
        return {"comments": []}

@app.get("/api/sentiment")
async def get_sentiment(interval: str = None, db: Session = Depends(get_db)):
    """センチメント分析結果を取得"""
    try:
        # すべてのコメントを対象にセンチメント分析
        analysis = sentiment_analyzer.analyze_all_comments(db)
        return analysis
    except Exception as e:
        logger.error(f"Error getting sentiment: {e}")
        return {"buy_percentage": 50, "sell_percentage": 50, "total_comments": 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)