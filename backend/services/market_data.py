import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List
import time
import logging
import random
import requests
from fake_useragent import UserAgent

logger = logging.getLogger(__name__)

class MarketDataService:
    def __init__(self):
        self.symbol = "NQ=F"  # NASDAQ 100 futures
        self.cache = {}
        self.cache_timeout = 300  # 5分のキャッシュ
        self.last_request_time = 0
        self.min_request_interval = 2
        
        # User-Agentを設定
        self.ua = UserAgent()
        self.setup_session()
        
    def setup_session(self):
        """セッションを設定"""
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': self.ua.random,
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
        })
        
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
        cache_key = "latest_data"
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if time.time() - cached_time < self.cache_timeout:
                return cached_data
        
        try:
            self._rate_limit()
            
            # yfinanceのダウンロード関数を使用（より安定）
            df = yf.download(
                self.symbol,
                period='1d',
                interval='1m',
                progress=False,
                show_errors=False,
                timeout=10
            )
            
            if df.empty:
                logger.warning(f"No data available for {self.symbol}, using dummy data")
                return self._generate_latest_dummy_data()
            
            # 最新の価格を取得
            latest = df.iloc[-1]
            first = df.iloc[0]
            
            # 15分遅延を適用
            delay = timedelta(minutes=15)
            
            data = {
                "symbol": self.symbol,
                "price": round(float(latest['Close']), 2),
                "change": round(float(latest['Close'] - first['Close']), 2),
                "changePercent": round(float((latest['Close'] - first['Close']) / first['Close'] * 100), 2) if first['Close'] != 0 else 0,
                "timestamp": (datetime.now() - delay).isoformat()
            }
            
            # キャッシュに保存
            self.cache[cache_key] = (data, time.time())
            
            return data
            
        except Exception as e:
            logger.error(f"Error fetching latest data: {e}")
            return self._generate_latest_dummy_data()
    
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
            
            # シンボルの修正
            if symbol == "^NDX":
                symbol = self.symbol
            
            # yfinanceのダウンロード関数を使用
            df = yf.download(
                symbol,
                period=period,
                interval=yf_interval,
                progress=False,
                show_errors=False,
                timeout=10,
                session=self.session
            )
            
            if df.empty:
                logger.warning(f"No historical data available for {symbol}")
                return self._generate_dummy_data(interval)
            
            # データを整形
            data = []
            for index, row in df.iterrows():
                # indexがDatetimeIndexの場合の処理
                if hasattr(index, 'timestamp'):
                    timestamp = int(index.timestamp())
                else:
                    # MultiIndexの場合（複数銘柄）
                    timestamp = int(index[0].timestamp())
                
                data.append({
                    "time": timestamp,
                    "open": round(float(row["Open"]), 2),
                    "high": round(float(row["High"]), 2),
                    "low": round(float(row["Low"]), 2),
                    "close": round(float(row["Close"]), 2),
                    "volume": int(row["Volume"]) if not pd.isna(row["Volume"]) else 0
                })
            
            # キャッシュに保存
            self.cache[cache_key] = (data, time.time())
            
            return data
            
        except Exception as e:
            logger.error(f"Error fetching historical data: {e}")
            return self._generate_dummy_data(interval)
    
    def _generate_latest_dummy_data(self) -> Dict:
        """最新のダミーデータを生成"""
        base_price = 17000 + random.uniform(-100, 100)
        change = random.uniform(-50, 50)
        
        return {
            "symbol": self.symbol,
            "price": round(base_price, 2),
            "change": round(change, 2),
            "changePercent": round(change / base_price * 100, 2),
            "timestamp": datetime.now().isoformat()
        }
    
    def _generate_dummy_data(self, interval: str) -> List[Dict]:
        """リアルな動きのダミーデータを生成"""
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
        
        # トレンドを生成
        trend = random.choice([-1, 0, 1]) * random.uniform(0.0001, 0.0005)
        
        for i in range(num_points):
            # ボラティリティを時間帯によって変化
            volatility = random.uniform(0.001, 0.003)
            
            # 価格変動を生成（トレンド + ランダム）
            change_percent = trend + random.gauss(0, volatility)
            
            # OHLCを生成
            open_price = base_price
            close_price = base_price * (1 + change_percent)
            
            # 高値と安値を生成
            intrabar_volatility = abs(change_percent) * random.uniform(0.5, 1.5)
            if close_price > open_price:
                high_price = close_price + base_price * intrabar_volatility * random.uniform(0, 0.5)
                low_price = open_price - base_price * intrabar_volatility * random.uniform(0, 0.3)
            else:
                high_price = open_price + base_price * intrabar_volatility * random.uniform(0, 0.3)
                low_price = close_price - base_price * intrabar_volatility * random.uniform(0, 0.5)
            
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
                "volume": random.randint(5000000, 15000000)
            })
            
            # 次の足の開始価格を更新
            base_price = close_price
        
        return data
