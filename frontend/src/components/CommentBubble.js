import React, { useEffect, useState, useRef, useCallback } from 'react';

const CommentBubble = ({ group, chart, series, chartContainer, placedBubbles, onPlacement }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [anchorPosition, setAnchorPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const bubbleRef = useRef(null);

  // 配置済みバブルとの重なりをチェック
  const checkOverlap = useCallback((x, y, width, height) => {
    for (const placed of placedBubbles) {
      if (placed.id === (group.comments[0]?.id || `group-${group.timestamp}`)) continue;
      
      // 重なり判定
      if (x < placed.x + placed.width &&
          x + width > placed.x &&
          y < placed.y + placed.height &&
          y + height > placed.y) {
        return true;
      }
    }
    return false;
  }, [placedBubbles, group]);

  // 最適な配置位置を探す
  const findBestPosition = useCallback((anchorX, anchorY, containerWidth, containerHeight) => {
    const comment = group.comments[0];
    const contentLength = comment.content.length;
    const width = Math.min(Math.max(contentLength * 8 + 40, 120), 250);
    const height = 35;
    const lineLength = 60; // 矢印の長さ
    
    // 複数の配置候補を試す
    const positions = [
      // 右側配置
      { x: anchorX + lineLength, y: anchorY - height / 2, side: 'right' },
      // 左側配置
      { x: anchorX - lineLength - width, y: anchorY - height / 2, side: 'left' },
      // 右上配置
      { x: anchorX + lineLength, y: anchorY - height - 20, side: 'right-top' },
      // 右下配置
      { x: anchorX + lineLength, y: anchorY + 20, side: 'right-bottom' },
      // 左上配置
      { x: anchorX - lineLength - width, y: anchorY - height - 20, side: 'left-top' },
      // 左下配置
      { x: anchorX - lineLength - width, y: anchorY + 20, side: 'left-bottom' },
    ];
    
    for (const pos of positions) {
      // 画面内に収まるか確認
      const adjustedX = Math.max(10, Math.min(pos.x, containerWidth - width - 10));
      const adjustedY = Math.max(10, Math.min(pos.y, containerHeight - height - 10));
      
      // 重なりチェック
      if (!checkOverlap(adjustedX, adjustedY, width, height)) {
        return { x: adjustedX, y: adjustedY, width, height, side: pos.side };
      }
    }
    
    // 重ならない位置が見つからない場合は、少しずらして配置
    const offsetY = placedBubbles.length * 40;
    return {
      x: Math.max(10, Math.min(anchorX + lineLength, containerWidth - width - 10)),
      y: Math.max(10, Math.min(anchorY - height / 2 + offsetY, containerHeight - height - 10)),
      width,
      height,
      side: 'right'
    };
  }, [checkOverlap, placedBubbles, group]);

  useEffect(() => {
    if (!chart || !series || !chartContainer || !group) {
      console.log('CommentBubble: Missing required props');
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
        
        const x = timeScale.timeToCoordinate(timestamp);
        const y = series.priceToCoordinate(group.price);
        
        if (x === null || y === null || x === undefined || y === undefined) {
          console.warn('CommentBubble: Could not get coordinates');
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

        // 最適な位置を見つける
        const bestPosition = findBestPosition(
          roundedX,
          roundedY,
          chartContainer.clientWidth,
          chartContainer.clientHeight
        );
        
        setPosition({
          x: bestPosition.x,
          y: bestPosition.y,
          width: bestPosition.width,
          height: bestPosition.height,
          side: bestPosition.side
        });

        if (onPlacement) {
          onPlacement(group.comments[0]?.id || `group-${timestamp}`, bestPosition);
        }

        setIsVisible(true);

      } catch (error) {
        console.error('CommentBubble: Error updating position:', error);
        setIsVisible(false);
      }
    };

    updatePosition();
    
    const timeScale = chart.timeScale();
    const handleVisibleRangeChange = () => {
      updatePosition();
    };
    
    timeScale.subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    };
  }, [group, chart, series, chartContainer, onPlacement, findBestPosition]);

  if (!isVisible) {
    return null;
  }

  const comment = group.comments[0];
  const lineLength = 60; // 矢印の長さ

  // 矢印の終点を計算（左から伸ばす）
  const lineEnd = {
    x: position.x,
    y: position.y + (position.height || 35) / 2
  };

  return (
    <>
      {/* アンカーライン（左から伸ばす） */}
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
          stroke="rgba(94, 234, 212, 0.8)"
          strokeWidth="1.5"
          opacity="0.8"
        />
      </svg>

      {/* コメントバブル */}
      <div 
        ref={bubbleRef}
        className="comment-bubble-modern"
        style={{ 
          position: 'absolute',
          left: `${position.x}px`, 
          top: `${position.y}px`,
          width: `${position.width}px`,
          zIndex: 1000,
          pointerEvents: 'auto'
        }}
        onClick={() => setShowDetails(!showDetails)}
      >
        {/* 単一コメント */}
        {group.comments.length === 1 ? (
          <>
            <span className="bubble-emoji">
              {comment.emotion_icon || ''}
            </span>
            <span className="bubble-text">
              {comment.content}
            </span>
          </>
        ) : (
          /* 集約コメント */
          <>
            <div className="bubble-aggregated">
              <span className="bubble-count">{group.comments.length}件</span>
              <span className="bubble-preview">
                {group.comments[0].emotion_icon} {group.comments[0].content.substring(0, 20)}...
              </span>
            </div>
            
            {showDetails && (
              <div className="bubble-details">
                {group.comments.map((c, idx) => (
                  <div key={c.id || idx} className="detail-item">
                    <span className="detail-emoji">{c.emotion_icon || ''}</span>
                    <span className="detail-text">{c.content}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </>
  );
};

export default CommentBubble;
