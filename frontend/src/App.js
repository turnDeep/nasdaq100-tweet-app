import React, { useState, useEffect, useCallback, useRef } from 'react';
import Chart from './components/Chart';
import TimeFrameSelector from './components/TimeFrameSelector';
import PositionIndicator from './components/PositionIndicator';
import PostModal from './components/PostModal';
import { WebSocketService } from './services/websocket';
import axios from 'axios';
import './styles/App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

// LocalStorageのキー
const TIMEFRAME_STORAGE_KEY = 'nasdaq100_selected_timeframe';

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
  let basePrice = 23700; // ナスダック100先物の現実的な価格帯に変更
  
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
      price: 23700.50,
      content: 'ナスダック強気！🚀',
      emotion_icon: '🚀'
    },
    {
      id: 2,
      timestamp: now - 900,  // 15分前
      price: 23650.25,
      content: 'この辺で買い増し検討中',
      emotion_icon: '😊'
    },
    {
      id: 3,
      timestamp: now - 1800,  // 30分前
      price: 23750.75,
      content: '利確しました。様子見',
      emotion_icon: '😎'
    }
  ];
}

// LocalStorageから時間枠を取得する関数
function getStoredTimeFrame() {
  try {
    const stored = localStorage.getItem(TIMEFRAME_STORAGE_KEY);
    if (stored && ['1m', '3m', '5m', '15m', '1H', '4H', '1D', '1W'].includes(stored)) {
      return stored;
    }
  } catch (error) {
    console.error('Failed to load timeframe from localStorage:', error);
  }
  return '15m'; // デフォルト値
}

// LocalStorageに時間枠を保存する関数
function saveTimeFrame(timeFrame) {
  try {
    localStorage.setItem(TIMEFRAME_STORAGE_KEY, timeFrame);
  } catch (error) {
    console.error('Failed to save timeframe to localStorage:', error);
  }
}

function App() {
  // LocalStorageから初期値を読み込む
  const [timeFrame, setTimeFrame] = useState(getStoredTimeFrame);
  const [comments, setComments] = useState([]);
  const [sentiment, setSentiment] = useState({ buy_percentage: 50, sell_percentage: 50 });
  const [showPostModal, setShowPostModal] = useState(false);
  const [chartData, setChartData] = useState([]);
  const [wsService, setWsService] = useState(null);
  const [selectedCandle, setSelectedCandle] = useState(null);
  const [connectionError, setConnectionError] = useState(false);
  const [visibleRange, setVisibleRange] = useState({ start: null, end: null });
  
  // 現在の時間枠を保持するRef（クロージャ問題を回避）
  const timeFrameRef = useRef(timeFrame);
  
  // 時間枠が変更されたらRefも更新
  useEffect(() => {
    timeFrameRef.current = timeFrame;
  }, [timeFrame]);

  // 時間枠変更時の処理
  const handleTimeFrameChange = useCallback((newTimeFrame) => {
    console.log('Changing timeframe to:', newTimeFrame);
    setTimeFrame(newTimeFrame);
    saveTimeFrame(newTimeFrame); // LocalStorageに保存
  }, []);

  const loadChartData = useCallback(async (specificTimeFrame) => {
    try {
      // 引数が渡されない場合は、RefまたはStateから現在の時間枠を取得
      const tf = specificTimeFrame || timeFrameRef.current || timeFrame;
      console.log('Loading chart data for timeframe:', tf);
      
      const res = await axios.get(`${API_URL}/api/market/^NDX/${tf}`, {
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
      const tf = specificTimeFrame || timeFrameRef.current || timeFrame;
      const demoData = generateDemoData(tf);
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

  const loadSentiment = useCallback(async (start = null, end = null) => {
    try {
      let url = `${API_URL}/api/sentiment`;
      const params = {};

      // 期間指定があればパラメータ追加
      if (start && end) {
          params.start = Math.floor(start);
          params.end = Math.floor(end);
          console.log(`Loading sentiment for range: ${start} - ${end}`);
      } else {
          console.log('Loading global sentiment');
      }

      const sentimentRes = await axios.get(url, { params });
      console.log('Sentiment data:', sentimentRes.data);
      setSentiment(sentimentRes.data || { buy_percentage: 50, sell_percentage: 50 });
    } catch (error) {
      console.error('Failed to update sentiment:', error);
      setSentiment({ buy_percentage: 60, sell_percentage: 40 });
    }
  }, []);

  // チャートの表示範囲が変更されたときのコールバック
  const handleVisibleRangeChange = useCallback((start, end) => {
      setVisibleRange({ start, end });
      loadSentiment(start, end);
  }, [loadSentiment]);

  const updateChartWithNewPrice = useCallback((newPrice) => {
    setChartData(prevData => {
      if (!prevData || prevData.length === 0) return prevData;
      
      const lastCandle = prevData[prevData.length - 1];
      const now = Math.floor(Date.now() / 1000);
      
      // 時間枠に応じた間隔を計算（Refから取得）
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
      
      const interval = intervals[timeFrameRef.current] || 900;
      
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
  }, []); // 依存配列を空にしてRefを使用

  useEffect(() => {
    // WebSocket接続を初期化
    const wsUrl = API_URL.replace('http', 'ws').replace('https', 'wss');
    console.log('Initializing WebSocket connection to:', `${wsUrl}/ws`);
    
    const ws = new WebSocketService(`${wsUrl}/ws`);
    setWsService(ws);
    
    // 新しいコメントを受信
    ws.on('new_comment', (data) => {
      setComments(prev => {
        const exists = prev.find(c => c.id === data.id);
        if (exists) return prev;
        return [data, ...prev];
      });
      
      // センチメントも更新（現在の表示範囲で）
      // visibleRangeはクロージャで古い可能性があるため、ref等を使うか、
      // ここではシンプルに再取得（ただし依存配列に注意が必要）
      // 今回は簡易的にグローバル更新として扱うか、ステート更新をトリガーにする
      // loadSentiment(visibleRange.start, visibleRange.end); を呼びたいが、
      // 依存関係が複雑になるため、WebSocket更新時は一旦リロードしない、
      // または別途Effectで監視するなどの対策が必要。
      // ここではシンプルに loadSentiment() を呼ぶが、範囲指定はしない（デフォルト挙動）
      // もし範囲維持したいなら、useRefで範囲を保持する。
    });
    
    // コメント保存の確認メッセージ
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

    // 初期データを取得
    const currentTimeFrame = getStoredTimeFrame();
    loadChartData(currentTimeFrame);
    loadComments();
    loadSentiment(); // 初期は全範囲
    
    // 定期更新
    const intervalId = setInterval(() => {
      loadChartData();
      loadComments();
      // 定期更新時はセンチメント更新をスキップ（操作中の邪魔にならないよう）
      // 必要な場合は loadSentiment(currentRangeStart, currentRangeEnd)
    }, 30000);
    
    return () => {
      clearInterval(intervalId);
      ws.close();
    };
  }, []);

  useEffect(() => {
    console.log('Timeframe changed to:', timeFrame);
    loadChartData(timeFrame);
    // 時間枠変更時はセンチメントもリセット（全範囲）するのが自然
    setVisibleRange({ start: null, end: null });
    loadSentiment();
  }, [timeFrame, loadChartData, loadSentiment]);

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
