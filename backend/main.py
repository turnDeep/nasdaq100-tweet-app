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
import time

# Mock database for testing environment where Postgres is not available
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# ロギング設定
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()

app = FastAPI()

# Database Setup (Adaptive for Test Environment)
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")
if "sqlite" in DATABASE_URL:
     engine = create_engine(
        DATABASE_URL,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool
    )
else:
     # Original Postgres setup
    from sqlalchemy.pool import QueuePool
    engine = create_engine(
        DATABASE_URL,
        poolclass=QueuePool,
        pool_size=5,
        max_overflow=10,
        pool_recycle=3600,
        pool_pre_ping=True,
        echo=False
    )

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
from database import Base
from models import Comment

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    Base.metadata.create_all(bind=engine)

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
                # 頻繁なログ出力を避けるためデバッグレベルへ
                # logger.debug(f"Broadcasted message to a connection: {message['type']}")
            except Exception as e:
                logger.error(f"Error broadcasting to connection: {e}")
                disconnected.append(connection)
        
        # 切断されたコネクションを削除
        for conn in disconnected:
            if conn in self.active_connections:
                self.active_connections.remove(conn)

manager = ConnectionManager()
from services.market_data import MarketDataService, RealtimeMarketService
market_service = MarketDataService()
# リアルタイムサービスを初期化（ブロードキャスト関数を渡す）
realtime_service = RealtimeMarketService(broadcast_func=manager.broadcast)
from services.sentiment import SentimentAnalyzer
sentiment_analyzer = SentimentAnalyzer()

@app.on_event("startup")
async def startup_event():
    try:
        init_db()
        logger.info("Database initialized")
    except Exception as e:
        logger.error(f"Database initialization failed (likely connection issue): {e}")
        # Continue without DB for testing WebSocket

    logger.info(f"Backend running on port {os.getenv('PORT', 8000)}")
    logger.info("CORS enabled for all origins")
    
    # デモデータを作成（開発/テスト用）
    try:
        db = SessionLocal()
        try:
            # 既存のコメント数を確認
            existing_count = db.query(Comment).count()
            logger.info(f"Found {existing_count} existing comments in database")
            
            # デモデータがない場合は作成
            if existing_count == 0:
                logger.info("Creating demo comments...")
                # 現在時刻から遡って配置（秒単位で考える）
                now = datetime.now(timezone.utc)
                current_unix = int(time.time())
                
                demo_comments = [
                    {
                        "content": "ナスダック強気！🚀",
                        "emotion_icon": "🚀",
                        "price": 23700.50,  # 現在の価格帯に合わせる
                        "seconds_ago": 300  # 5分前
                    },
                    {
                        "content": "この辺で買い増し検討中",
                        "emotion_icon": "😊",
                        "price": 23650.25,
                        "seconds_ago": 900  # 15分前
                    },
                    {
                        "content": "利確しました。様子見",
                        "emotion_icon": "😎",
                        "price": 23750.75,
                        "seconds_ago": 1800  # 30分前
                    },
                    {
                        "content": "下落トレンドかも？",
                        "emotion_icon": "😢",
                        "price": 23550.00,
                        "seconds_ago": 2700  # 45分前
                    },
                    {
                        "content": "長期的には上昇すると思う",
                        "emotion_icon": "🤔",
                        "price": 23600.00,
                        "seconds_ago": 3600  # 60分前
                    },
                ]
                
                for demo in demo_comments:
                    # タイムスタンプを秒単位で計算
                    timestamp = now - timedelta(seconds=demo["seconds_ago"])

                    comment = Comment(
                        timestamp=timestamp,
                        price=Decimal(str(demo["price"])),
                        content=demo["content"],
                        emotion_icon=demo["emotion_icon"]
                    )
                    db.add(comment)

                    # デバッグログ
                    unix_timestamp = int(timestamp.timestamp())
                    logger.info(f"Creating demo comment: timestamp={unix_timestamp} (unix seconds), price={demo['price']}, content={demo['content'][:20]}...")

                db.commit()
                logger.info(f"Created {len(demo_comments)} demo comments")

            # コメントを表示（デバッグ用）
            comments = db.query(Comment).order_by(Comment.timestamp.desc()).limit(5).all()
            for c in comments:
                unix_timestamp = int(c.timestamp.timestamp()) if c.timestamp else 0
                logger.info(f"Comment {c.id}: unix_timestamp={unix_timestamp}, price={c.price}, content={c.content[:30]}")

        except Exception as e:
            logger.error(f"Error in startup data creation: {e}")
            db.rollback()
        finally:
            db.close()
    except Exception as e:
        logger.error(f"Error connecting to DB in startup: {e}")
    
    # リアルタイムストリーミングを開始（バックグラウンドタスク）
    asyncio.create_task(realtime_service.start_stream())

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down...")
    realtime_service.stop_stream()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    
    # 接続時に最新の価格があれば送信（メモリキャッシュから）
    if realtime_service.latest_price:
        try:
            await websocket.send_json({
                "type": "market_update",
                "data": realtime_service.latest_price
            })
        except Exception as e:
            logger.error(f"Error sending initial data: {e}")

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
                    # クライアントから送られたtimestamp（ローソク足の時間）を使用
                    if "timestamp" in data and data["timestamp"]:
                        # クライアントから送られたタイムスタンプ（秒単位のUNIXタイム）
                        client_timestamp = data["timestamp"]
                        logger.info(f"Received timestamp from client: {client_timestamp} (type: {type(client_timestamp)})")
                        
                        # timezone-awareなdatetimeに変換
                        timestamp = datetime.fromtimestamp(client_timestamp, tz=timezone.utc)
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
                    
                    # UNIXタイムスタンプ（秒）として送信
                    comment_timestamp = int(comment.timestamp.timestamp())
                    
                    # 保存成功をログ
                    logger.info(f"Comment saved: ID={comment.id}, unix_timestamp={comment_timestamp}, price={comment.price}, content={comment.content[:50]}...")
                    
                    # 全クライアントにブロードキャスト
                    broadcast_data = {
                        "type": "new_comment",
                        "data": {
                            "id": comment.id,
                            "timestamp": comment_timestamp,  # UNIXタイムスタンプ（秒）として送信
                            "price": float(comment.price),
                            "content": comment.content,
                            "emotion_icon": comment.emotion_icon
                        }
                    }
                    
                    logger.info(f"Broadcasting comment: ID={broadcast_data['data']['id']}, timestamp={comment_timestamp} (unix seconds)")
                    await manager.broadcast(broadcast_data)
                    
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
        
        # デバッグ：最初と最後のデータポイントをログ
        if data and len(data) > 0:
            logger.info(f"Market data: first timestamp={data[0]['time']}, last timestamp={data[-1]['time']}")
            logger.info(f"Market data: first price={data[0]['close']}, last price={data[-1]['close']}")
        
        return {"success": True, "data": data}
    except Exception as e:
        logger.error(f"Error getting market data: {e}")
        # エラーでも空のデータを返す
        return {"success": True, "data": []}

