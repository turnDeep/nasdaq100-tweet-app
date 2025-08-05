import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List
import time
import logging

logger = logging.getLogger(__name__)

class MarketDataService:
    def __init__(self):
        self.symbol = "NQ=F"  # NASDAQ 100 futures (より信頼性の高いシンボル)
        self.cache = {}
        self.cache_timeout = 300  # 5分のキャッシュ（レート制限対策）
        self.last_request_time = 0
        self.min_request_interval = 2  # 最小リクエスト間隔（秒）
        
    def _rate_limit(self):
        """レート制限を実装"""
        current_time = time.time()
        time_since_last_request = current_time - self.last_request_time
        if time_since_last_request < self.min_request_interval:
            time.sleep(self.min_request_interval - time_since_last_request)
        self.last_request_time = time.time()
        
    def get_latest_data(self) -> Dict:
        """最新の価格データを取得（15分遅延）"""
        # キャッシュチェック
        cache_key = f"latest_{self.symbol}"
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if time.time() - cached_time < self.cache_timeout:
                return cached_data
        
        try:
            self._rate_limit()
            ticker = yf.Ticker(self.symbol)
            
            # 最新のデータを取得（1日分）
            hist = ticker.history(period="1d", interval="1m")
            
            if hist.empty:
                logger.warning(f"No data available for {self.symbol}")
                # デフォルト値を返す
                return {
                    "symbol": self.symbol,
                    "price": 17000,  # ダミーデータ
                    "change": 0,
                    "changePercent": 0,
                    "timestamp": datetime.now().isoformat()
                }
            
            # 最新の価格を取得
            latest = hist.iloc[-1]
            previous_close = hist.iloc[0]['Close'] if len(hist) > 1 else latest['Close']
            
            # 15分遅延を適用
            delay = timedelta(minutes=15)
            
            data = {
                "symbol": self.symbol,
                "price": float(latest['Close']),
                "change": float(latest['Close'] - previous_close),
                "changePercent": float((latest['Close'] - previous_close) / previous_close * 100) if previous_close != 0 else 0,
                "timestamp": (datetime.now() - delay).isoformat()
            }
            
            # キャッシュに保存
            self.cache[cache_key] = (data, time.time())
            
            return data
            
        except Exception as e:
            logger.error(f"Error fetching latest data: {e}")
            # エラー時はデフォルト値を返す
            return {
                "symbol": self.symbol,
                "price": 17000,
                "change": 0,
                "changePercent": 0,
                "timestamp": datetime.now().isoformat()
            }
    
    def get_historical_data(self, symbol: str, interval: str) -> List[Dict]:
        """履歴データを取得"""
        # キャッシュチェック
        cache_key = f"historical_{symbol}_{interval}"
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if time.time() - cached_time < self.cache_timeout:
                return cached_data
        
        period_map = {
            "1m": ("1d", "1m"),
            "3m": ("5d", "5m"),
            "15m": ("5d", "15m"),
            "1H": ("1mo", "1h"),
            "4H": ("3mo", "1d"),
            "1D": ("1y", "1d"),
            "1W": ("2y", "1wk")
        }
        
        period, yf_interval = period_map.get(interval, ("1mo", "1d"))
        
        try:
            self._rate_limit()
            
            # シンボルの修正（^NDXの場合はNQ=Fを使用）
            if symbol == "^NDX":
                symbol = "NQ=F"
                
            ticker = yf.Ticker(symbol)
            df = ticker.history(period=period, interval=yf_interval)
            
            if df.empty:
                logger.warning(f"No historical data available for {symbol}")
                # ダミーデータを生成
                return self._generate_dummy_data(interval)
            
            # データを整形
            data = []
            for index, row in df.iterrows():
                data.append({
                    "time": int(index.timestamp()),
                    "open": float(row["Open"]),
                    "high": float(row["High"]),
                    "low": float(row["Low"]),
                    "close": float(row["Close"]),
                    "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0
                })
            
            # キャッシュに保存
            self.cache[cache_key] = (data, time.time())
            
            return data
            
        except Exception as e:
            logger.error(f"Error fetching historical data: {e}")
            # エラー時はダミーデータを返す
            return self._generate_dummy_data(interval)
    
    def _generate_dummy_data(self, interval: str) -> List[Dict]:
        """ダミーデータを生成（開発用）"""
        import random
        
        now = datetime.now()
        data = []
        base_price = 17000
        
        # インターバルに応じたデータポイント数
        points_map = {
            "1m": 60,
            "3m": 100,
            "15m": 96,
            "1H": 168,
            "4H": 90,
            "1D": 365,
            "1W": 104
        }
        
        num_points = points_map.get(interval, 100)
        
        for i in range(num_points):
            # ランダムな価格変動を生成
            change = random.uniform(-50, 50)
            open_price = base_price + change
            close_price = open_price + random.uniform(-20, 20)
            high_price = max(open_price, close_price) + random.uniform(0, 10)
            low_price = min(open_price, close_price) - random.uniform(0, 10)
            
            # 時間を計算
            if interval == "1m":
                timestamp = now - timedelta(minutes=num_points-i)
            elif interval == "3m":
                timestamp = now - timedelta(minutes=3*(num_points-i))
            elif interval == "15m":
                timestamp = now - timedelta(minutes=15*(num_points-i))
            elif interval == "1H":
                timestamp = now - timedelta(hours=num_points-i)
            elif interval == "4H":
                timestamp = now - timedelta(hours=4*(num_points-i))
            elif interval == "1D":
                timestamp = now - timedelta(days=num_points-i)
            else:  # 1W
                timestamp = now - timedelta(weeks=num_points-i)
            
            data.append({
                "time": int(timestamp.timestamp()),
                "open": round(open_price, 2),
                "high": round(high_price, 2),
                "low": round(low_price, 2),
                "close": round(close_price, 2),
                "volume": random.randint(1000000, 10000000)
            })
            
            base_price = close_price
        
        return data
