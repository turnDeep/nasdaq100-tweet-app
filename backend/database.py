from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import QueuePool
import os
import logging

logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/nasdaq100_app")

# Railway用のPostgreSQL URLの修正
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

# 接続プールの設定を改善
engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=5,  # 同時接続数
    max_overflow=10,  # 最大オーバーフロー
    pool_recycle=3600,  # 1時間で接続をリサイクル
    pool_pre_ping=True,  # 接続前にpingを送信して確認
    echo=False  # SQLログを出力しない（本番環境）
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """データベースセッションを取得"""
    db = SessionLocal()
    try:
        yield db
    except Exception as e:
        logger.error(f"Database session error: {e}")
        db.rollback()
        raise
    finally:
        db.close()

def init_db():
    """データベースを初期化"""
    try:
        from models import Comment
        Base.metadata.create_all(bind=engine)
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating database tables: {e}")
        raise