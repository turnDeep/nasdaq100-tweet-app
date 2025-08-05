import yfinance as yf
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List

class MarketDataService:
    def __init__(self):
        self.symbol = "^NDX"  # NASDAQ 100 index
        self.cache = {}
        self.cache_timeout = 60  # 60秒のキャッシュ

    def get_latest_data(self) -> Dict:
        """最新の価格データを取得（15分遅延）"""
        ticker = yf.Ticker(self.symbol)
        info = ticker.info

        # 15分遅延を適用
        delay = timedelta(minutes=15)

        return {
            "symbol": self.symbol,
            "price": info.get("regularMarketPrice", 0),
            "change": info.get("regularMarketChange", 0),
            "changePercent": info.get("regularMarketChangePercent", 0),
            "timestamp": (datetime.now() - delay).isoformat()
        }

    def get_historical_data(self, symbol: str, interval: str) -> List[Dict]:
        """履歴データを取得"""
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

        ticker = yf.Ticker(symbol)
        df = ticker.history(period=period, interval=yf_interval)

        # データを整形
        data = []
        for index, row in df.iterrows():
            data.append({
                "time": int(index.timestamp()),
                "open": float(row["Open"]),
                "high": float(row["High"]),
                "low": float(row["Low"]),
                "close": float(row["Close"]),
                "volume": int(row["Volume"])
            })

        return data
