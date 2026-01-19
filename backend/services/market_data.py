import pandas as pd
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional
import time
import logging
import json
import numpy as np
from curl_cffi import requests
import asyncio
import yfinance as yf

logger = logging.getLogger(__name__)

class MarketDataService:
    def __init__(self):
        self.symbol = "NQ=F"  # NASDAQ 100 futures
        self.cache = {}
        self.cache_timeout = 300  # 5分のキャッシュ
        
        # curl_cffiのセッション設定
        self.session = requests.Session(impersonate="chrome110")
        
    def _get_yahoo_finance_data(self, symbol: str, period: str, interval: str) -> pd.DataFrame:
        """Yahoo Finance APIから直接データを取得（同期）"""
        try:
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
            
            return df
            
        except Exception as e:
            logger.error(f"Error fetching data from Yahoo Finance: {e}")
            return pd.DataFrame()
        
    def get_latest_data(self) -> Dict:
        """最新の価格データを取得（互換性のために残すが、リアルタイムは別メソッドで処理）"""
        cache_key = f"latest_{self.symbol}"
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if time.time() - cached_time < self.cache_timeout:
                return cached_data
        
        try:
            df = self._get_yahoo_finance_data(self.symbol, "2d", "1m")
            if df.empty:
                return self._get_default_latest_data()
            
            latest = df.iloc[-1]
            previous_close = df.iloc[0]['Close'] if len(df) > 1 else latest['Close']
            
            data = {
                "symbol": self.symbol,
                "price": float(latest['Close']),
                "change": float(latest['Close'] - previous_close),
                "changePercent": float((latest['Close'] - previous_close) / previous_close * 100) if previous_close != 0 else 0,
                "timestamp": datetime.now().isoformat()
            }
            
            self.cache[cache_key] = (data, time.time())
            return data
            
        except Exception as e:
            return self._get_default_latest_data()
    
    def _get_default_latest_data(self) -> Dict:
        return {
            "symbol": self.symbol,
            "price": 17000 + np.random.uniform(-100, 100),
            "change": np.random.uniform(-50, 50),
            "changePercent": np.random.uniform(-0.5, 0.5),
            "timestamp": datetime.now().isoformat()
        }
    
    def get_historical_data(self, symbol: str, interval: str) -> List[Dict]:
        """履歴データを取得"""
        cache_key = f"historical_{symbol}_{interval}"
        if cache_key in self.cache:
            cached_data, cached_time = self.cache[cache_key]
            if time.time() - cached_time < self.cache_timeout:
                return cached_data
        
        period_interval_map = {
            "1m": ("2d", "1m"),
            "3m": ("5d", "5m"),
            "5m": ("5d", "5m"),
            "15m": ("1mo", "15m"),
            "1H": ("3mo", "1h"),
            "4H": ("6mo", "1h"),
            "1D": ("2y", "1d"),
            "1W": ("5y", "1wk")
        }
        
        period, yf_interval = period_interval_map.get(interval, ("1mo", "1d"))
        
        try:
            if symbol == "^NDX":
                symbol = "NQ=F"
            
            df = self._get_yahoo_finance_data(symbol, period, yf_interval)
            
            if df.empty:
                return self._generate_dummy_data(interval)
            
            if interval == "4H":
                df = self._convert_to_4h(df)
            
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
            
            self.cache[cache_key] = (data, time.time())
            return data
            
        except Exception as e:
            return self._generate_dummy_data(interval)
    
    def _convert_to_4h(self, df: pd.DataFrame) -> pd.DataFrame:
        df_4h = df.resample('4H').agg({
            'Open': 'first',
            'High': 'max',
            'Low': 'min',
            'Close': 'last',
            'Volume': 'sum'
        }).dropna()
        return df_4h
    
    def _generate_dummy_data(self, interval: str) -> List[Dict]:
        import random
        now = datetime.now()
        data = []
        base_price = 17000
        num_points = 100
        
        for i in range(num_points):
            change = random.gauss(0, 30)
            open_price = base_price + change
            close_price = open_price + random.gauss(0, 15)
            high_price = max(open_price, close_price) + abs(random.gauss(0, 5))
            low_price = min(open_price, close_price) - abs(random.gauss(0, 5))
            
            timestamp = now - (timedelta(minutes=15) * (num_points - i))
            
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


class RealtimeMarketService:
    def __init__(self, broadcast_func=None):
        self.broadcast_func = broadcast_func
        self.is_running = False
        self.latest_price = None
        self.symbol = "NQ=F"

    async def start_stream(self):
        """リアルタイムデータストリーミングを開始"""
        self.is_running = True
        logger.info(f"Starting realtime stream for {self.symbol}")

        try:
            # yfinanceのTickerオブジェクトを作成
            ticker = yf.Ticker(self.symbol)

            # 高頻度ポーリングループ（WebSocket風の挙動を模倣）
            # 注意: yfinanceの公式ストリーミングAPIがない場合、
            # fast_infoやhistoryを短間隔で叩くのが最も確実な「準リアルタイム」手法
            while self.is_running:
                try:
                    # 最新価格を取得（fast_infoは比較的軽量）
                    # または history(period='1d', interval='1m') の最後のデータを取得
                    # 同期的なI/O操作をスレッドプールで実行
                    df = await asyncio.to_thread(ticker.history, period="1d", interval="1m")

                    if not df.empty:
                        latest = df.iloc[-1]
                        current_price = float(latest['Close'])

                        # データが更新されたか、あるいは強制的に送信するか
                        # ここではシンプルに毎回送信（クライアント側で処理）

                        market_data = {
                            "symbol": self.symbol,
                            "price": current_price,
                            "time": int(latest.name.timestamp()), # UNIX time (frontend expects 'time')
                            "open": float(latest['Open']),
                            "high": float(latest['High']),
                            "low": float(latest['Low']),
                            "close": float(latest['Close']),
                            "volume": int(latest['Volume'])
                        }

                        # メモリに保持
                        self.latest_price = market_data

                        # ブロードキャスト
                        if self.broadcast_func:
                            await self.broadcast_func({
                                "type": "market_update",
                                "data": market_data
                            })
                            # logger.info(f"Broadcasted realtime price: {current_price}")

                except Exception as e:
                    logger.error(f"Error in realtime stream loop: {e}")

                # 1秒待機（API制限を考慮しつつリアルタイム性を確保）
                await asyncio.sleep(2)

        except Exception as e:
            logger.error(f"Fatal error in realtime stream: {e}")
            self.is_running = False

    def stop_stream(self):
        self.is_running = False
