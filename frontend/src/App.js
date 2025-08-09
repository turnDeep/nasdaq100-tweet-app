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

// デモコメント生成（タイムスタンプを秒単位で）
function generateDemoComments() {
  const now = Math.floor(Date.now() / 1000);
  return [
    {
      id: 1,
      timestamp: now - 300,  // 5分前
      price: 17100.50,
      content: 'ナスダック強気！🚀',
      emotion_icon: '🚀'
    },
    {
      id: 2,
      timestamp: now - 900,  // 15分前
      price: 17050.25,
      content: 'この辺で買い増し検討中',
      emotion_icon: '😊'
    },
    {
      id: 3,
      timestamp: now - 1800,  // 30分前
      price: 17150.75,
      content: '利確しました。様子見',
      emotion_icon: '😎'
    }
  ];
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

  const loadComments = useCallback(async () => {
    try {
      console.log('Loading all comments');
      
      // すべてのコメントを取得（フィルタリングなし）
      const commentsRes = await axios.get(`${API_URL}/api/comments`);
      console.log('Comments API response:', commentsRes.data);
      
      if (commentsRes.data.comments) {
        console.log(`Loaded ${commentsRes.data.comments.length} comments`);
        
        // デバッグ用：コメントの詳細をログ
        commentsRes.data.comments.forEach((comment, index) => {
          if (index < 5) { // 最初の5件だけログ
            console.log('Comment:', {
              id: comment.id,
              timestamp: comment.timestamp,
              timestampType: typeof comment.timestamp,
              price: comment.price,
              content: comment.content.substring(0, 30),
              emotion_icon: comment.emotion_icon
            });
          }
        });
        
        setComments(commentsRes.data.comments);
      } else {
        console.log('No comments in response');
        setComments([]);
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
      
      // エラー時にデモコメントを表示
      const demoComments = generateDemoComments();
      setComments(demoComments);
    }
  }, []);

  const loadSentiment = useCallback(async () => {
    try {
      // センチメント取得（フィルタリングなし）
      const sentimentRes = await axios.get(`${API_URL}/api/sentiment`);
      console.log('Sentiment data:', sentimentRes.data);
      setSentiment(sentimentRes.data || { buy_percentage: 50, sell_percentage: 50 });
    } catch (error) {
      console.error('Failed to update sentiment:', error);
      setSentiment({ buy_percentage: 60, sell_percentage: 40 });
    }
  }, []);

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
      console.log('Timestamp type:', typeof data.timestamp);
      
      setComments(prev => {
        // 重複を避ける
        const exists = prev.find(c => c.id === data.id);
        if (exists) {
          console.log('Comment already exists, skipping');
          return prev;
        }
        
        // 新しいコメントを追加（最新のコメントを先頭に）
        const newComments = [data, ...prev];
        console.log('Total comments after adding new:', newComments.length);
        return newComments;
      });
      
      // センチメントも更新
      loadSentiment();
    });
    
    // コメント保存の確認メッセージ
    ws.on('comment_saved', (data) => {
      console.log('Comment saved confirmation:', data);
      console.log('Saved timestamp type:', typeof data.timestamp);
      
      // 即座にコメントリストに追加
      setComments(prev => {
        const exists = prev.find(c => c.id === data.id);
        if (!exists) {
          return [data, ...prev];
        }
        return prev;
      });
      
      // センチメントを更新
      loadSentiment();
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
    loadChartData();
    loadComments();
    loadSentiment();
    
    // 定期的にデータを更新（30秒ごと）
    const intervalId = setInterval(() => {
      loadChartData();
      loadComments();
      loadSentiment();
    }, 30000);
    
    return () => {
      console.log('Cleaning up WebSocket connection');
      clearInterval(intervalId);
      ws.close();
    };
  }, []); // 依存配列を空にして初回のみ実行

  useEffect(() => {
    // 時間枠が変更されたらチャートデータのみ再読み込み
    console.log('Timeframe changed to:', timeFrame);
    loadChartData();
  }, [timeFrame, loadChartData]);

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
        timestamp: selectedCandle.time,  // ローソク足の時間を送信（秒単位のUNIXタイムスタンプ）
        price: customPrice || selectedCandle.price,  // カスタム価格または選択した価格
        content: content,
        emotion_icon: emotionIcon
      };
      
      console.log('Sending WebSocket message:', message);
      console.log('Timestamp being sent:', message.timestamp, 'Type:', typeof message.timestamp);
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
          <span className="logo-text">📈 ナスダック100先物</span>
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