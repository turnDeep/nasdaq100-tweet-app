import React, { useState, useEffect, useCallback } from 'react';
import Chart from './components/Chart';
import TimeFrameSelector from './components/TimeFrameSelector';
import PositionIndicator from './components/PositionIndicator';
import PostModal from './components/PostModal';
import { WebSocketService } from './services/websocket';
import axios from 'axios';
import './styles/App.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';

function App() {
  const [timeFrame, setTimeFrame] = useState('15m');
  const [comments, setComments] = useState([]);
  const [sentiment, setSentiment] = useState({ buy_percentage: 50, sell_percentage: 50 });
  const [showPostModal, setShowPostModal] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(17000);
  const [chartData, setChartData] = useState([]);
  const [wsService, setWsService] = useState(null);

  const loadChartData = useCallback(async () => {
    try {
      console.log('Loading chart data for timeframe:', timeFrame);
      const res = await axios.get(`${API_URL}/api/market/^NDX/${timeFrame}`);
      if (res.data.data && res.data.data.length > 0) {
        setChartData(res.data.data);
        const latestData = res.data.data[res.data.data.length - 1];
        if (latestData && latestData.close) {
          setCurrentPrice(latestData.close);
        }
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  }, [timeFrame]);

  const loadSentiment = useCallback(async () => {
    try {
      const sentimentRes = await axios.get(`${API_URL}/api/sentiment`);
      setSentiment(sentimentRes.data || { buy_percentage: 50, sell_percentage: 50 });
    } catch (error) {
      console.error('Failed to update sentiment:', error);
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    try {
      console.log('Loading initial data...');
      
      // コメントを取得
      const commentsRes = await axios.get(`${API_URL}/api/comments`);
      console.log('Comments loaded:', commentsRes.data.comments?.length || 0);
      setComments(commentsRes.data.comments || []);
      
      // センチメントを取得
      await loadSentiment();
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  }, [loadSentiment]);

  useEffect(() => {
    // WebSocket接続を初期化
    const wsUrl = API_URL.replace('http', 'ws').replace('https', 'wss');
    console.log('Initializing WebSocket connection to:', `${wsUrl}/ws`);
    
    const ws = new WebSocketService(`${wsUrl}/ws`);
    setWsService(ws);
    
    ws.on('new_comment', (data) => {
      console.log('New comment received:', data);
      setComments(prev => {
        const newComments = [...prev, data];
        console.log('Total comments:', newComments.length);
        return newComments;
      });
      
      // センチメントも更新
      loadSentiment();
    });
    
    ws.on('market_update', (data) => {
      console.log('Market update received:', data);
      if (data && data.price) {
        setCurrentPrice(data.price);
      }
    });

    // 初期データを取得
    loadInitialData();
    loadChartData();
    
    return () => {
      console.log('Cleaning up WebSocket connection');
      ws.close();
    };
  }, [loadInitialData, loadChartData, loadSentiment]);

  useEffect(() => {
    // 時間枠が変更されたらチャートデータを再読み込み
    loadChartData();
  }, [timeFrame, loadChartData]);

  const handlePostComment = async (content, emotionIcon) => {
    console.log('Posting comment:', content, emotionIcon);
    
    if (wsService) {
      wsService.send({
        type: 'post_comment',
        price: currentPrice,
        content: content,
        emotion_icon: emotionIcon
      });
    } else {
      console.error('WebSocket service not initialized');
    }
    
    setShowPostModal(false);
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <span className="logo-icon">📈</span>
          <span className="logo-text">ナスダック100先物</span>
        </div>
        
        <TimeFrameSelector 
          selected={timeFrame} 
          onChange={setTimeFrame} 
        />
        
        <PositionIndicator sentiment={sentiment} />
      </header>
      
      <main className="app-main">
        <div className="current-price">
          現在価格: ${currentPrice.toFixed(2)}
        </div>
        
        <Chart 
          data={chartData}
          comments={comments}
          onPriceUpdate={setCurrentPrice}
        />
        
        <div className="comments-count">
          コメント数: {comments.length}
        </div>
        
        <button 
          className="new-post-button"
          onClick={() => setShowPostModal(true)}
        >
          NEW POST
        </button>
      </main>
      
      {showPostModal && (
        <PostModal
          onClose={() => setShowPostModal(false)}
          onSubmit={handlePostComment}
          currentPrice={currentPrice}
        />
      )}
    </div>
  );
}

export default App;
