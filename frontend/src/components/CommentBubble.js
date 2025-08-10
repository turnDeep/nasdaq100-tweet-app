import React, { useEffect, useState, useRef, useCallback } from 'react';

const CommentBubble = ({ group, chart, series, chartContainer, onPlacement }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [anchorPosition, setAnchorPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [placement, setPlacement] = useState('top');
  const bubbleRef = useRef(null);

  const BUBBLE_WIDTH = 200;
  const BUBBLE_HEIGHT = 60;
  const MARGIN = 20;

  useEffect(() => {
    if (!chart || !series || !chartContainer || !group) {
      console.log('CommentBubble: Missing required props', { chart, series, chartContainer, group });
      setIsVisible(false);
      return;
    }

    const updatePosition = () => {
      try {
        const timeScale = chart.timeScale();
        
        if (!timeScale || !series) {
          console.warn('CommentBubble: Chart scales or series not available');
          setIsVisible(false);
          return;
        }
        
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
        
        console.log('CommentBubble: Processing comment at timestamp:', timestamp, 'price:', group.price);
        
        const x = timeScale.timeToCoordinate(timestamp);
        const y = series.priceToCoordinate(group.price);
        
        console.log('CommentBubble: Coordinates - x:', x, 'y:', y);
        
        if (x === null || y === null || x === undefined || y === undefined) {
          console.warn('CommentBubble: Could not get coordinates for timestamp:', timestamp, 'price:', group.price);
          setIsVisible(false);
          return;
        }

        const visibleRange = timeScale.getVisibleRange();
        if (visibleRange && (timestamp < visibleRange.from || timestamp > visibleRange.to)) {
          console.log('CommentBubble: Comment outside visible range');
          setIsVisible(false);
          return;
        }

        const roundedX = Math.round(x);
        const roundedY = Math.round(y);
        setAnchorPosition({ x: roundedX, y: roundedY });

        const simplePosition = {
          x: Math.round(Math.min(Math.max(10, roundedX - BUBBLE_WIDTH / 2), chartContainer.clientWidth - BUBBLE_WIDTH - 10)),
          y: Math.round(Math.max(10, roundedY - BUBBLE_HEIGHT - MARGIN))
        };
        
        setPosition(simplePosition);
        setPlacement('top');

        if (onPlacement) {
          onPlacement(group.comments[0]?.id || `group-${timestamp}`, {
            x: simplePosition.x,
            y: simplePosition.y,
            width: BUBBLE_WIDTH,
            height: BUBBLE_HEIGHT
          });
        }

        console.log('CommentBubble: Setting visible at position:', simplePosition);
        setIsVisible(true);

      } catch (error) {
        console.error('CommentBubble: Error updating position:', error);
        setIsVisible(false);
      }
    };

    updatePosition();
    
    const timeScale = chart.timeScale();
    const handleVisibleRangeChange = () => {
      console.log('CommentBubble: Visible range changed, updating position');
      updatePosition();
    };
    
    timeScale.subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    };
  }, [group, chart, series, chartContainer, onPlacement, BUBBLE_WIDTH, BUBBLE_HEIGHT, MARGIN]);

  // アンカーラインの端点を計算
  const getLineEndpoint = () => {
    switch (placement) {
      case 'top':
        return { x: position.x + BUBBLE_WIDTH / 2, y: position.y + BUBBLE_HEIGHT };
      case 'bottom':
        return { x: position.x + BUBBLE_WIDTH / 2, y: position.y };
      case 'left':
        return { x: position.x + BUBBLE_WIDTH, y: position.y + BUBBLE_HEIGHT / 2 };
      case 'right':
        return { x: position.x, y: position.y + BUBBLE_HEIGHT / 2 };
      case 'top-left':
        return { x: position.x + BUBBLE_WIDTH, y: position.y + BUBBLE_HEIGHT };
      case 'top-right':
        return { x: position.x, y: position.y + BUBBLE_HEIGHT };
      case 'bottom-left':
        return { x: position.x + BUBBLE_WIDTH, y: position.y };
      case 'bottom-right':
        return { x: position.x, y: position.y };
      default:
        return { x: position.x + BUBBLE_WIDTH / 2, y: position.y + BUBBLE_HEIGHT / 2 };
    }
  };

  if (!isVisible) {
    console.log('CommentBubble: Not visible, not rendering');
    return null;
  }

  const lineEnd = getLineEndpoint();
  const comment = group.comments[0];

  console.log('CommentBubble: Rendering at position:', position, 'anchor:', anchorPosition);

  return (
    <>
      {/* アンカーライン */}
      <svg 
        className="anchor-line-svg"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 999
        }}
      >
        <line
          x1={anchorPosition.x}
          y1={anchorPosition.y}
          x2={lineEnd.x}
          y2={lineEnd.y}
          stroke="#7dd3c0"
          strokeWidth="1"
          strokeDasharray="2,2"
          opacity="0.6"
        />
        <circle
          cx={anchorPosition.x}
          cy={anchorPosition.y}
          r="3"
          fill="#7dd3c0"
          opacity="0.8"
        />
      </svg>

      {/* コメントバブル */}
      <div 
        ref={bubbleRef}
        className={`comment-bubble-advanced ${placement}`}
        style={{ 
          position: 'absolute',
          left: `${position.x}px`, 
          top: `${position.y}px`,
          width: `${BUBBLE_WIDTH}px`,
          zIndex: 1000,
          pointerEvents: 'auto'
        }}
        onClick={() => setShowDetails(!showDetails)}
      >
        {/* 単一コメント */}
        {group.comments.length === 1 ? (
          <div className="bubble-content">
            <span className="bubble-emoji">
              {comment.emotion_icon || '💬'}
            </span>
            <span className="bubble-text">
              {showDetails || comment.content.length <= 50 
                ? comment.content 
                : comment.content.substring(0, 50) + '...'}
            </span>
          </div>
        ) : (
          /* 集約コメント */
          <>
            <div className="bubble-content aggregated">
              <span className="bubble-count">{group.comments.length}件</span>
              <span className="bubble-preview">
                {group.comments[0].emotion_icon} {group.comments[0].content.substring(0, 20)}...
              </span>
            </div>
            
            {showDetails && (
              <div className="bubble-details">
                {group.comments.map((c, idx) => (
                  <div key={c.id || idx} className="detail-item">
                    <span className="detail-emoji">{c.emotion_icon || '💬'}</span>
                    <span className="detail-text">{c.content}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* 吹き出しの尻尾（方向に応じて表示） */}
        <div className={`bubble-tail tail-${placement}`}></div>
      </div>
    </>
  );
};

export default CommentBubble;