@app.get("/api/comments")
async def get_comments(hours: int = 24, interval: str = None, db: Session = Depends(get_db)):
    """コメントを取得（タイムスタンプをUNIXタイムスタンプ（秒）として返す）"""
    try:
        # すべてのコメントを取得（フィルタリングなし）
        comments = db.query(Comment).order_by(Comment.timestamp.desc()).all()
        
        logger.info(f"Found {len(comments)} total comments in database")
        
        result = {
            "comments": []
        }
        
        # 各コメントを処理
        for c in comments:
            unix_timestamp = int(c.timestamp.timestamp()) if c.timestamp else int(datetime.now(timezone.utc).timestamp())
            
            comment_data = {
                "id": c.id,
                "timestamp": unix_timestamp,  # UNIXタイムスタンプ（秒）
                "price": float(c.price),
                "content": c.content,
                "emotion_icon": c.emotion_icon
            }
            
            result["comments"].append(comment_data)
            
            # デバッグ：最初の5件を詳細ログ
            if len(result["comments"]) <= 5:
                logger.info(f"Comment {c.id}: unix_timestamp={unix_timestamp}, price={c.price}, content={c.content[:30]}")
        
        logger.info(f"Returning {len(result['comments'])} comments with UNIX timestamps (seconds)")
        return result
        
    except Exception as e:
        logger.error(f"Error getting comments: {e}", exc_info=True)
        return {"comments": []}

@app.get("/api/sentiment")
async def get_sentiment(
    interval: str = None,
    start: int = None,
    end: int = None,
    db: Session = Depends(get_db)
):
    """センチメント分析結果を取得（期間指定可能）"""
    try:
        if start and end:
            # UNIXタイムスタンプからdatetimeへの変換
            start_dt = datetime.fromtimestamp(start, tz=timezone.utc)
            end_dt = datetime.fromtimestamp(end, tz=timezone.utc)
            logger.info(f"Analyzing sentiment for range: {start_dt} to {end_dt}")
            analysis = sentiment_analyzer.analyze_comments_in_range(db, start_dt, end_dt)
        else:
            # すべてのコメントを対象にセンチメント分析
            analysis = sentiment_analyzer.analyze_all_comments(db)

        return analysis
    except Exception as e:
        logger.error(f"Error getting sentiment: {e}")
        return {"buy_percentage": 50, "sell_percentage": 50, "total_comments": 0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
