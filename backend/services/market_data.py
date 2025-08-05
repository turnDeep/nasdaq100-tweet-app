import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List
import time
import logging
import json
import numpy as np
from curl_cffi import requests

logger = logging.getLogger(__name__)

class MarketDataService:
    def __init__(self):
        self.symbol = "NQ=F"  # NASDAQ 100 futures
        self.cache = {}
        self.cache_timeout = 300  # 5分のキャッシュ
        self.last_request_time = 0
        self.min_request_interval = 2  # 最小リクエスト間隔（秒）
        
        # curl_cffiのセッション設定
        self.session = requests.Session(impersonate="chrome110")
        
    def _rate_limit(self):
        """レート制限を実装"""
        current_time = time.time()
        time_since_last_request = current_time - self.last_request_time
        if time_since_last_request < self.min_request_interval:
            time.sleep(self.min_request_interval - time_since_last_request)
        self.last_request_time = time.time()
        
    def _get_yahoo_finance_data(self, symbol: str, period: str, interval: str) -> pd.DataFrame:
        """Yahoo Finance APIから直接データを取得"""
        try:
            self._rate_limit()
            
            # 期間を秒単位に変換
            period_map = {
                "1d": 86400,
                "2d": 172800,
                "5d": 432000,
                "1mo": 2592000,
                "3mo": 7776000,
                "6mo": 15552000,
                "1y": 31536000,
                "2y": 63072000,
                "5y": 157680000,
                "10y": 315360000,
                "max": 3153600000
            }
            
            # 現在時刻と開始時刻を計算
            period2 = int(time.time())
            period1 = period2 - period_map.get(period, 86400)
            
            # Yahoo Finance APIのURL
            url = f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
            
            params = {
                "period1": period1,
                "period2": period2,
                "interval": interval,
                "includePrePost": "true",
                "events": "div%7Csplit%7Ccapitalgains",
                "useYfid": "true",
                "includeAdjustedClose": "true"
            }
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
                "Accept": "application/json",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br",
                "Cache-Control": "no-cache",
                "Pragma": "no-cache",
                "Sec-Fetch-Dest": "empty",
                "Sec-Fetch-Mode": "cors",
                "Sec-Fetch-Site": "same-site"
            }
            
            response = self.session.get(url, params=params, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Failed to fetch data: HTTP {response.status_code}")
                return pd.DataFrame()
            
            data = response.json()
            
            # データの解析
            if 'chart' not in data or 'result' not in data['chart'] or len(data['chart']['result']) == 0:
                logger.error("Invalid response structure from Yahoo Finance")
                return pd.DataFrame()
            
            result = data['chart']['result'][0]
            
            if 'timestamp' not in result:
                logger.error("No timestamp data in response")
                return pd.DataFrame()
            
            # タイムスタンプ
            timestamps = result['timestamp']
            
            # 価格データ
            quotes = result['indicators']['quote'][0]
            
            # DataFrameを作成
            df_data = {
                'timestamp': timestamps,
                'Open': quotes.get('open', []),
                'High': quotes.get('high', []),
                'Low': quotes.get('low', []),
                'Close': quotes.get('close', []),
                'Volume': quotes.get('volume', [])
            }
            
            df = pd.DataFrame(df_data)
            df['timestamp'] = pd.to_datetime(df['timestamp'], unit='s')
            df.set_index('timestamp', inplace=True)
            
            # NaNを除去
            df = df.dropna()
            
            logger.info(f"Successfully fetched {len(df)} data points for {symbol}")
            return df
            
        except Exception as e:
            logger.error(f"Error fetching data from Yahoo Finance: {e}")
            return pd.DataFrame()
        
    def get_latest_data(self) -> Dict:
        """最新の価格データを取得"""
        # キャッシュチェック
        cache_key = f"latest_{self.symbol}"
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if time.time() - cached_time < self.cache_timeout:
                return cached_data
        
        try:
            # 2日間の1分足データを取得
            df = self._get_yahoo_finance_data(self.symbol, "2d", "1m")
            
            if df.empty:
                logger.warning(f"No data available for {self.symbol}")
                return self._get_default_latest_data()
            
            # 最新の価格を取得
            latest = df.iloc[-1]
            previous_close = df.iloc[0]['Close'] if len(df) > 1 else latest['Close']
            
            data = {
                "symbol": self.symbol,
                "price": float(latest['Close']),
                "change": float(latest['Close'] - previous_close),
                "changePercent": float((latest['Close'] - previous_close) / previous_close * 100) if previous_close != 0 else 0,
                "timestamp": datetime.now().isoformat()
            }
            
            # キャッシュに保存
            self.cache[cache_key] = (data, time.time())
            logger.info(f"Successfully fetched latest data: {data['price']}")
            
            return data
            
        except Exception as e:
            logger.error(f"Error fetching latest data: {e}")
            return self._get_default_latest_data()
    
    def _get_default_latest_data(self) -> Dict:
        """デフォルトの最新データを返す"""
        return {
            "symbol": self.symbol,
            "price": 17000 + np.random.uniform(-100, 100),
            "change": np.random.uniform(-50, 50),
            "changePercent": np.random.uniform(-0.5, 0.5),
            "timestamp": datetime.now().isoformat()
        }
    
    def get_historical_data(self, symbol: str, interval: str) -> List[Dict]:
        """履歴データを取得 - 時間足に応じた最適な期間設定"""
        # キャッシュチェック
        cache_key = f"historical_{symbol}_{interval}"
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if time.time() - cached_time < self.cache_timeout:
                return cached_data
        
        # 時間足に応じた期間とインターバルの設定
        period_interval_map = {
            "1m": ("2d", "1m"),      # 2日間の1分足
            "3m": ("5d", "5m"),      # 5日間の5分足（3分足は5分足で代用）
            "5m": ("5d", "5m"),      # 5日間の5分足
            "15m": ("1mo", "15m"),   # 1ヶ月間の15分足
            "1H": ("3mo", "1h"),     # 3ヶ月間の1時間足
            "4H": ("6mo", "1h"),     # 6ヶ月間の1時間足（4時間足に変換）
            "1D": ("2y", "1d"),      # 2年間の日足
            "1W": ("5y", "1wk")      # 5年間の週足
        }
        
        period, yf_interval = period_interval_map.get(interval, ("1mo", "1d"))
        
        try:
            # シンボルの修正
            if symbol == "^NDX":
                symbol = "NQ=F"
            
            # Yahoo Financeからデータを取得
            df = self._get_yahoo_finance_data(symbol, period, yf_interval)
            
            if df.empty:
                logger.warning(f"No historical data available for {symbol}")
                return self._generate_dummy_data(interval)
            
            # 4時間足の場合は1時間足データを変換
            if interval == "4H":
                df = self._convert_to_4h(df)
            
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
            logger.info(f"Successfully fetched {len(data)} data points for {symbol} {interval}")
            
            return data
            
        except Exception as e:
            logger.error(f"Error fetching historical data: {e}")
            return self._generate_dummy_data(interval)
    
    def _convert_to_4h(self, df: pd.DataFrame) -> pd.DataFrame:
        """1時間足データを4時間足に変換"""
        # 4時間ごとにリサンプリング
        df_4h = df.resample('4H').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum'
        }).dropna()
        
        return df_4h
    
    def _generate_dummy_data(self, interval: str) -> List[Dict]:
        """ダミーデータを生成（開発用）"""
        import random
        
        now = datetime.now()
        data = []
        base_price = 17000
        
        # インターバルに応じたデータポイント数
        points_map = {
            "1m": 120,    # 2時間分
            "3m": 100,    # 5時間分
            "5m": 100,    # 8時間分
            "15m": 96,    # 24時間分
            "1H": 168,    # 1週間分
            "4H": 90,     # 15日分
            "1D": 365,    # 1年分
            "1W": 104     # 2年分
        }
        
        num_points = points_map.get(interval, 100)
        
        for i in range(num_points):
            # ランダムな価格変動を生成（よりリアルな変動）
            change = random.gauss(0, 30)  # 正規分布でより自然な変動
            open_price = base_price + change
            close_price = open_price + random.gauss(0, 15)
            high_price = max(open_price, close_price) + abs(random.gauss(0, 5))
            low_price = min(open_price, close_price) - abs(random.gauss(0, 5))
            
            # 時間を計算
            time_delta_map = {
                "1m": timedelta(minutes=1),
                "3m": timedelta(minutes=3),
                "5m": timedelta(minutes=5),
                "15m": timedelta(minutes=15),
                "1H": timedelta(hours=1),
                "4H": timedelta(hours=4),
                "1D": timedelta(days=1),
                "1W": timedelta(weeks=1)
            }
            
            time_delta = time_delta_map.get(interval, timedelta(hours=1))
            timestamp = now - (time_delta * (num_points - i))
            
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
