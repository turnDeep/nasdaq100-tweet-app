import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import CommentBubble from './CommentBubble';

const Chart = ({ data, comments, onPriceUpdate, onCandleClick }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const [visibleComments, setVisibleComments] = useState([]);
  const clickTimeoutRef = useRef(null);
  const lastClickRef = useRef(null);

  const aggregateComments = useCallback((comments) => {
    // 近接するコメントを集約
    const priceThreshold = 10; // 価格の閾値
    const aggregated = [];
    
    comments.forEach(comment => {
      const nearby = aggregated.find(group => {
        // 価格が近い場合は集約
        return Math.abs(group.price - comment.price) < priceThreshold;
      });
      
      if (nearby) {
        nearby.comments.push(comment);
      } else {
        aggregated.push({
          price: comment.price,
          timestamp: comment.timestamp,
          comments: [comment]
        });
      }
    });
    
    return aggregated;
  }, []);

  const updateVisibleComments = useCallback(() => {
    // 表示範囲内のコメントをフィルタリング
    const chart = chartRef.current;
    if (!chart) return;

    try {
      const visibleRange = chart.timeScale().getVisibleRange();
      if (!visibleRange) return;

      const filtered = comments.filter(comment => {
        const timestamp = new Date(comment.timestamp).getTime() / 1000;
        return timestamp >= visibleRange.from && timestamp <= visibleRange.to;
      });

      // コメントの集約処理
      const aggregated = aggregateComments(filtered);
      setVisibleComments(aggregated);
    } catch (error) {
      console.error('Error updating visible comments:', error);
    }
  }, [comments, aggregateComments]);

  const handleChartClick = useCallback((param) => {
    if (!param || !seriesRef.current || !data || data.length === 0) {
      console.log('Click params invalid:', { param, series: !!seriesRef.current, dataLength: data?.length });
      return;
    }

    console.log('Chart clicked:', param);

    // マウス座標から最も近いローソク足を探す
    const timeScale = chartRef.current.timeScale();
    const coordinate = param.point ? param.point.x : null;
    
    if (coordinate === null) {
      console.log('No coordinate found');
      return;
    }

    const time = timeScale.coordinateToTime(coordinate);
    if (!time) {
      console.log('No time found for coordinate:', coordinate);
      return;
    }

    // 最も近いローソク足を探す
    let closestCandle = null;
    let minTimeDiff = Infinity;

    data.forEach(candle => {
      const timeDiff = Math.abs(candle.time - time);
      if (timeDiff < minTimeDiff) {
        minTimeDiff = timeDiff;
        closestCandle = candle;
      }
    });

    if (closestCandle) {
      console.log('Closest candle found:', closestCandle);
      
      // onCandleClickを呼び出す
      if (onCandleClick) {
        onCandleClick({
          time: closestCandle.time,
          price: closestCandle.close,
          open: closestCandle.open,
          high: closestCandle.high,
          low: closestCandle.low,
          close: closestCandle.close
        });
      }
    } else {
      console.log('No candle found near click position');
    }
  }, [data, onCandleClick]);

  // タッチ/長押し用のハンドラー
  const handleLongPress = useCallback((e) => {
    e.preventDefault();
    
    if (!chartRef.current || !chartContainerRef.current || !data || data.length === 0) return;
    
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    
    const timeScale = chartRef.current.timeScale();
    const time = timeScale.coordinateToTime(x);
    
    if (time) {
      // 最も近いローソク足を探す
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
        onCandleClick({
          time: closestCandle.time,
          price: closestCandle.close,
          open: closestCandle.open,
          high: closestCandle.high,
          low: closestCandle.low,
          close: closestCandle.close
        });
      }
    }
  }, [data, onCandleClick]);

  // マウス/タッチイベントハンドラー
  const handlePointerDown = useCallback((e) => {
    // モバイルデバイスの判定
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (isMobile) {
      // モバイルの場合は長押し検出
      clickTimeoutRef.current = setTimeout(() => {
        handleLongPress(e);
      }, 500);
    }
    
    lastClickRef.current = Date.now();
  }, [handleLongPress]);

  const handlePointerUp = useCallback((e) => {
    const isMobile = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    
    // PCの場合は通常のクリックとして処理
    if (!isMobile && lastClickRef.current && (Date.now() - lastClickRef.current < 500)) {
      // クリック位置からチャート上の座標を計算
      if (chartContainerRef.current && chartRef.current) {
        const rect = chartContainerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        
        handleChartClick({
          point: { x, y },
          seriesPrices: new Map()
        });
      }
    }
  }, [handleChartClick]);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // チャートを初期化
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
        mode: 1, // Magnet mode
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

    // チャートのクリックイベント
    chart.subscribeClick(handleChartClick);

    // タッチ/マウスイベントの登録
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
      }
    };
    window.addEventListener('resize', handleResize);

    // 価格更新の監視
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.seriesPrices || !candlestickSeries) return;
      
      try {
        const price = param.seriesPrices.get(candlestickSeries);
        if (price && price.close) {
          onPriceUpdate(price.close);
        }
      } catch (error) {
        console.error('Error in crosshair move:', error);
      }
    });

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
    };
  }, [onPriceUpdate, handleChartClick, handlePointerDown, handlePointerUp]);

  useEffect(() => {
    // データを更新
    if (seriesRef.current && data && data.length > 0) {
      try {
        console.log('Updating chart with', data.length, 'candles');
        seriesRef.current.setData(data);
      } catch (error) {
        console.error('Error setting chart data:', error);
      }
    }
  }, [data]);

  useEffect(() => {
    // コメントの表示を更新
    if (chartRef.current && comments.length > 0) {
      const handleVisibleTimeRangeChange = () => {
        updateVisibleComments();
      };
      
      const timeScale = chartRef.current.timeScale();
      timeScale.subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
      
      // 初回更新
      updateVisibleComments();
      
      return () => {
        timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
      };
    }
  }, [comments, updateVisibleComments]);

  return (
    <div className="chart-container">
      <div className="chart-instructions">
        💡 PC: ローソク足をクリック | モバイル: ローソク足を長押しでコメント投稿
      </div>
      <div ref={chartContainerRef} className="chart" style={{ cursor: 'crosshair' }} />
      <div className="comment-overlay">
        {visibleComments.map((group, index) => (
          <CommentBubble
            key={`comment-group-${index}`}
            group={group}
            chart={chartRef.current}
          />
        ))}
      </div>
    </div>
  );
};

export default Chart;