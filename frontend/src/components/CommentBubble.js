import React, { useEffect, useState } from 'react';

const CommentBubble = ({ group, chart }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (!chart) return;

    const updatePosition = () => {
      try {
        const timeScale = chart.timeScale();
        const priceScale = chart.priceScale('right');
        
        const x = timeScale.timeToCoordinate(new Date(group.timestamp).getTime() / 1000);
        const y = priceScale.priceToCoordinate(group.price);
        
        if (x !== null && y !== null) {
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
    
    return () => {
      try {
        timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
      } catch (error) {
        console.error('Error unsubscribing:', error);
      }
    };
  }, [group, chart]);

  if (!isVisible) return null;

  if (group.comments.length === 1) {
    const comment = group.comments[0];
    return (
      <div 
        className="comment-bubble comment-bubble-single"
        style={{ 
          left: `${position.x}px`, 
          top: `${position.y}px`,
          transform: 'translate(-50%, -100%)'
        }}
      >
        <span className="comment-emoji">{comment.emotion_icon || '💬'}</span>
        <span className="comment-text">{comment.content}</span>
      </div>
    );
  }

  return (
    <div 
      className="comment-bubble comment-bubble-aggregated"
      style={{ 
        left: `${position.x}px`, 
        top: `${position.y}px`,
        transform: 'translate(-50%, -50%)'
      }}
    >
      +{group.comments.length}
    </div>
  );
};

export default CommentBubble;