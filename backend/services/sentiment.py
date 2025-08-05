from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from models import Comment
import re

class SentimentAnalyzer:
    def __init__(self):
        self.buy_keywords = ["買い", "ロング", "IN", "上昇", "強気", "ブル"]
        self.sell_keywords = ["売り", "ショート", "利確", "下落", "弱気", "ベア"]
        
    def analyze_recent_comments(self, db: Session, hours: int = 1) -> dict:
        """直近のコメントからセンチメントを分析"""
        since = datetime.utcnow() - timedelta(hours=hours)
        comments = db.query(Comment).filter(Comment.timestamp >= since).all()
        
        buy_count = 0
        sell_count = 0
        
        for comment in comments:
            content = comment.content.lower()
            
            # BUYキーワードチェック
            if any(keyword in content for keyword in self.buy_keywords):
                buy_count += 1
            # SELLキーワードチェック
            elif any(keyword in content for keyword in self.sell_keywords):
                sell_count += 1
        
        total = buy_count + sell_count
        
        if total == 0:
            return {
                "buy_percentage": 50,
                "sell_percentage": 50,
                "total_comments": 0
            }
        
        return {
            "buy_percentage": round((buy_count / total) * 100),
            "sell_percentage": round((sell_count / total) * 100),
            "total_comments": total
        }