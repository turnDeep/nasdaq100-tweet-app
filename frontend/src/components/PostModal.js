import React, { useState, useEffect } from 'react';

const PostModal = ({ onClose, onSubmit, candleData }) => {
  const [content, setContent] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState(null);
  const [customPrice, setCustomPrice] = useState(candleData?.price?.toFixed(2) || '0.00');
  
  const emotions = ['😊', '😢', '🤔', '😡', '😎', '🚀'];

  useEffect(() => {
    // candleDataが変更されたら価格を更新
    if (candleData?.price) {
      setCustomPrice(candleData.price.toFixed(2));
    }
  }, [candleData]);

  const handleSubmit = () => {
    if (content.trim()) {
      const price = parseFloat(customPrice);
      if (!isNaN(price) && price > 0) {
        onSubmit(content, selectedEmotion, price);
        setContent('');
        setSelectedEmotion(null);
        setCustomPrice('0.00');
      } else {
        alert('有効な価格を入力してください');
      }
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '';
    
    const date = new Date(timestamp * 1000);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    
    return `${year}/${month}/${day} ${hours}:${minutes}`;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">新規投稿</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          <div className="selected-time-info">
            <div className="selected-time-label">選択した時間</div>
            <div className="selected-time-value">
              {formatTime(candleData?.time)}
            </div>
          </div>
          
          <div className="selected-price-info">
            <div className="selected-price-label">投稿価格（編集可能）</div>
            <input
              type="number"
              className="selected-price-input"
              value={customPrice}
              onChange={(e) => setCustomPrice(e.target.value)}
              step="0.01"
              min="0"
            />
          </div>
          
          {candleData && (
            <div className="candle-info">
              <div className="candle-info-prices">
                <div className="price-item">
                  <span className="price-label">始値:</span>
                  <span className="price-value">${candleData.open?.toFixed(2)}</span>
                </div>
                <div className="price-item">
                  <span className="price-label">高値:</span>
                  <span className="price-value high">${candleData.high?.toFixed(2)}</span>
                </div>
                <div className="price-item">
                  <span className="price-label">安値:</span>
                  <span className="price-value low">${candleData.low?.toFixed(2)}</span>
                </div>
                <div className="price-item">
                  <span className="price-label">終値:</span>
                  <span className="price-value close">${candleData.close?.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
          
          <textarea
            className="comment-input"
            placeholder="このポイントについてコメントを入力..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            maxLength={200}
            autoFocus
          />
          
          <div className="emotion-selector">
            {emotions.map((emotion) => (
              <button
                key={emotion}
                className={`emotion-option ${selectedEmotion === emotion ? 'selected' : ''}`}
                onClick={() => setSelectedEmotion(emotion)}
              >
                {emotion}
              </button>
            ))}
          </div>
        </div>
        
        <div className="modal-actions">
          <button className="button button-secondary" onClick={onClose}>
            キャンセル
          </button>
          <button 
            className="button button-primary" 
            onClick={handleSubmit}
            disabled={!content.trim()}
          >
            投稿
          </button>
        </div>
      </div>
    </div>
  );
};

export default PostModal;