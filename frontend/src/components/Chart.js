import React, { useMemo, useCallback, useRef } from 'react';
import Plot from 'react-plotly.js';

const Chart = ({ data, comments, onCandleClick, onVisibleRangeChange }) => {
  const chartRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // チャートデータの変換
  const chartData = useMemo(() => {
    if (!data || data.length === 0) return [];

    return [{
      x: data.map(d => new Date(d.time * 1000)),
      open: data.map(d => d.open),
      high: data.map(d => d.high),
      low: data.map(d => d.low),
      close: data.map(d => d.close),
      type: 'candlestick',
      name: 'NASDAQ100',
      increasing: { line: { color: '#26a69a' } },
      decreasing: { line: { color: '#ef5350' } }
    }];
  }, [data]);

  // コメントをアノテーションに変換
  const annotations = useMemo(() => {
    if (!comments) return [];
    
    // データ（ローソク足）を時間で検索できるようにマップ化
    const dataMap = new Map();
    if (data && data.length > 0) {
      data.forEach(d => {
        dataMap.set(d.time, d);
      });
    }

    return comments.map(comment => {
       // タイムスタンプの正規化
       let timestamp = comment.timestamp;
       if (typeof timestamp === 'string') {
          timestamp = new Date(timestamp).getTime() / 1000;
       } else if (timestamp > 1000000000000) {
          timestamp = timestamp / 1000;
       }

       const candle = dataMap.get(timestamp);
       const yPos = candle ? candle.high : comment.price;

       return {
        x: new Date(timestamp * 1000),
        y: yPos,
        text: comment.emotion_icon || '💬',
        hovertext: comment.content,
        showarrow: true,
        arrowhead: 1,
        arrowsize: 1,
        arrowwidth: 2,
        arrowcolor: 'rgba(94, 234, 212, 0.8)',
        ax: 0,
        ay: -30,
        bgcolor: 'rgba(94, 234, 212, 0.25)',
        bordercolor: 'rgba(94, 234, 212, 0.6)',
        borderwidth: 1,
        borderpad: 4,
        font: {
          size: 16,
          color: '#1f2937'
        },
        captureevents: true
       };
    });
  }, [comments, data]);

  // レイアウト変更（ズーム・パン）ハンドラー
  const handleRelayout = useCallback((event) => {
    if (!onVisibleRangeChange) return;

    // 軸範囲の変更があるかチェック
    // Plotlyのrelayoutイベントは変更されたプロパティだけを含む
    let start, end;

    if (event['xaxis.range[0]'] && event['xaxis.range[1]']) {
      // 範囲指定ズームの場合
      start = event['xaxis.range[0]'];
      end = event['xaxis.range[1]'];
    } else if (event['xaxis.autorange'] === true) {
      // オートレンジ（ダブルクリックリセットなど）の場合
      // データ全体の範囲を取得する必要があるが、ここでは簡略化のためnullを渡して全範囲リロードを促すか、
      // データの最小・最大から計算する
      if (data && data.length > 0) {
        start = new Date(data[0].time * 1000).toISOString();
        end = new Date(data[data.length - 1].time * 1000).toISOString();
      }
    }

    if (start && end) {
      // デバウンス処理：連続イベントの最後だけ処理する
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(() => {
        // 文字列の日時をUNIXタイムスタンプ（秒）に変換
        const startTime = new Date(start).getTime() / 1000;
        const endTime = new Date(end).getTime() / 1000;

        console.log(`Visible range changed: ${start} to ${end}`);
        onVisibleRangeChange(startTime, endTime);
      }, 500); // 500msの遅延
    }
  }, [onVisibleRangeChange, data]);

  const handleClick = (event) => {
    if (!onCandleClick || !event.points || event.points.length === 0) return;
    const point = event.points[0];
    const timestamp = new Date(point.x).getTime() / 1000;
    const candleData = {
      time: timestamp,
      price: point.y,
      open: point.data.open[point.pointNumber],
      high: point.data.high[point.pointNumber],
      low: point.data.low[point.pointNumber],
      close: point.data.close[point.pointNumber]
    };
    onCandleClick(candleData);
  };

  return (
    <div className="chart-container" style={{ height: '600px', padding: '2rem' }}>
      <div className="chart-instructions">
        💡 チャート上のローソク足をクリックでコメント投稿
      </div>
      <Plot
        ref={chartRef}
        data={chartData}
        layout={{
          autosize: true,
          dragmode: 'pan',
          margin: { l: 50, r: 50, b: 40, t: 40 },
          showlegend: false,
          xaxis: {
            rangeslider: { visible: false },
            type: 'date',
            gridcolor: '#e0e0e0',
          },
          yaxis: {
            fixedrange: false,
            gridcolor: '#e0e0e0',
            side: 'right'
          },
          plot_bgcolor: '#ffffff',
          paper_bgcolor: '#ffffff',
          annotations: annotations,
          hovermode: 'closest'
        }}
        useResizeHandler={true}
        style={{ width: '100%', height: '500px' }}
        onClick={handleClick}
        onRelayout={handleRelayout}
        config={{
           responsive: true,
           displayModeBar: false,
           scrollZoom: true
        }}
      />
    </div>
  );
};

export default Chart;
