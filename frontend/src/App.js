import React, { useState, useEffect, useCallback, useRef } from 'react';
import Chart from './components/Chart';
import TimeFrameSelector from './components/TimeFrameSelector';
import PositionIndicator from './components/PositionIndicator';
import PostModal from './components/PostModal';
import Gate from './components/Gate';
import Auth from './components/Auth';
import UserMenu from './components/UserMenu';
import { WebSocketService } from './services/websocket';
import { getCurrentUser } from './services/auth';
import axios from 'axios';
import './styles/App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// LocalStorageのキー
const TIMEFRAME_STORAGE_KEY = 'nasdaq100_selected_timeframe';

// デモデータ生成関数 (省略 - 変更なし)
function generateDemoData(timeFrame) {
  const now = Math.floor(Date.now() / 1000);
  const intervals = {
    '1m': 60, '3m': 180, '5m': 300, '15m': 900,
    '1H': 3600, '4H': 14400, '1D': 86400, '1W': 604800
  };
  const interval = intervals[timeFrame] || 900;
  const numPoints = 100;
  const data = [];
  let basePrice = 23700;
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

function generateDemoComments() {
  const now = Math.floor(Date.now() / 1000);
  return [
    { id: 1, timestamp: now - 300, price: 23700.50, content: 'ナスダック強気！🚀', emotion_icon: '🚀' },
    { id: 2, timestamp: now - 900, price: 23650.25, content: 'この辺で買い増し検討中', emotion_icon: '😊' },
    { id: 3, timestamp: now - 1800, price: 23750.75, content: '利確しました。様子見', emotion_icon: '😎' }
  ];
}

function getStoredTimeFrame() {
  try {
    const stored = localStorage.getItem(TIMEFRAME_STORAGE_KEY);
    if (stored && ['1m', '3m', '5m', '15m', '1H', '4H', '1D', '1W'].includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.error('Failed to load timeframe from localStorage:', error);
  }
  return '15m';
}

function saveTimeFrame(timeFrame) {
  try {
    localStorage.setItem(TIMEFRAME_STORAGE_KEY, timeFrame);
  } catch (error) {
    console.error('Failed to save timeframe to localStorage:', error);
  }
}

function App() {
  const [timeFrame, setTimeFrame] = useState(getStoredTimeFrame);
  const [comments, setComments] = useState([]);
  const [sentiment, setSentiment] = useState({ buy_percentage: 50, sell_percentage: 50 });
  const [showPostModal, setShowPostModal] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [wsService, setWsService] = useState(null);
  const [selectedCandle, setSelectedCandle] = useState(null);
  const [connectionError, setConnectionError] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: null, end: null });
  
  // Auth States
  const [isGatePassed, setIsGatePassed] = useState(false);
  const [currentUser, setCurrentUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  const timeFrameRef = useRef(timeFrame);
  useEffect(() => { timeFrameRef.current = timeFrame; }, [timeFrame]);

  // Check Auth Status on Load
  useEffect(() => {
    const checkAuth = async () => {
      // Check for gate cookie (simplified, relying on session persistence or re-entry)
      // For this PoC, we might require gate entry every refresh if not persisted in local storage
      // But let's check user session first
      const user = await getCurrentUser();
      if (user) {
        setCurrentUser(user);
        setIsGatePassed(true); // Logged in user implies gate passed previously
      }
      setAuthLoading(false);
    };
    checkAuth();
  }, []);

  const handleTimeFrameChange = useCallback((newTimeFrame) => {
    console.log('Changing timeframe to:', newTimeFrame);
    setTimeFrame(newTimeFrame);
    saveTimeFrame(newTimeFrame);
  }, []);

  const loadChartData = useCallback(async (specificTimeFrame) => {
    try {
      const tf = specificTimeFrame || timeFrameRef.current || timeFrame;
      const res = await axios.get(`${API_URL}/api/market/^NDX/${tf}`, { timeout: 10000 });
      if (res.data.data && res.data.data.length > 0) {
        setChartData(res.data.data);
      }
      setConnectionError(false);
    } catch (error) {
      console.error('Failed to load chart data:', error);
      setConnectionError(true);
      const tf = specificTimeFrame || timeFrameRef.current || timeFrame;
      setChartData(generateDemoData(tf));
    }
  }, [timeFrame]);

  const loadComments = useCallback(async () => {
    try {
      const commentsRes = await axios.get(`${API_URL}/api/comments`);
      if (commentsRes.data.comments) {
        setComments(commentsRes.data.comments);
      } else {
        setComments([]);
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
      setComments(generateDemoComments());
    }
  }, []);

  const loadSentiment = useCallback(async (start = null, end = null) => {
    try {
      let url = `${API_URL}/api/sentiment`;
      const params = {};
      if (start && end) {
          params.start = Math.floor(start);
          params.end = Math.floor(end);
      }
      const sentimentRes = await axios.get(url, { params });
      setSentiment(sentimentRes.data || { buy_percentage: 50, sell_percentage: 50 });
    } catch (error) {
      console.error('Failed to update sentiment:', error);
      setSentiment({ buy_percentage: 60, sell_percentage: 40 });
    }
  }, []);

  const handleVisibleRangeChange = useCallback((start, end) => {
      setVisibleRange({ start, end });
      loadSentiment(start, end);
  }, [loadSentiment]);

  const updateChartWithNewPrice = useCallback((newPrice) => {
    setChartData(prevData => {
      if (!prevData || prevData.length === 0) return prevData;
      const lastCandle = prevData[prevData.length - 1];
      const now = Math.floor(Date.now() / 1000);
      const intervals = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '1H': 3600, '4H': 14400, '1D': 86400, '1W': 604800 };
      const interval = intervals[timeFrameRef.current] || 900;
      
      if (now - lastCandle.time >= interval) {
        const newCandle = {
          time: lastCandle.time + interval,
          open: lastCandle.close,
          high: Math.max(lastCandle.close, newPrice),
          low: Math.min(lastCandle.close, newPrice),
          close: newPrice,
          volume: Math.floor(Math.random() * 1000000)
        };
        return [...prevData.slice(-99), newCandle];
      } else {
        const updatedData = [...prevData];
        const last = updatedData[updatedData.length - 1];
        last.high = Math.max(last.high, newPrice);
        last.low = Math.min(last.low, newPrice);
        last.close = newPrice;
        return updatedData;
      }
    });
  }, []);

  useEffect(() => {
    if (!currentUser) return; // Only connect WS if authenticated

    const wsUrl = API_URL.replace('http', 'ws').replace('https', 'wss');
    const ws = new WebSocketService(`${wsUrl}/ws`);
    setWsService(ws);
    
    ws.on('new_comment', (data) => {
      setComments(prev => {
        const exists = prev.find(c => c.id === data.id);
        if (exists) return prev;
        return [data, ...prev];
      });
    });
    
    ws.on('comment_saved', (data) => {
      setComments(prev => {
        const exists = prev.find(c => c.id === data.id);
        if (!exists) return [data, ...prev];
        return prev;
      });
      loadSentiment();
    });
    
    ws.on('error', (data) => console.error('WebSocket error:', data));
    
    ws.on('market_update', (data) => {
      if (data && data.price) updateChartWithNewPrice(data.price);
    });

    const currentTimeFrame = getStoredTimeFrame();
    loadChartData(currentTimeFrame);
    loadComments();
    loadSentiment();
    
    const intervalId = setInterval(() => {
      loadChartData();
      loadComments();
    }, 30000);
    
    return () => {
      clearInterval(intervalId);
      ws.close();
    };
  }, [currentUser, loadChartData, loadComments, loadSentiment, updateChartWithNewPrice]);

  useEffect(() => {
    if (!currentUser) return;
    loadChartData(timeFrame);
    setVisibleRange({ start: null, end: null });
    loadSentiment();
  }, [timeFrame, currentUser, loadChartData, loadSentiment]);

  const handleCandleClick = useCallback((candleData) => {
    setSelectedCandle(candleData);
    setShowPostModal(true);
  }, []);

  const handlePostComment = async (content, emotionIcon, customPrice) => {
    if (wsService && selectedCandle) {
      const message = {
        type: 'post_comment',
        timestamp: selectedCandle.time,
        price: customPrice || selectedCandle.price,
        content: content,
        emotion_icon: emotionIcon
      };
      wsService.send(message);
    }
    setShowPostModal(false);
    setSelectedCandle(null);
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsGatePassed(false);
  };

  if (authLoading) return <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100vh'}}>Loading...</div>;

  if (!isGatePassed) {
    return <Gate onPass={() => setIsGatePassed(true)} />;
  }

  if (!currentUser) {
    return <Auth onLogin={setCurrentUser} />;
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <img src="/nasu-icon.png" alt="NASDAQ" className="logo-icon" />
          <span className="logo-text">ナスダック100先物</span>
        </div>
        
        <TimeFrameSelector 
          selected={timeFrame} 
          onChange={handleTimeFrameChange} 
        />
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <PositionIndicator sentiment={sentiment} />
          <UserMenu user={currentUser} onLogout={handleLogout} />
        </div>
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
          onVisibleRangeChange={handleVisibleRangeChange}
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
