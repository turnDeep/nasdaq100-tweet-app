import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';

const CommentBubble = ({ group, chart, series, chartContainer, placedBubbles, onPlacement }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [anchorPosition, setAnchorPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const bubbleRef = useRef(null);
  const updateTimeoutRef = useRef(null);

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
    const lineLength = 80; // 矢印の長さを少し長くする
    
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
            onPlacement(group.comments[0]?.id || `group-${memoizedTimestamp}`, bestPosition);
          }

          setIsVisible(true);

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
  }, [group, chart, series, chartContainer, onPlacement, findBestPosition, memoizedTimestamp]);

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

  // 吹き出しの尻尾を作成（三角形のパス）
  const createSpeechBubbleTail = () => {
    const bubbleX = position.x;
    const bubbleY = position.y + (position.height || 35) / 2;
    
    // 吹き出しの尻尾の形状を定義
    const tailWidth = 12; // 根元の幅
    const tailTipOffset = 5; // 先端のオフセット
    
    // パスを作成（三角形の吹き出し尻尾）
    const path = `
      M ${bubbleX} ${bubbleY - tailWidth/2}
      Q ${(bubbleX + anchorPosition.x) / 2} ${bubbleY}
        ${anchorPosition.x} ${anchorPosition.y + tailTipOffset}
      L ${anchorPosition.x} ${anchorPosition.y - tailTipOffset}
      Q ${(bubbleX + anchorPosition.x) / 2} ${bubbleY}
        ${bubbleX} ${bubbleY + tailWidth/2}
      Z
    `;
    
    return path;
  };

  return (
    <>
      {/* 吹き出しの尻尾（矢印の代わり） */}
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
          <linearGradient id={`gradient-${comment.id}`} x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(94, 234, 212, 0.15)" />
            <stop offset="100%" stopColor="rgba(94, 234, 212, 0.6)" />
          </linearGradient>
        </defs>
        <path
          d={createSpeechBubbleTail()}
          fill={`url(#gradient-${comment.id})`}
          stroke="rgba(94, 234, 212, 0.4)"
          strokeWidth="1"
        />
        {/* 先端の点 */}
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