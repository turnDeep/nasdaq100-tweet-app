import React, { useEffect, useState } from 'react';

const CommentBubble = ({ group, chart, chartContainer }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!chart || !chartContainer || !group) {
      setIsVisible(false);
      return;
    }

    const updatePosition = () => {
      try {
        const timeScale = chart.timeScale();
        const priceScale = chart.priceScale('right');
        
        let timestamp;
        if (typeof group.timestamp === 'number') {
          timestamp = group.timestamp > 1000000000000 ? Math.floor(group.timestamp / 1000) : group.timestamp;
        } else if (typeof group.timestamp === 'string') {
          const parsed = Date.parse(group.timestamp);
          if (!isNaN(parsed)) {
            timestamp = Math.floor(parsed / 1000);
          } else {
            console.error('CommentBubble: Invalid timestamp string:', group.timestamp);
            setIsVisible(false);
            return;
          }
        } else {
          console.error('CommentBubble: Unknown timestamp format:', group.timestamp);
          setIsVisible(false);
          return;
        }
        
        // 座標を計算
        const x = timeScale.timeToCoordinate(timestamp);
        const y = priceScale.priceToCoordinate(group.price);
        
        // 座標が取得できない場合は非表示
        if (x === null || y === null) {
          setIsVisible(false);
          return;
        }

        // 表示範囲チェックも追加
        const visibleRange = timeScale.getVisibleRange();
        if (visibleRange && (timestamp < visibleRange.from || timestamp > visibleRange.to)) {
          setIsVisible(false);
          return;
        }

        setPosition({ x: Math.round(x), y: Math.round(y) });
        setIsVisible(true);

      } catch (error) {
        console.error('CommentBubble: Error updating position:', error);
        setIsVisible(false);
      }
    };

    updatePosition();
    
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleTimeRangeChange(updatePosition);
    
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(updatePosition);
    };
  }, [group, chart, chartContainer]);

  if (!isVisible) {
    console.log('CommentBubble: Not rendering (not visible)');
    return null;
  }

  // 単一のコメント
  if (group.comments.length === 1) {
    const comment = group.comments[0];
    
    console.log('CommentBubble: Rendering single comment at position:', position);
    
    return (
      <div 
        className="comment-bubble comment-bubble-single"
        style={{ 
          position: 'absolute',
          left: `${position.x}px`, 
          top: `${position.y - 30}px`, // 上に配置
          transform: 'translateX(-50%)',
          zIndex: 1000, // 高いz-indexを設定
          pointerEvents: 'auto',
          // デバッグ用の背景色
          background: 'rgba(255, 255, 255, 0.95)',
          border: '2px solid #7dd3c0',
          borderRadius: '20px',
          padding: '0.4rem 0.8rem',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)'
        }}
        onClick={() => setShowDetails(!showDetails)}
      >
        <span className="comment-emoji" style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>
          {comment.emotion_icon || '💬'}
        </span>
        <span className="comment-text" style={{ fontSize: '0.85rem', color: '#1f2937' }}>
          {showDetails || comment.content.length <= 30 
            ? comment.content 
            : comment.content.substring(0, 30) + '...'}
        </span>
      </div>
    );
  }

  // 複数のコメント（集約表示）
  console.log('CommentBubble: Rendering aggregated comments at position:', position);
  
  return (
    <>
      <div 
        className="comment-bubble comment-bubble-aggregated"
        style={{ 
          position: 'absolute',
          left: `${position.x}px`, 
          top: `${position.y - 30}px`,
          transform: 'translateX(-50%)',
          zIndex: 1000,
          pointerEvents: 'auto',
          // デバッグ用のスタイル
          background: 'linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)',
          color: 'white',
          fontWeight: 'bold',
          padding: '0.6rem',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '0.85rem',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.15)'
        }}
        onClick={() => setShowDetails(!showDetails)}
      >
        {group.comments.length}+
      </div>
      
      {showDetails && (
        <div 
          style={{ 
            position: 'absolute',
            left: `${position.x}px`, 
            top: `${position.y + 20}px`,
            transform: 'translateX(-50%)',
            background: 'white',
            borderRadius: '1rem',
            padding: '0.75rem',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
            zIndex: 1001,
            maxWidth: '250px',
            maxHeight: '200px',
            overflowY: 'auto',
            pointerEvents: 'auto',
            border: '1px solid #e5e7eb'
          }}
        >
          {group.comments.map((comment, idx) => (
            <div key={comment.id || idx} style={{ 
              marginBottom: '0.5rem',
              paddingBottom: '0.5rem',
              borderBottom: idx < group.comments.length - 1 ? '1px solid #e5e7eb' : 'none'
            }}>
              <span style={{ fontSize: '1.2rem', marginRight: '0.5rem' }}>
                {comment.emotion_icon || '💬'}
              </span>
              <span style={{ fontSize: '0.85rem', color: '#1f2937' }}>
                {comment.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default CommentBubble;