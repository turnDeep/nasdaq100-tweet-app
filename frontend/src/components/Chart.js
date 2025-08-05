import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import CommentBubble from './CommentBubble';

const Chart = ({ data, comments, onPriceUpdate }) => {
  const chartContainerRef = useRef();
  const chartRef = useRef();
  const seriesRef = useRef();
  const [visibleComments, setVisibleComments] = useState([]);

  useEffect(() => {
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

    // リサイズハンドラー
    const handleResize = () => {
      chart.applyOptions({ 
        width: chartContainerRef.current.clientWidth 
      });
    };
    window.addEventListener('resize', handleResize);

    // 価格更新の監視
    chart.subscribeCrosshairMove((param) => {
      if (param.point && param.seriesPrices.get(candlestickSeries)) {
        const price = param.seriesPrices.get(candlestickSeries).close;
        onPriceUpdate(price);
      }
    });

    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [onPriceUpdate]);

  useEffect(() => {
    // データを更新
    if (seriesRef.current && data.length > 0) {
      seriesRef.current.setData(data);
    }
  }, [data]);

  useEffect(() => {
    // コメントの表示を更新
    updateVisibleComments();
  }, [comments]);

  const updateVisibleComments = () => {
    // 表示範囲内のコメントをフィルタリング
    const chart = chartRef.current;
    if (!chart) return;

    const visibleRange = chart.timeScale().getVisibleRange();
    if (!visibleRange) return;

    const filtered = comments.filter(comment => {
      const timestamp = new Date(comment.timestamp).getTime() / 1000;
      return timestamp >= visibleRange.from && timestamp <= visibleRange.to;
    });

    // コメントの集約処理
    const aggregated = aggregateComments(filtered);
    setVisibleComments(aggregated);
  };

  const aggregateComments = (comments) => {
    // 近接するコメントを集約
    const threshold = 50; // ピクセル単位の閾値
    const aggregated = [];
    
    comments.forEach(comment => {
      const nearby = aggregated.find(group => {
        // 価格が近い場合は集約
        return Math.abs(group.price - comment.price) < threshold;
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
  };

  return (
    <div className="chart-container">
      <div ref={chartContainerRef} className="chart" />
      <div className="comment-overlay">
        {visibleComments.map((group, index) => (
          <CommentBubble
            key={index}
            group={group}
            chart={chartRef.current}
          />
        ))}
      </div>
    </div>
  );
};

export default Chart;