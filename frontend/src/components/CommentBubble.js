import React, { useEffect, useState } from 'react';

const CommentBubble = ({ group, chart, chartContainer }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(true); // デフォルトで表示
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    if (!chart || !chartContainer) {
      console.log('Chart or container not ready');
      return;
    }

    const updatePosition = () => {
      try {
        const timeScale = chart.timeScale();
        const priceScale = chart.priceScale('right');
        
        // タイムスタンプを正しく変換
        const timestamp = new Date(group.timestamp).getTime() / 1000;
        const x = timeScale.timeToCoordinate(timestamp);
        const y = priceScale.priceToCoordinate(group.price);
        
        // デバッグログ
        console.log(`Comment position - timestamp: ${timestamp}, price: ${group.price}, x: ${x}, y: ${y}`);
        
        if (x !== null && y !== null) {
          setPosition({ x: x || 0, y: y || 0 });
          setIsVisible(true);
        } else {
          // 座標が取得できない場合でも、とりあえず表示
          console.log('Could not get coordinates, using defaults');
          // チャートの中央付近に配置
          const containerWidth = chartContainer.clientWidth;
          const containerHeight = chartContainer.clientHeight;
          setPosition({ 
            x: containerWidth * 0.8, // 右寄りに配置
            y: containerHeight * 0.5  // 中央の高さ
          });
          setIsVisible(true);
        }
      } catch (error) {
        console.error('Error updating comment position:', error);
        // エラー時でも表示を試みる
        setIsVisible(true);
        setPosition({ x: 100, y: 100 }); // デフォルト位置
      }
    };

    // 初回更新
    updatePosition();
    
    // チャートの更新を監視
    const timeScale = chart.timeScale();
    const handleVisibleTimeRangeChange = () => updatePosition();
    
    try {
      timeScale.subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
    } catch (error) {
      console.error('Error subscribing to time range change:', error);
    }
    
    // Crosshairの移動も監視
    const handleCrosshairMove = () => updatePosition();
    
    try {
      chart.subscribeCrosshairMove(handleCrosshairMove);
    } catch (error) {
      console.error('Error subscribing to crosshair move:', error);
    }
    
    // 定期的に位置を更新（フォールバック）
    const intervalId = setInterval(updatePosition, 1000);
    
    return () => {
      clearInterval(intervalId);
      try {
        timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
        chart.unsubscribeCrosshairMove(handleCrosshairMove);
      } catch (error) {
        console.error('Error unsubscribing:', error);
      }
    };
  }, [group, chart, chartContainer]);

  if (!isVisible) {
    console.log('Comment bubble not visible');
    return null;
  }

  // 単一のコメント
  if (group.comments.length === 1) {
    const comment = group.comments[0];
    
    // コメントを右側に配置するためのオフセット
    const offsetX = 10;
    const offsetY = -10;
    
    return (
      <div 
        className="comment-bubble comment-bubble-single"
        style={{ 
          position: 'absolute',
          left: `${position.x + offsetX}px`, 
          top: `${position.y + offsetY}px`,
          transform: 'none',
          zIndex: 100 + (comment.id % 10),
          pointerEvents: 'auto'
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
          position: 'absolute',
          left: `${position.x}px`, 
          top: `${position.y}px`,
          transform: 'translate(-50%, -50%)',
          zIndex: 200,
          pointerEvents: 'auto'
        }}
        onClick={() => setShowDetails(!showDetails)}
      >
        {group.comments.length}+
      </div>
      
      {showDetails && (
        <div 
          className="comment-details"
          style={{ 
            position: 'absolute',
            left: `${position.x}px`, 
            top: `${position.y + 30}px`,
            transform: 'translateX(-50%)',
            background: 'white',
            borderRadius: '1rem',
            padding: '0.75rem',
            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.15)',
            zIndex: 300,
            maxWidth: '250px',
            maxHeight: '200px',
            overflowY: 'auto',
            pointerEvents: 'auto'
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