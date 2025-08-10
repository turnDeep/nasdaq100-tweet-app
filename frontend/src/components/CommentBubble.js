import React, { useEffect, useState, useRef } from 'react';

const CommentBubble = ({ group, chart, chartContainer, chartData, placedBubbles, onPlacement }) => {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [anchorPosition, setAnchorPosition] = useState({ x: 0, y: 0 });
  const [isVisible, setIsVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [placement, setPlacement] = useState('top'); // 配置方向
  const bubbleRef = useRef(null);

  // バブルのサイズ（推定値）
  const BUBBLE_WIDTH = 200;
  const BUBBLE_HEIGHT = 60;
  const MARGIN = 20; // ローソク足との余白
  const LINE_MARGIN = 5; // アンカーラインの余白

  // 8方向の候補位置を計算
  const calculateCandidatePositions = (anchorX, anchorY) => {
    return [
      { 
        direction: 'top',
        x: anchorX - BUBBLE_WIDTH / 2,
        y: anchorY - BUBBLE_HEIGHT - MARGIN,
        score: 10 // 優先度高
      },
      {
        direction: 'bottom',
        x: anchorX - BUBBLE_WIDTH / 2,
        y: anchorY + MARGIN,
        score: 10 // 優先度高
      },
      {
        direction: 'left',
        x: anchorX - BUBBLE_WIDTH - MARGIN,
        y: anchorY - BUBBLE_HEIGHT / 2,
        score: 5
      },
      {
        direction: 'right',
        x: anchorX + MARGIN,
        y: anchorY - BUBBLE_HEIGHT / 2,
        score: 5
      },
      {
        direction: 'top-left',
        x: anchorX - BUBBLE_WIDTH - MARGIN,
        y: anchorY - BUBBLE_HEIGHT - MARGIN,
        score: 3
      },
      {
        direction: 'top-right',
        x: anchorX + MARGIN,
        y: anchorY - BUBBLE_HEIGHT - MARGIN,
        score: 3
      },
      {
        direction: 'bottom-left',
        x: anchorX - BUBBLE_WIDTH - MARGIN,
        y: anchorY + MARGIN,
        score: 3
      },
      {
        direction: 'bottom-right',
        x: anchorX + MARGIN,
        y: anchorY + MARGIN,
        score: 3
      }
    ];
  };

  // ローソク足との衝突判定
  const checkCandleCollision = (candidateBox, timestamp) => {
    if (!chart || !chartData || chartData.length === 0) return false;

    const timeScale = chart.timeScale();
    const priceScale = chart.priceScale('right');

    try {
      // 候補ボックスの時間・価格範囲を計算
      const boxLeft = candidateBox.x;
      const boxRight = candidateBox.x + BUBBLE_WIDTH;
      const boxTop = candidateBox.y;
      const boxBottom = candidateBox.y + BUBBLE_HEIGHT;

      // 座標から時間・価格への変換
      const timeLeft = timeScale.coordinateToTime(boxLeft);
      const timeRight = timeScale.coordinateToTime(boxRight);
      const priceTop = priceScale.coordinateToPrice(boxTop);
      const priceBottom = priceScale.coordinateToPrice(boxBottom);

      if (!timeLeft || !timeRight || priceTop === null || priceBottom === null) {
        return false;
      }

      // 表示範囲内のローソク足をチェック
      for (const candle of chartData) {
        // 時間範囲のチェック
        if (candle.time < timeLeft || candle.time > timeRight) continue;

        // 価格範囲のチェック（高値と安値）
        const candleTop = Math.max(candle.high, candle.open, candle.close);
        const candleBottom = Math.min(candle.low, candle.open, candle.close);

        // 衝突判定
        if (!(priceBottom > candleTop || priceTop < candleBottom)) {
          return true; // 衝突している
        }
      }

      return false; // 衝突なし
    } catch (error) {
      console.error('CommentBubble: Error checking candle collision:', error);
      return false;
    }
  };

  // 他のバブルとの衝突判定
  const checkBubbleCollision = (candidateBox) => {
    if (!placedBubbles || placedBubbles.length === 0) return false;

    const boxLeft = candidateBox.x;
    const boxRight = candidateBox.x + BUBBLE_WIDTH;
    const boxTop = candidateBox.y;
    const boxBottom = candidateBox.y + BUBBLE_HEIGHT;

    for (const bubble of placedBubbles) {
      // 自分自身はスキップ
      if (bubble.id === group.comments[0]?.id) continue;

      const bubbleLeft = bubble.x;
      const bubbleRight = bubble.x + bubble.width;
      const bubbleTop = bubble.y;
      const bubbleBottom = bubble.y + bubble.height;

      // 衝突判定
      if (!(boxRight < bubbleLeft || boxLeft > bubbleRight ||
            boxBottom < bubbleTop || boxTop > bubbleBottom)) {
        return true; // 衝突している
      }
    }

    return false; // 衝突なし
  };

  // 最適な配置位置を決定
  const findOptimalPosition = (anchorX, anchorY, timestamp) => {
    const candidates = calculateCandidatePositions(anchorX, anchorY);
    let bestCandidate = null;
    let bestScore = -Infinity;

    for (const candidate of candidates) {
      // 画面内に収まるかチェック
      if (candidate.x < 0 || candidate.y < 0 ||
          candidate.x + BUBBLE_WIDTH > chartContainer.clientWidth ||
          candidate.y + BUBBLE_HEIGHT > chartContainer.clientHeight) {
        continue;
      }

      // 衝突判定
      const candleCollision = checkCandleCollision(candidate, timestamp);
      const bubbleCollision = checkBubbleCollision(candidate);

      if (!candleCollision && !bubbleCollision) {
        // 距離によるスコア調整
        const distance = Math.sqrt(
          Math.pow(candidate.x + BUBBLE_WIDTH/2 - anchorX, 2) +
          Math.pow(candidate.y + BUBBLE_HEIGHT/2 - anchorY, 2)
        );
        const distanceScore = 100 / (1 + distance * 0.01);
        const totalScore = candidate.score + distanceScore;

        if (totalScore > bestScore) {
          bestScore = totalScore;
          bestCandidate = candidate;
        }
      }
    }

    // 最適な位置が見つからない場合はデフォルト位置
    if (!bestCandidate) {
      bestCandidate = {
        direction: 'top-right',
        x: Math.min(anchorX + MARGIN, chartContainer.clientWidth - BUBBLE_WIDTH - 10),
        y: Math.max(10, anchorY - BUBBLE_HEIGHT - MARGIN)
      };
    }

    return bestCandidate;
  };

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
        
<<<<<<< HEAD
        // アンカー座標を計算
=======
        // 座標を計算
>>>>>>> e279584c1cd7837ca5923f5a6218a81da61ad957
        const x = timeScale.timeToCoordinate(timestamp);
        const y = priceScale.priceToCoordinate(group.price);
        
        // 座標が取得できない場合は非表示
        if (x === null || y === null) {
          setIsVisible(false);
          return;
        }

<<<<<<< HEAD
        // 表示範囲チェック
=======
        // 表示範囲チェックも追加
>>>>>>> e279584c1cd7837ca5923f5a6218a81da61ad957
        const visibleRange = timeScale.getVisibleRange();
        if (visibleRange && (timestamp < visibleRange.from || timestamp > visibleRange.to)) {
          setIsVisible(false);
          return;
        }

<<<<<<< HEAD
        // アンカー位置を保存
        setAnchorPosition({ x: Math.round(x), y: Math.round(y) });

        // 最適な配置位置を計算
        const optimal = findOptimalPosition(x, y, timestamp);
        setPosition({ x: Math.round(optimal.x), y: Math.round(optimal.y) });
        setPlacement(optimal.direction);

        // 配置情報を親コンポーネントに通知
        if (onPlacement) {
          onPlacement(group.comments[0]?.id || `group-${timestamp}`, {
            x: optimal.x,
            y: optimal.y,
            width: BUBBLE_WIDTH,
            height: BUBBLE_HEIGHT
          });
        }

=======
        setPosition({ x: Math.round(x), y: Math.round(y) });
>>>>>>> e279584c1cd7837ca5923f5a6218a81da61ad957
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
  }, [group, chart, chartContainer, chartData, placedBubbles, onPlacement]);

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
    return null;
  }

  const lineEnd = getLineEndpoint();
  const comment = group.comments[0];

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