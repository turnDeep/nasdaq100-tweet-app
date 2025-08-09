import React, { useEffect, useRef, useState, useCallback } from 'react';
import { createChart } from 'lightweight-charts';
import CommentBubble from './CommentBubble';

const Chart = ({ data, comments, onCandleClick }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const [visibleComments, setVisibleComments] = useState([]);
  const clickTimeoutRef = useRef(null);

  const aggregateComments = useCallback((comments) => {
    // 近接するコメントを集約（価格差を20に増やして集約を減らす）
    const priceThreshold = 20;
    const aggregated = [];
    
    comments.forEach(comment => {
      const nearby = aggregated.find(group => {
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
    const chart = chartRef.current;
    if (!chart) return;

    try {
      const visibleRange = chart.timeScale().getVisibleRange();
      if (!visibleRange) {
        // 可視範囲が取得できない場合は全コメントを表示
        const aggregated = aggregateComments(comments);
        setVisibleComments(aggregated);
        return;
      }

      const filtered = comments.filter(comment => {
        const timestamp = new Date(comment.timestamp).getTime() / 1000;
        return timestamp >= visibleRange.from && timestamp <= visibleRange.to;
      });

      const aggregated = aggregateComments(filtered);
      setVisibleComments(aggregated);
    } catch (error) {
      console.error('Error updating visible comments:', error);
      // エラー時は全コメントを表示
      const aggregated = aggregateComments(comments);
      setVisibleComments(aggregated);
    }
  }, [comments, aggregateComments]);

  const handleChartClick = useCallback((param) => {
    // チャートの外側や、データがない場合をクリックした場合は何もしない
    if (!param.point || !param.time) {
      console.log('Click outside chart area or no data');
      return;
    }

    // seriesPricesからローソク足データを取得
    const candleSeries = seriesRef.current;
    if (!candleSeries) {
      console.log('No candle series');
      return;
    }

    const priceData = param.seriesData?.get(candleSeries);
    
    if (priceData) {
      console.log('クリックされたローソク足のデータ:', priceData);
      
      // チャートAPIから価格スケールを取得
      const priceScale = chartRef.current.priceScale('right');
      
      // Y座標から価格を計算
      let clickedPrice;
      if (param.point.y !== undefined && priceScale) {
        // Y座標から価格を取得（lightweight-chartsの新しい方法）
        clickedPrice = priceScale.coordinateToPrice(param.point.y);
        
        // もしcoordinateToPriceが機能しない場合は、ローソク足の範囲で計算
        if (clickedPrice === null || clickedPrice === undefined) {
          const chartHeight = chartContainerRef.current?.clientHeight || 500;
          const yRatio = param.point.y / chartHeight;
          const priceRange = priceData.high - priceData.low;
          clickedPrice = priceData.high - (priceRange * yRatio);
        }
      } else {
        // フォールバック：終値を使用
        clickedPrice = priceData.close;
      }
      
      // ローソク足の範囲内に制限
      clickedPrice = Math.max(priceData.low, Math.min(priceData.high, clickedPrice));
      
      console.log('計算された価格:', clickedPrice);
      
      // onCandleClickを呼び出す（時間も含めて渡す）
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
    } else {
      console.log('No price data available at click position');
      
      // priceDataがない場合は、時間だけを使って最も近いローソク足を探す
      if (!data || data.length === 0) return;
      
      let closestCandle = null;
      let minTimeDiff = Infinity;

      data.forEach(candle => {
        const timeDiff = Math.abs(candle.time - param.time);
        if (timeDiff < minTimeDiff) {
          minTimeDiff = timeDiff;
          closestCandle = candle;
        }
      });

      if (closestCandle && onCandleClick) {
        // Y座標から価格を推定
        const priceScale = chartRef.current.priceScale('right');
        let clickedPrice;
        
        if (param.point.y !== undefined && priceScale) {
          clickedPrice = priceScale.coordinateToPrice(param.point.y);
          
          if (clickedPrice === null || clickedPrice === undefined) {
            const chartHeight = chartContainerRef.current?.clientHeight || 500;
            const yRatio = param.point.y / chartHeight;
            const priceRange = closestCandle.high - closestCandle.low;
            clickedPrice = closestCandle.high - (priceRange * yRatio);
          }
        } else {
          clickedPrice = closestCandle.close;
        }
        
        const constrainedPrice = Math.max(closestCandle.low, Math.min(closestCandle.high, clickedPrice));
        
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

  // タッチ/長押し用のハンドラー
  const handleLongPress = useCallback((e) => {
    e.preventDefault();
    
    if (!chartRef.current || !chartContainerRef.current || !data || data.length === 0) return;
    
    const rect = chartContainerRef.current.getBoundingClientRect();
    const x = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const y = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    
    const timeScale = chartRef.current.timeScale();
    const priceScale = chartRef.current.priceScale('right');
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
        // Y座標から価格を計算
        let clickedPrice;
        if (priceScale) {
          clickedPrice = priceScale.coordinateToPrice(y);
          if (clickedPrice === null || clickedPrice === undefined) {
            const chartHeight = chartContainerRef.current.clientHeight;
            const yRatio = y / chartHeight;
            const priceRange = closestCandle.high - closestCandle.low;
            clickedPrice = closestCandle.high - (priceRange * yRatio);
          }
        } else {
          const chartHeight = chartContainerRef.current.clientHeight;
          const yRatio = y / chartHeight;
          const priceRange = closestCandle.high - closestCandle.low;
          clickedPrice = closestCandle.high - (priceRange * yRatio);
        }
        
        const constrainedPrice = Math.max(closestCandle.low, Math.min(closestCandle.high, clickedPrice));
        
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

  // マウス/タッチイベントハンドラー
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

    // タッチ/マウスイベントの登録（モバイル長押し用）
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

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointercancel', handlePointerUp);
      window.removeEventListener('resize', handleResize);
      chart.unsubscribeClick(handleChartClick);
      chart.remove();
    };
  }, [handleChartClick, handlePointerDown, handlePointerUp]);

  useEffect(() => {
    // データを更新
    if (seriesRef.current && data && data.length > 0) {
      try {
        console.log('Updating chart with', data.length, 'candles');
        seriesRef.current.setData(data);
        
        // データ更新後にコメントの表示を更新
        setTimeout(() => {
          updateVisibleComments();
        }, 100);
      } catch (error) {
        console.error('Error setting chart data:', error);
      }
    }
  }, [data, updateVisibleComments]);

  useEffect(() => {
    // コメントの表示を更新
    if (chartRef.current) {
      const handleVisibleTimeRangeChange = () => {
        updateVisibleComments();
      };
      
      const timeScale = chartRef.current.timeScale();
      timeScale.subscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
      
      // 初回更新を遅延実行
      setTimeout(() => {
        updateVisibleComments();
      }, 100);
      
      return () => {
        timeScale.unsubscribeVisibleTimeRangeChange(handleVisibleTimeRangeChange);
      };
    }
  }, [comments, updateVisibleComments]);

  return (
    <div className="chart-container">
      <div className="chart-instructions">
        💡 チャート上の任意の価格をクリック（モバイル: 長押し）でコメント投稿
      </div>
      <div ref={chartContainerRef} className="chart" style={{ cursor: 'crosshair', position: 'relative' }} />
      <div className="comment-overlay">
        {visibleComments.map((group, index) => (
          <CommentBubble
            key={`comment-group-${index}-${group.timestamp}`}
            group={group}
            chart={chartRef.current}
            chartContainer={chartContainerRef.current}
          />
        ))}
      </div>
    </div>
  );
};

export default Chart;