import React, { useState, useEffect, useCallback } from 'react';
import Chart from './components/Chart';
import TimeFrameSelector from './components/TimeFrameSelector';
import PositionIndicator from './components/PositionIndicator';
import PostModal from './components/PostModal';
import { WebSocketService } from './services/websocket';
import axios from 'axios';
import './styles/App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// デモデータ生成関数
function generateDemoData(timeFrame) {
  const now = Math.floor(Date.now() / 1000);
  const intervals = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '1H': 3600,
    '4H': 14400,
    '1D': 86400,
    '1W': 604800
  };
  
  const interval = intervals[timeFrame] || 900;
  const numPoints = 100;
  const data = [];
  let basePrice = 17000;
  
  for (let i = 0; i < numPoints; i++) {
    const time = now - (numPoints - i) * interval;
    const change = (Math.random() - 0.5) * 100;
    const open = basePrice + change;
    const close = open + (Math.random() - 0.5) * 50;
    const high = Math.max(open, close) + Math.random() * 20;
    const low = Math.min(open, close) - Math.random() * 20;
    
    data.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume: Math.floor(Math.random() * 1000000)
    });
    
    basePrice = close;
  }
  
  return data;
}

function App() {
  const [timeFrame, setTimeFrame] = useState('15m');
  const [comments, setComments] = useState([]);
  const [sentiment, setSentiment] = useState({ buy_percentage: 50, sell_percentage: 50 });
  const [showPostModal, setShowPostModal] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [wsService, setWsService] = useState(null);
  const [selectedCandle, setSelectedCandle] = useState(null);
  const [connectionError, setConnectionError] = useState(false);

  const loadChartData = useCallback(async () => {
    try {
      console.log('Loading chart data for timeframe:', timeFrame);
      
      const res = await axios.get(`${API_URL}/api/market/^NDX/${timeFrame}`, {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      console.log('Chart data loaded:', res.data);
      
      if (res.data.data && res.data.data.length > 0) {
        setChartData(res.data.data);
      }
      setConnectionError(false);
    } catch (error) {
      console.error('Failed to load chart data:', error);
      setConnectionError(true);
      // デモデータを設定
      const demoData = generateDemoData(timeFrame);
      setChartData(demoData);
    }
  }, [timeFrame]);

  const loadSentiment = useCallback(async () => {
    try {
      // 時間足を指定してセンチメントを取得
      const sentimentRes = await axios.get(`${API_URL}/api/sentiment?interval=${timeFrame}`);
      setSentiment(sentimentRes.data || { buy_percentage: 50, sell_percentage: 50 });
    } catch (error) {
      console.error('Failed to update sentiment:', error);
    }
  }, [timeFrame]);

  const loadInitialData = useCallback(async () => {
    try {
      console.log('Loading initial data for timeframe:', timeFrame);
      
      // 時間足に応じたコメントを取得
      const commentsRes = await axios.get(`${API_URL}/api/comments?interval=${timeFrame}`);
      console.log('Comments API response:', commentsRes.data);
      
      if (commentsRes.data.comments) {
        console.log(`Loaded ${commentsRes.data.comments.length} comments`);
        // コメントの詳細をログ
        commentsRes.data.comments.forEach((comment, index) => {
          if (index < 3) { // 最初の3件だけログ
            console.log('Comment:', {
              id: comment.id,
              timestamp: comment.timestamp,
              price: comment.price,
              content: comment.content.substring(0, 30)
            });
          }
        });
        setComments(commentsRes.data.comments);
      } else {
        console.log('No comments in response');
        setComments([]);
      }
      
      // センチメントを取得
      await loadSentiment();
    } catch (error) {
      console.error('Failed to load initial data:', error);
      setComments([]);
    }
  }, [loadSentiment, timeFrame]);

  const updateChartWithNewPrice = useCallback((newPrice) => {
    setChartData(prevData => {
      if (!prevData || prevData.length === 0) return prevData;
      
      const lastCandle = prevData[prevData.length - 1];
      const now = Math.floor(Date.now() / 1000);
      
      // 時間枠に応じた間隔を計算
      const intervals = {
        '1m': 60,
        '3m': 180,
        '5m': 300,
        '15m': 900,
        '1H': 3600,
        '4H': 14400,
        '1D': 86400,
        '1W': 604800
      };
      
      const interval = intervals[timeFrame] || 900;
      
      // 新しいローソク足を作成するか、既存のものを更新するか判断
      if (now - lastCandle.time >= interval) {
        // 新しいローソク足を追加
        const newCandle = {
          time: lastCandle.time + interval,
          open: lastCandle.close,
          high: Math.max(lastCandle.close, newPrice),
          low: Math.min(lastCandle.close, newPrice),
          close: newPrice,
          volume: Math.floor(Math.random() * 1000000)
        };
        return [...prevData.slice(-99), newCandle]; // 最新100本を保持
      } else {
        // 既存のローソク足を更新
        const updatedData = [...prevData];
        const last = updatedData[updatedData.length - 1];
        last.high = Math.max(last.high, newPrice);
        last.low = Math.min(last.low, newPrice);
        last.close = newPrice;
        return updatedData;
      }
    });
  }, [timeFrame]);

  useEffect(() => {
    // WebSocket接続を初期化
    const wsUrl = API_URL.replace('http', 'ws').replace('https', 'wss');
    console.log('Initializing WebSocket connection to:', `${wsUrl}/ws`);
    
    const ws = new WebSocketService(`${wsUrl}/ws`);
    setWsService(ws);
    
    // 新しいコメントを受信
    ws.on('new_comment', (data) => {
      console.log('New comment received via WebSocket:', data);
      setComments(prev => {
        // 重複を避ける
        const exists = prev.find(c => c.id === data.id);
        if (exists) {
          console.log('Comment already exists, skipping');
          return prev;
        }
        const newComments = [...prev, data];
        console.log('Total comments after adding new:', newComments.length);
        return newComments;
      });
      
      // センチメントも更新
      loadSentiment();
    });
    
    // コメント保存の確認メッセージ
    ws.on('comment_saved', (data) => {
      console.log('Comment saved confirmation:', data);
    });
    
    // エラーメッセージ
    ws.on('error', (data) => {
      console.error('WebSocket error:', data);
    });
    
    // マーケット更新
    ws.on('market_update', (data) => {
      console.log('Market update received:', data);
      if (data && data.price) {
        updateChartWithNewPrice(data.price);
      }
    });

    // 初期データを取得
    loadInitialData();
    loadChartData();
    
    // 定期的にデータを更新（30秒ごと）
    const intervalId = setInterval(() => {
      loadChartData();
      loadInitialData(); // コメントも定期的に更新
    }, 30000);
    
    return () => {
      console.log('Cleaning up WebSocket connection');
      clearInterval(intervalId);
      ws.close();
    };
  }, [loadInitialData, loadChartData, loadSentiment, updateChartWithNewPrice]);

  useEffect(() => {
    // 時間枠が変更されたらデータを再読み込み
    console.log('Timeframe changed to:', timeFrame);
    loadChartData();
    loadInitialData();
  }, [timeFrame, loadChartData, loadInitialData]);

  const handleCandleClick = useCallback((candleData) => {
    console.log('Candle clicked with data:', candleData);
    setSelectedCandle(candleData);
    setShowPostModal(true);
  }, []);

  const handlePostComment = async (content, emotionIcon, customPrice) => {
    console.log('Posting comment:', { content, emotionIcon, customPrice });
    
    if (wsService && selectedCandle) {
      const message = {
        type: 'post_comment',
        timestamp: selectedCandle.time,  // ローソク足の時間を送信
        price: customPrice || selectedCandle.price,  // カスタム価格または選択した価格
        content: content,
        emotion_icon: emotionIcon
      };
      
      console.log('Sending WebSocket message:', message);
      wsService.send(message);
    } else {
      console.error('WebSocket service not initialized or candle not selected');
    }
    
    setShowPostModal(false);
    setSelectedCandle(null);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <img src="/nasu-icon.png" alt="NASDAQ 100" className="logo-icon" />
          <span className="logo-text">ナスダック100先物</span>
        </div>
        
        <TimeFrameSelector 
          selected={timeFrame} 
          onChange={setTimeFrame} 
        />
        
        <PositionIndicator sentiment={sentiment} />
      </header>
      
      {connectionError && (
        <div className="connection-error">
          ⚠️ バックエンドに接続できません。デモモードで実行中です。
        </div>
      )}
      
      <main className="app-main">
        <Chart 
          data={chartData}
          comments={comments}
          onCandleClick={handleCandleClick}
        />
      </main>
      
      {showPostModal && selectedCandle && (
        <PostModal
          onClose={() => {
            setShowPostModal(false);
            setSelectedCandle(null);
          }}
          onSubmit={handlePostComment}
          candleData={selectedCandle}
        />
      )}
    </div>
  );
}

export default App;