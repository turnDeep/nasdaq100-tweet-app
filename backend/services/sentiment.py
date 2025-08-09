from sqlalchemy.orm import Session
from datetime import datetime, timedelta, timezone
from models import Comment
import re

class SentimentAnalyzer:
    def __init__(self):
        self.buy_keywords = ["買い", "ロング", "IN", "上昇", "強気", "ブル"]
        self.sell_keywords = ["売り", "ショート", "利確", "下落", "弱気", "ベア"]
        
    def analyze_recent_comments(self, db: Session, hours: int = 1) -> dict:
        """直近のコメントからセンチメントを分析"""
        # timezone-awareなdatetimeを使用
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        comments = db.query(Comment).filter(Comment.timestamp >= since).all()
        
        return self._analyze_comments(comments)
    
    def analyze_all_comments(self, db: Session) -> dict:
        """すべてのコメントからセンチメントを分析"""
        comments = db.query(Comment).all()
        return self._analyze_comments(comments)
    
    def _analyze_comments(self, comments) -> dict:
        """コメントリストからセンチメントを分析"""
        buy_count = 0
        sell_count = 0
        neutral_count = 0
        
        for comment in comments:
            content = comment.content.lower()
            
            # BUYキーワードチェック
            has_buy = any(keyword in content for keyword in self.buy_keywords)
            # SELLキーワードチェック
            has_sell = any(keyword in content for keyword in self.sell_keywords)
            
            if has_buy and not has_sell:
                buy_count += 1
            elif has_sell and not has_buy:
                sell_count += 1
            else:
                # どちらも含まれるか、どちらも含まれない場合は中立
                neutral_count += 1
        
        total = buy_count + sell_count
        
        if total == 0:
            # センチメントが判定できない場合は50:50
            return {
                "buy_percentage": 50,
                "sell_percentage": 50,
                "total_comments": len(comments),
                "buy_count": buy_count,
                "sell_count": sell_count,
                "neutral_count": neutral_count
            }
        
        return {
            "buy_percentage": round((buy_count / total) * 100),
            "sell_percentage": round((sell_count / total) * 100),
            "total_comments": len(comments),
            "buy_count": buy_count,
            "sell_count": sell_count,
            "neutral_count": neutral_count
        }