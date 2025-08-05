import React, { useState, useEffect } from 'react';
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
  const [currentPrice, setCurrentPrice] = useState(0);
  const [chartData, setChartData] = useState([]);

  useEffect(() => {
    // WebSocket接続を初期化
    const ws = new WebSocketService(`${API_URL.replace('http', 'ws')}/ws`);

    ws.on('new_comment', (data) => {
      setComments(prev => [...prev, data]);
    });

    ws.on('market_update', (data) => {
      setCurrentPrice(data.price);
    });

    // 初期データを取得
    loadInitialData();

    return () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    // 時間枠が変更されたらチャートデータを再読み込み
    loadChartData();
  }, [timeFrame]);

  const loadInitialData = async () => {
    try {
      // コメントを取得
      const commentsRes = await axios.get(`${API_URL}/api/comments`);
      setComments(commentsRes.data.comments);

      // センチメントを取得
      const sentimentRes = await axios.get(`${API_URL}/api/sentiment`);
      setSentiment(sentimentRes.data);
    } catch (error) {
      console.error('Failed to load initial data:', error);
    }
  };

  const loadChartData = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/market/^NDX/${timeFrame}`);
      setChartData(res.data.data);
    } catch (error) {
      console.error('Failed to load chart data:', error);
    }
  };

  const handlePostComment = async (content, emotionIcon) => {
    const ws = WebSocketService.getInstance();
    ws.send({
      type: 'post_comment',
      price: currentPrice,
      content: content,
      emotion_icon: emotionIcon
    });
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
