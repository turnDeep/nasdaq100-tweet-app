import React, { useEffect, useState } from 'react';

const CommentBubble = ({ group, chart }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!chart) return;

    const updatePosition = () => {
      try {
        const timeScale = chart.timeScale();
        const priceScale = chart.priceScale('right');
        
        // タイムスタンプを正しく変換
        const timestamp = new Date(group.timestamp).getTime() / 1000;
        const x = timeScale.timeToCoordinate(timestamp);
        const y = priceScale.priceToCoordinate(group.price);
        
        if (x !== null && y !== null && x >= 0 && y >= 0) {
          setPosition({ x, y });
          setIsVisible(true);
        } else {
          setIsVisible(false);
        }
      } catch (error) {
        console.error('Error updating comment position:', error);
        setIsVisible(false);
      }
    };

    updatePosition();
    
    // チャートの更新を監視
    const timeScale = chart.timeScale();
    const handleVisibleTimeRangeChange = () => updatePosition();
    
    timeScale.subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
    
    // Crosshairの移動も監視
    const handleCrosshairMove = () => updatePosition();
    chart.subscribeCrosshairMove(handleCrosshairMove);
    
    return () => {
      try {
        timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
      } catch (error) {
        console.error('Error unsubscribing:', error);
      }
    };
  }, [group, chart]);

  if (!isVisible) return null;

  // 単一のコメント
  if (group.comments.length === 1) {
    const comment = group.comments[0];
    
    // ランダムな位置オフセット（重なり防止）
    const offsetX = (comment.id % 3 - 1) * 20;
    const offsetY = (comment.id % 2) * 30;
    
    return (
      <div 
        className="comment-bubble comment-bubble-single"
        style={{ 
          left: `${position.x + offsetX}px`, 
          top: `${position.y - 40 + offsetY}px`,
          transform: 'translateX(-50%)',
          zIndex: 100 + (comment.id % 10)
        }}
        onClick={() => setShowDetails(!showDetails)}
      >
        <span className="comment-emoji">{comment.emotion_icon || '💬'}</span>
        <span className="comment-text">
          {showDetails || comment.content.length <= 30 
            ? comment.content 
            : comment.content.substring(0, 30) + '...'}
        </span>
      </div>
    );
  }

  // 複数のコメント（集約表示）
  return (
    <>
      <div 
        className="comment-bubble comment-bubble-aggregated"
        style={{ 
          left: `${position.x}px`, 
          top: `${position.y - 20}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 200
        }}
        onClick={() => setShowDetails(!showDetails)}
      >
        {group.comments.length}+
      </div>
      
      {showDetails && (
        <div 
          className="comment-details"
          style={{ 
            left: `${position.x}px`, 
            top: `${position.y + 30}px`,
            transform: 'translateX(-50%)',
            position: 'absolute',
            background: 'white',
            borderRadius: '1rem',
            padding: '0.75rem',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
            zIndex: 300,
            maxWidth: '250px',
            maxHeight: '200px',
            overflowY: 'auto'
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