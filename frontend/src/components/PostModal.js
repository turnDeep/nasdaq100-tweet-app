import React, { useState } from 'react';

const PostModal = ({ onClose, onSubmit, currentPrice, candleInfo }) => {
  const [content, setContent] = useState('');
  const [selectedEmotion, setSelectedEmotion] = useState(null);
  
  const emotions = ['😊', '😢', '🤔', '😡', '😎', '🚀'];

  const handleSubmit = () => {
    if (content.trim()) {
      onSubmit(content, selectedEmotion);
      setContent('');
      setSelectedEmotion(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">新規投稿</h2>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-content">
          <div className="selected-price-info">
            <div className="selected-price-label">選択した価格</div>
            <div className="selected-price-value">
              ${currentPrice.toFixed(2)}
            </div>
          </div>
          
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