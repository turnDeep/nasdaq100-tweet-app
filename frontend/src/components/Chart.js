import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import CommentBubble from './CommentBubble';

const Chart = ({ data, comments, onCandleClick }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const [visibleComments, setVisibleComments] = useState([]);
  const [placedBubbles, setPlacedBubbles] = useState([]); // 配置済みバブルの位置情報
  const clickTimeoutRef = useRef(null);

  // コメントを集約する関数
  const aggregateComments = useCallback((commentsToAggregate) => {
    if (!commentsToAggregate || commentsToAggregate.length === 0) {
      console.log('Chart: No comments to aggregate');
      return [];
    }

    console.log('Chart: Aggregating', commentsToAggregate.length, 'comments');
    
    // 価格と時間でコメントをグループ化
    const priceThreshold = 50; // 価格差の閾値
    const timeThreshold = 300; // 5分以内のコメントをグループ化
    const aggregated = [];
    
    commentsToAggregate.forEach(comment => {
      console.log('Chart: Processing comment:', {
        id: comment.id,
        timestamp: comment.timestamp,
        timestampType: typeof comment.timestamp,
        price: comment.price,
        content: comment.content?.substring(0, 20)
      });
      
      // タイムスタンプを秒に変換
      let commentTimestamp;
      if (typeof comment.timestamp === 'number') {
        if (comment.timestamp > 1000000000000) {
          // ミリ秒の場合は秒に変換
          commentTimestamp = Math.floor(comment.timestamp / 1000);
        } else {
          commentTimestamp = comment.timestamp;
        }
      } else if (typeof comment.timestamp === 'string') {
        commentTimestamp = Math.floor(new Date(comment.timestamp).getTime() / 1000);
      } else {
        console.error('Chart: Invalid comment timestamp:', comment.timestamp);
        return;
      }
      
      // 近接するコメントグループを探す
      const nearby = aggregated.find(group => {
        let groupTimestamp;
        if (typeof group.timestamp === 'number') {
          if (group.timestamp > 1000000000000) {
            groupTimestamp = Math.floor(group.timestamp / 1000);
          } else {
            groupTimestamp = group.timestamp;
          }
        } else {
          groupTimestamp = Math.floor(new Date(group.timestamp).getTime() / 1000);
        }
        
        const priceDiff = Math.abs(group.price - comment.price);
        const timeDiff = Math.abs(groupTimestamp - commentTimestamp);
        
        return priceDiff < priceThreshold && timeDiff < timeThreshold;
      });
      
      if (nearby) {
        nearby.comments.push(comment);
      } else {
        aggregated.push({
          price: comment.price,
          timestamp: comment.timestamp, // 元の形式を保持
          comments: [comment]
        });
      }
    });
    
    console.log('Chart: Created', aggregated.length, 'comment groups');
    return aggregated;
  }, []);

  // 表示するコメントを更新
  const updateVisibleComments = useCallback(() => {
    console.log('Chart: updateVisibleComments called');
    
    if (!chartRef.current) {
      console.log('Chart: No chart reference');
      setVisibleComments([]);
      setPlacedBubbles([]);
      return;
    }

    const timeScale = chartRef.current.timeScale();
    const visibleRange = timeScale.getVisibleRange();

    if (!visibleRange) {
        console.log('Chart: Visible range not available yet.');
        setVisibleComments([]);
<<<<<<< HEAD
        setPlacedBubbles([]);
=======
>>>>>>> e279584c1cd7837ca5923f5a6218a81da61ad957
        return;
    }
    
    if (!comments || comments.length === 0) {
      console.log('Chart: No comments to display');
      setVisibleComments([]);
      setPlacedBubbles([]);
      return;
    }

    try {
      // デバッグログを追加して範囲チェックを可視化
      console.log(`Chart: Debug - Visible range from ${visibleRange.from} to ${visibleRange.to}`);

      const filteredComments = comments.filter(comment => {
        let commentTimestamp;
        if (typeof comment.timestamp === 'number') {
            commentTimestamp = comment.timestamp > 1000000000000 ? Math.floor(comment.timestamp / 1000) : comment.timestamp;
        } else if (typeof comment.timestamp === 'string') {
            commentTimestamp = Math.floor(new Date(comment.timestamp).getTime() / 1000);
        } else {
            return false; // Invalid timestamp format
        }

        const isInRange = commentTimestamp >= visibleRange.from && commentTimestamp <= visibleRange.to;
        return isInRange;
      });
      
      console.log(`Chart: Displaying ${filteredComments.length} of ${comments.length} comments.`);

      // 表示範囲内のコメントのみ集約
      const aggregated = aggregateComments(filteredComments);
      console.log('Chart: Setting', aggregated.length, 'visible comment groups');
      setVisibleComments(aggregated);
      
      // 配置済みバブルリストをリセット（再配置のため）
      setPlacedBubbles([]);
      
    } catch (error) {
      console.error('Chart: Error updating visible comments:', error);
      setVisibleComments([]);
      setPlacedBubbles([]);
    }
  }, [comments, aggregateComments]);

  // バブルの配置情報を更新
  const updateBubblePlacement = useCallback((bubbleId, boundingBox) => {
    setPlacedBubbles(prev => {
      const filtered = prev.filter(b => b.id !== bubbleId);
      return [...filtered, { id: bubbleId, ...boundingBox }];
    });
  }, []);

  // チャートクリックハンドラー
  const handleChartClick = useCallback((param) => {
    if (!param.point || !param.time) {
      console.log('Chart: Click outside chart area or no data');
      return;
    }

    const candleSeries = seriesRef.current;
    if (!candleSeries) {
      console.log('Chart: No candle series');
      return;
    }

    const priceData = param.seriesData?.get(candleSeries);
    
    if (priceData) {
      console.log('Chart: Clicked candle data:', priceData);
      
      let clickedPrice;
      if (param.point.y !== undefined) {
        try {
          clickedPrice = candleSeries.coordinateToPrice(param.point.y);
          
          if (clickedPrice === null || clickedPrice === undefined) {
            const chartHeight = chartContainerRef.current?.clientHeight || 500;
            const yRatio = param.point.y / chartHeight;
            const priceRange = priceData.high - priceData.low;
            clickedPrice = priceData.high - (priceRange * yRatio);
          }
        } catch (error) {
          console.error('Chart: Error getting price from coordinate:', error);
          clickedPrice = priceData.close;
        }
      } else {
        clickedPrice = priceData.close;
      }
      
      const margin = (priceData.high - priceData.low) * 0.1;
      const minPrice = priceData.low - margin;
      const maxPrice = priceData.high + margin;
      clickedPrice = Math.max(minPrice, Math.min(maxPrice, clickedPrice));
      
      console.log('Chart: Calculated click price:', clickedPrice);
      
      if (onCandleClick) {
        onCandleClick({
          time: param.time,
          price: clickedPrice,
          open: priceData.open,
          high: priceData.high,
          low: priceData.low,
          close: priceData.close
        });
      }
    }
  }, [onCandleClick]);

  // 長押しハンドラー（モバイル用）
  const handleLongPress = useCallback((e) => {
    e.preventDefault();
    
    if (!chartRef.current || !chartContainerRef.current || !data || data.length === 0) return;
    
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    
    const timeScale = chartRef.current.timeScale();
    const candleSeries = seriesRef.current;
    const time = timeScale.coordinateToTime(x);
    
    if (time && candleSeries) {
      let closestCandle = null;
      let minTimeDiff = Infinity;

      data.forEach(candle => {
        const timeDiff = Math.abs(candle.time - time);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestCandle = candle;
        }
      });

      if (closestCandle && onCandleClick) {
        let clickedPrice;
        try {
          clickedPrice = candleSeries.coordinateToPrice(y);
        } catch (error) {
          console.error('Chart: Error getting price from coordinate:', error);
          clickedPrice = null;
        }
        
        if (clickedPrice === null || clickedPrice === undefined) {
          const chartHeight = chartContainerRef.current.clientHeight;
          const yRatio = y / chartHeight;
          const priceRange = closestCandle.high - closestCandle.low;
          clickedPrice = closestCandle.high - (priceRange * yRatio);
        }
        
        const margin = (closestCandle.high - closestCandle.low) * 0.1;
        const constrainedPrice = Math.max(closestCandle.low - margin, Math.min(closestCandle.high + margin, clickedPrice));
        
        onCandleClick({
          time: closestCandle.time,
          price: constrainedPrice,
          open: closestCandle.open,
          high: closestCandle.high,
          low: closestCandle.low,
          close: closestCandle.close
        });
      }
    }
  }, [data, onCandleClick]);

  // ポインターイベントハンドラー
  const handlePointerDown = useCallback((e) => {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isMobile) {
      clickTimeoutRef.current = setTimeout(() => {
        handleLongPress(e);
      }, 500);
    }
  }, [handleLongPress]);

  const handlePointerUp = useCallback(() => {
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
  }, []);

  // チャートの初期化
  useEffect(() => {
    if (!chartContainerRef.current) return;

    console.log('Chart: Initializing chart');

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 500,
      layout: {
        backgroundColor: '#ffffff',
        textColor: '#333',
      },
      grid: {
        vertLines: {
          color: '#e0e0e0',
        },
        horzLines: {
          color: '#e0e0e0',
        },
      },
      rightPriceScale: {
        borderColor: '#cccccc',
      },
      timeScale: {
        borderColor: '#cccccc',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 0,
        vertLine: {
          width: 1,
          color: '#758696',
          style: 1,
        },
        horzLine: {
          visible: true,
          labelVisible: true,
        },
      },
    });

    const candlestickSeries = chart.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });

    chartRef.current = chart;
    seriesRef.current = candlestickSeries;

    // イベントリスナーの設定
    chart.subscribeClick(handleChartClick);

    const container = chartContainerRef.current;
    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointerup', handlePointerUp);
    container.addEventListener('pointercancel', handlePointerUp);

    // リサイズハンドラー
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
        updateVisibleComments();
      }
    };
    window.addEventListener('resize', handleResize);

    // チャートの表示範囲変更を監視
    const timeScale = chart.timeScale();
    const handleVisibleTimeRangeChange = () => {
      console.log('Chart: Visible time range changed');
      updateVisibleComments();
    };
    
    try {
      timeScale.subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
    } catch (error) {
      console.error('Chart: Error subscribing to time range change:', error);
    }

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      
      try {
        timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
      } catch (error) {
        console.error('Chart: Error unsubscribing from time range change:', error);
      }
      
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
    };
  }, [handleChartClick, handlePointerDown, handlePointerUp, updateVisibleComments]);

  // データ更新時の処理
  useEffect(() => {
    if (seriesRef.current && data && data.length > 0) {
      try {
        console.log('Chart: Updating chart with', data.length, 'candles');
        seriesRef.current.setData(data);
        
        // データ更新後にコメントの表示を更新
        setTimeout(() => {
          updateVisibleComments();
        }, 100);
      } catch (error) {
        console.error('Chart: Error setting chart data:', error);
      }
    }
  }, [data, updateVisibleComments]);

  // コメント更新時の処理
  useEffect(() => {
    console.log('Chart: Comments prop changed, received', comments?.length || 0, 'comments');
    updateVisibleComments();
  }, [comments, updateVisibleComments]);

  console.log('Chart: Rendering with', visibleComments.length, 'visible comment groups');

  return (
    <div className="chart-container">
      <div className="chart-instructions">
        💡 チャート上の任意の価格をクリック（モバイル: 長押し）でコメント投稿
      </div>
      <div 
        ref={chartContainerRef} 
        className="chart" 
        style={{ 
          cursor: 'crosshair', 
          position: 'relative',
          width: '100%',
          height: '500px'
        }} 
      />
      {/* コメントオーバーレイ */}
      <div 
        className="comment-overlay"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          pointerEvents: 'none',
          zIndex: 100
        }}
      >
        {visibleComments.map((group, index) => {
          const key = `comment-group-${group.comments[0]?.id || 'unknown'}-${index}`;
          console.log('Chart: Rendering comment group with key:', key);
          
          return (
            <CommentBubble
              key={key}
              group={group}
              chart={chartRef.current}
              chartContainer={chartContainerRef.current}
              chartData={data}
              placedBubbles={placedBubbles}
              onPlacement={updateBubblePlacement}
            />
          );
        })}
      </div>
    </div>
  );
};

export default Chart;