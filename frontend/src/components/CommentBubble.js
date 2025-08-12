import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';

const CommentBubble = ({ group, chart, series, chartContainer }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [anchorPosition, setAnchorPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const bubbleRef = useRef(null);
  const updateTimeoutRef = useRef(null);

  // タイムスタンプの正規化（常に秒単位のUNIXタイムスタンプを返す）
  const normalizeTimestamp = useCallback((timestamp) => {
    if (typeof timestamp === 'number') {
      // ミリ秒の場合は秒に変換
      return timestamp > 1000000000000 ? Math.floor(timestamp / 1000) : timestamp;
    } else if (typeof timestamp === 'string') {
      const parsed = Date.parse(timestamp);
      if (!isNaN(parsed)) {
        return Math.floor(parsed / 1000);
      }
    }
    return null;
  }, []);

  // メモ化されたタイムスタンプ
  const memoizedTimestamp = useMemo(() => {
    return normalizeTimestamp(group.timestamp);
  }, [group.timestamp, normalizeTimestamp]);

  useEffect(() => {
    if (!chart || !series || !chartContainer || !group) {
      console.log('CommentBubble: Missing required props');
      setIsVisible(false);
      return;
    }

    // デバウンス処理を追加して過度な更新を防ぐ
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }

    updateTimeoutRef.current = setTimeout(() => {
      const updatePosition = () => {
        try {
          const timeScale = chart.timeScale();
          
          if (!timeScale || !series) {
            console.warn('CommentBubble: Chart scales or series not available');
            setIsVisible(false);
            return;
          }
          
          if (memoizedTimestamp === null) {
            console.error('CommentBubble: Invalid timestamp:', group.timestamp);
            setIsVisible(false);
            return;
          }
          
          // 座標を取得
          const x = timeScale.timeToCoordinate(memoizedTimestamp);
          const y = series.priceToCoordinate(group.price);
          
          if (x === null || y === null || x === undefined || y === undefined) {
            // エラーメッセージを抑制（通常の動作の一部）
            setIsVisible(false);
            return;
          }

          // 表示範囲チェック
          const visibleRange = timeScale.getVisibleRange();
          if (visibleRange && (memoizedTimestamp < visibleRange.from || memoizedTimestamp > visibleRange.to)) {
            setIsVisible(false);
            return;
          }

          // ★★★ 座標のオフセット補正を追加 ★★★
          // lightweight-chartsの内部パディングを補正
          const CHART_OFFSET_X = 33;  // 右に30px補正
          const CHART_OFFSET_Y = 63;  // 下に60px補正
          
          const roundedX = Math.round(x + CHART_OFFSET_X);
          const roundedY = Math.round(y + CHART_OFFSET_Y);
          
          setAnchorPosition({ x: roundedX, y: roundedY });

          // バブルの配置（右上に配置）
          const comment = group.comments[0];
          const contentLength = comment.content.length;
          const width = Math.min(Math.max(contentLength * 8 + 40, 120), 250);
          const height = 35;
          
          // 右上に配置
          const offsetX = 60;  // 右に60px
          const offsetY = -40; // 上に40px
          
          const bubbleX = roundedX + offsetX;
          const bubbleY = roundedY + offsetY;
          
          // 画面内に収まるように調整
          const adjustedX = Math.max(10, Math.min(bubbleX, chartContainer.clientWidth - width - 10));
          const adjustedY = Math.max(10, Math.min(bubbleY, chartContainer.clientHeight - height - 10));
          
          setPosition({
            x: adjustedX,
            y: adjustedY,
            width: width,
            height: height
          });

          setIsVisible(true);

          // デバッグ用ログ
          console.log('CommentBubble position debug:', {
            originalX: x,
            originalY: y,
            correctedX: roundedX,
            correctedY: roundedY,
            timestamp: memoizedTimestamp,
            price: group.price
          });

        } catch (error) {
          console.error('CommentBubble: Error updating position:', error);
          setIsVisible(false);
        }
      };

      updatePosition();
    }, 50); // 50msのデバウンス

    // クリーンアップ
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [group, chart, series, chartContainer, memoizedTimestamp]);

  // 表示範囲変更の監視
  useEffect(() => {
    if (!chart) return;

    const timeScale = chart.timeScale();
    const handleVisibleRangeChange = () => {
      if (!memoizedTimestamp) return;
      
      const visibleRange = timeScale.getVisibleRange();
      if (visibleRange) {
        const isInRange = memoizedTimestamp >= visibleRange.from && memoizedTimestamp <= visibleRange.to;
        if (!isInRange && isVisible) {
          setIsVisible(false);
        } else if (isInRange && !isVisible) {
          // 再度位置を計算する必要がある場合
          const x = timeScale.timeToCoordinate(memoizedTimestamp);
          const y = series?.priceToCoordinate(group.price);
          if (x !== null && y !== null) {
            setIsVisible(true);
          }
        }
      }
    };
    
    timeScale.subscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    
    return () => {
      timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleRangeChange);
    };
  }, [chart, series, group.price, isVisible, memoizedTimestamp]);

  if (!isVisible) {
    return null;
  }

  const comment = group.comments[0];

  // シンプルな三角形の吹き出し尻尾を作成（左側から）
  const createSpeechBubbleTail = () => {
    // バブルの左下角から
    const bubbleX = position.x;
    const bubbleY = position.y + position.height / 2;
    
    // 三角形の頂点（ローソク足の位置）
    const tipX = anchorPosition.x;
    const tipY = anchorPosition.y;
    
    // 三角形の基部の幅
    const baseWidth = 12;
    
    // パスを作成（シンプルな三角形、左側から出る）
    const path = `
      M ${bubbleX} ${bubbleY - baseWidth/2}
      L ${tipX} ${tipY}
      L ${bubbleX} ${bubbleY + baseWidth/2}
      Z
    `;
    
    return path;
  };

  return (
    <>
      {/* 吹き出しの尻尾（シンプルな三角形） */}
      <svg 
        className="speech-bubble-tail-svg"
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
        <defs>
          <linearGradient id={`gradient-${comment.id}`} x1="100%" y1="0%" x2="0%" y2="0%">
            <stop offset="0%" stopColor="rgba(94, 234, 212, 0.6)" />
            <stop offset="100%" stopColor="rgba(94, 234, 212, 0.15)" />
          </linearGradient>
        </defs>
        <path
          d={createSpeechBubbleTail()}
          fill={`url(#gradient-${comment.id})`}
          stroke="rgba(94, 234, 212, 0.3)"
          strokeWidth="0.5"
        />
        {/* 先端に小さな点を追加（デバッグ用にも便利） */}
        <circle
          cx={anchorPosition.x}
          cy={anchorPosition.y}
          r="3"
          fill="rgba(94, 234, 212, 0.8)"
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