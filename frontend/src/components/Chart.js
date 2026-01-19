import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';

const Chart = ({ data, comments, onCandleClick }) => {
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
    
    return comments.map(comment => {
       // タイムスタンプの正規化（秒単位のUNIXタイムスタンプを想定）
       let timestamp = comment.timestamp;
       if (typeof timestamp === 'string') {
          timestamp = new Date(timestamp).getTime() / 1000;
       } else if (timestamp > 1000000000000) { // ミリ秒判定
          timestamp = timestamp / 1000;
       }

       return {
        x: new Date(timestamp * 1000),
        y: comment.price,
        text: comment.emotion_icon || '💬',
        hovertext: comment.content,
        showarrow: true,
        arrowhead: 2,
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
  }, [comments]);

  // クリックハンドラー
  const handleClick = (event) => {
    if (!onCandleClick || !event.points || event.points.length === 0) return;

    const point = event.points[0];
    
    // データポイント（ローソク足）の情報を取得
    // 注: point.x はDateオブジェクトまたは文字列
    const timestamp = new Date(point.x).getTime() / 1000;

    const candleData = {
      time: timestamp,
      price: point.y, // クリックされた位置の価格（またはclose値）
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
