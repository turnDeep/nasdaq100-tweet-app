from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, Depends, Request, Response, Body
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
import json
import asyncio
from typing import List, Dict, Optional
import os
from dotenv import load_dotenv
import logging
from decimal import Decimal
import time
from pydantic import BaseModel

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
from models import Comment, User, UserCredential, AuthChallenge

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
from services.auth import AuthService
auth_service = AuthService()

# Auth Models
class GatePasswordRequest(BaseModel):
    password: str

class RegisterOptionsRequest(BaseModel):
    username: str

class RegisterVerifyRequest(BaseModel):
    username: str
    user_id: str
    response: dict
    image_data: Optional[str] = None # Base64 string

class LoginOptionsRequest(BaseModel):
    username: str

class LoginVerifyRequest(BaseModel):
    username: str
    response: dict

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
    
    # リアルタイムストリーミングを開始（バックグラウンドタスク）
    asyncio.create_task(realtime_service.start_stream())

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down...")
    realtime_service.stop_stream()

# Auth Endpoints
@app.post("/api/auth/gate")
async def verify_gate(request: GatePasswordRequest, response: Response):
    if auth_service.verify_gate_password(request.password):
        # Set a simple cookie for gate access
        response.set_cookie(key="gate_passed", value="true", httponly=True, max_age=86400)
        return {"success": True}
    raise HTTPException(status_code=401, detail="Invalid password")

@app.post("/api/auth/register/options")
async def register_options(request: RegisterOptionsRequest, db: Session = Depends(get_db)):
    try:
        options, user_id = auth_service.generate_registration_options(db, request.username)
        from webauthn import options_to_json
        return {"options": json.loads(options_to_json(options)), "user_id": user_id}
    except Exception as e:
        logger.error(f"Register options error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/register/verify")
async def register_verify(request: RegisterVerifyRequest, response: Response, db: Session = Depends(get_db)):
    try:
        user = auth_service.verify_registration(db, request.response, request.user_id, request.username, request.image_data)
        # Set auth cookie
        response.set_cookie(key="user_id", value=user.id, httponly=True, max_age=86400 * 30)
        return {"success": True, "user": {"username": user.username, "profile_image": user.profile_image}}
    except Exception as e:
        logger.error(f"Register verify error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/auth/login/options")
async def login_options(request: LoginOptionsRequest, db: Session = Depends(get_db)):
    try:
        options = auth_service.generate_login_options(db, request.username)
        from webauthn import options_to_json
        return json.loads(options_to_json(options))
    except Exception as e:
        logger.error(f"Login options error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/auth/login/verify")
async def login_verify(request: LoginVerifyRequest, response: Response, db: Session = Depends(get_db)):
    try:
        user = auth_service.verify_login(db, request.response, request.username)
        # Set auth cookie
        response.set_cookie(key="user_id", value=user.id, httponly=True, max_age=86400 * 30)
        return {"success": True, "user": {"username": user.username, "profile_image": user.profile_image}}
    except Exception as e:
        logger.error(f"Login verify error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/auth/me")
async def get_current_user(request: Request, db: Session = Depends(get_db)):
    user_id = request.cookies.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    user = auth_service.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=401, detail="User not found")

    return {"id": user.id, "username": user.username, "profile_image": user.profile_image}

@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie("user_id")
    return {"success": True}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    user_id = websocket.cookies.get("user_id")
    
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
                # Check Gate Pass (Simplistic check) - ideally validate session/cookie too
                # For now, we trust the connection if they can post, or we could require auth payload

                # 新しいDBセッションを作成
                db = next(get_db())
                try:
                    # データ検証
                    price = float(data.get("price", 0))
                    content = str(data.get("content", "")).strip()
                    emotion_icon = data.get("emotion_icon")
                    
                    # タイムスタンプの処理
                    if "timestamp" in data and data["timestamp"]:
                        client_timestamp = data["timestamp"]
                        timestamp = datetime.fromtimestamp(client_timestamp, tz=timezone.utc)
                    else:
                        timestamp = datetime.now(timezone.utc)
                    
                    if not content:
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
                        emotion_icon=emotion_icon,
                        user_id=user_id
                    )
                    db.add(comment)
                    db.commit()
                    db.refresh(comment)
                    
                    comment_timestamp = int(comment.timestamp.timestamp())
                    
                    # 全クライアントにブロードキャスト
                    broadcast_data = {
                        "type": "new_comment",
                        "data": {
                            "id": comment.id,
                            "timestamp": comment_timestamp,
                            "price": float(comment.price),
                            "content": comment.content,
                            "emotion_icon": comment.emotion_icon,
                            "user_id": comment.user_id
                        }
                    }
                    
                    await manager.broadcast(broadcast_data)
                    
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
        return {"success": True, "data": []}

@app.get("/api/comments")
async def get_comments(hours: int = 24, interval: str = None, db: Session = Depends(get_db)):
    """コメントを取得（タイムスタンプをUNIXタイムスタンプ（秒）として返す）"""
    try:
        comments = db.query(Comment).order_by(Comment.timestamp.desc()).all()
        result = {
            "comments": []
        }
        for c in comments:
            unix_timestamp = int(c.timestamp.timestamp()) if c.timestamp else int(datetime.now(timezone.utc).timestamp())
            comment_data = {
                "id": c.id,
                "timestamp": unix_timestamp,
                "price": float(c.price),
                "content": c.content,
                "emotion_icon": c.emotion_icon,
                "user_id": c.user_id
            }
            result["comments"].append(comment_data)
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
            start_dt = datetime.fromtimestamp(start, tz=timezone.utc)
            end_dt = datetime.fromtimestamp(end, tz=timezone.utc)
            logger.info(f"Analyzing sentiment for range: {start_dt} to {end_dt}")
            analysis = sentiment_analyzer.analyze_comments_in_range(db, start_dt, end_dt)
        else:
            analysis = sentiment_analyzer.analyze_all_comments(db)

        return analysis
    except Exception as e:
        logger.error(f"Error getting sentiment: {e}")
        return {"buy_percentage": 50, "sell_percentage": 50, "total_comments": 0}

@app.delete("/api/comments/{comment_id}")
async def delete_comment(comment_id: int, request: Request, db: Session = Depends(get_db)):
    user_id = request.cookies.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    comment = db.query(Comment).filter(Comment.id == comment_id).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")

    if comment.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this comment")

    db.delete(comment)
    db.commit()

    # Broadcast deletion
    await manager.broadcast({
        "type": "delete_comment",
        "data": {"id": comment_id}
    })

    return {"success": True}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
