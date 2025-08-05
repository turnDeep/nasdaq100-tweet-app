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
  const [currentPrice, setCurrentPrice] = useState(17000); // デフォルト値を設定
  const [chartData, setChartData] = useState([]);

  const loadChartData = useCallback(async () => {
    try {
      const res = await axios.get(`${API_URL}/api/market/^NDX/${timeFrame}`);
      if (res.data.data && res.data.data.length > 0) {
        setChartData(res.data.data);
        // 最新価格を設定
        const latestData = res.data.data[res.data.data.length - 1];
        if (latestData && latestData.close) {
          setCurrentPrice(latestData.close);
        }
      }
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  }, [timeFrame]);

  const loadInitialData = async () => {
    try {
      // コメントを取得
      const commentsRes = await axios.get(`${API_URL}/api/comments`);
      setComments(commentsRes.data.comments || []);
      
      // センチメントを取得
      const sentimentRes = await axios.get(`${API_URL}/api/sentiment`);
      setSentiment(sentimentRes.data || { buy_percentage: 50, sell_percentage: 50 });
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  useEffect(() => {
    // WebSocket接続を初期化
    const wsUrl = API_URL.replace('http', 'ws').replace('https', 'wss');
    const ws = new WebSocketService(`${wsUrl}/ws`);
    
    ws.on('new_comment', (data) => {
      setComments(prev => [...prev, data]);
    });
    
    ws.on('market_update', (data) => {
      if (data && data.price) {
        setCurrentPrice(data.price);
      }
    });

    // 初期データを取得
    loadInitialData();
    loadChartData();
    
    return () => {
      ws.close();
    };
  }, [loadChartData]);

  useEffect(() => {
    // 時間枠が変更されたらチャートデータを再読み込み
    loadChartData();
  }, [timeFrame, loadChartData]);

  const handlePostComment = async (content, emotionIcon) => {
    const ws = WebSocketService.getInstance();
    if (ws) {
      ws.send({
        type: 'post_comment',
        price: currentPrice,
        content: content,
        emotion_icon: emotionIcon
      });
    }
    setShowPostModal(false);
    
    // センチメントを更新
    setTimeout(async () => {
      try {
        const sentimentRes = await axios.get(`${API_URL}/api/sentiment`);
        setSentiment(sentimentRes.data || { buy_percentage: 50, sell_percentage: 50 });
      } catch (error) {
        console.error('Failed to update sentiment:', error);
      }
    }, 500);
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
        <Chart 
          data={chartData}
          comments={comments}
          onPriceUpdate={setCurrentPrice}
        />
        
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
