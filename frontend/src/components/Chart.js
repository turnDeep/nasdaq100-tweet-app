import React, { useMemo, useCallback, useRef } from 'react';
import Plot from 'react-plotly.js';

const Chart = ({ data, comments, currentUser, onAnnotationClick, onDeleteComment, onCandleClick, onVisibleRangeChange }) => {
  const chartRef = useRef(null);
  const debounceTimerRef = useRef(null);

  // コメントをタイムスタンプでグループ化
  const groupedComments = useMemo(() => {
    if (!comments) return {};
    const groups = {};
    comments.forEach(c => {
        let ts = c.timestamp;
        if (typeof ts === 'string') {
          ts = new Date(ts).getTime() / 1000;
        } else if (ts > 1000000000000) {
          ts = ts / 1000;
        }

        if (!groups[ts]) groups[ts] = [];
        groups[ts].push(c);
    });
    return groups;
  }, [comments]);

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
    if (!groupedComments) return [];
    
    // データ（ローソク足）を時間で検索できるようにマップ化
    const dataMap = new Map();
    if (data && data.length > 0) {
      data.forEach(d => {
        dataMap.set(d.time, d);
      });
    }

    const result = [];
    Object.keys(groupedComments).forEach(tsKey => {
        const ts = parseFloat(tsKey);
        const group = groupedComments[tsKey];
        const candle = dataMap.get(ts);

        // 複数コメントがある場合は、そのグループ内の最高価格を採用するか、ローソク足の高値を使う
        // ここではローソク足の高値を優先し、なければグループ内の最高価格
        let yPos;
        if (candle) {
            yPos = candle.high;
        } else {
            yPos = Math.max(...group.map(c => parseFloat(c.price)));
        }

        if (group.length > 1) {
            // 複数コメント：件数表示
            const hasMyComment = currentUser && group.some(c => c.user_id === currentUser.id);
            const contentPreview = group.map(c => c.content).join('\n');

            result.push({
                x: new Date(ts * 1000),
                y: yPos,
                text: `💬 ${group.length}` + (hasMyComment ? ' ●' : ''),
                hovertext: contentPreview,
                showarrow: true,
                arrowhead: 1,
                arrowsize: 1,
                arrowwidth: 2,
                arrowcolor: 'rgba(251, 191, 36, 0.8)',
                ax: 0,
                ay: -30,
                bgcolor: 'rgba(255, 255, 255, 0.9)',
                bordercolor: 'rgba(251, 191, 36, 0.8)',
                borderwidth: 2,
                borderpad: 4,
                font: {
                  size: 14,
                  color: '#1f2937',
                  weight: 'bold'
                },
                captureevents: true,
                // Custom data to identify group on click
                name: `group_${ts}`
            });
        } else {
            // 単一コメント：従来の表示
            const comment = group[0];
            const isOwner = currentUser && currentUser.id === comment.user_id;

            result.push({
                x: new Date(ts * 1000),
                y: yPos,
                text: (comment.emotion_icon || '💬') + (isOwner ? ' 🗑️' : ''),
                hovertext: comment.content,
                showarrow: true,
                arrowhead: 1,
                arrowsize: 1,
                arrowwidth: 2,
                arrowcolor: 'rgba(94, 234, 212, 0.8)',
                ax: 0,
                ay: -30,
                bgcolor: isOwner ? 'rgba(255, 235, 59, 0.5)' : 'rgba(94, 234, 212, 0.25)',
                bordercolor: 'rgba(94, 234, 212, 0.6)',
                borderwidth: 1,
                borderpad: 4,
                font: {
                  size: 16,
                  color: '#1f2937'
                },
                captureevents: true,
                name: `single_${comment.id}`
            });
        }
    });

    return result;
  }, [groupedComments, data, currentUser]);

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

  const handleAnnotationClick = useCallback((event) => {
    // indexはこの配列(annotations)内のインデックス
    const index = event.index;
    // annotations再計算と同じ順序でキーを取り出す必要があるため、少し脆弱性がある。
    // useMemoの順序依存を避けるため、Object.keysの順序（数値キーなら昇順）に依存するが、
    // ここではannotations配列そのものに対応するデータを持たせるのが難しい（Plotlyの制限）。
    // 代わりに、タイムスタンプ順にソートして生成するようにして一貫性を持たせる。

    const sortedKeys = Object.keys(groupedComments).sort((a,b) => parseFloat(a) - parseFloat(b));
    const tsKey = sortedKeys[index];
    const group = groupedComments[tsKey];

    if (group) {
        // グループが1件だけの場合で、かつ従来の削除フローを使いたい場合
        if (group.length === 1 && onDeleteComment) {
             const comment = group[0];
             const isOwner = currentUser && currentUser.id === comment.user_id;
             // 削除ボタンをクリックしたかどうかの判定はPlotlyでは難しいので、
             // 単一コメントの場合は従来通り確認ダイアログ -> 削除、またはモーダル表示に統一する。
             // ここでは「一覧で見れる」要望を満たすため、単一でもモーダル表示(onAnnotationClick呼び出し)に統一する。
             if (onAnnotationClick) {
                 onAnnotationClick(group);
             } else if (isOwner) {
                 if (window.confirm('このコメントを削除しますか？')) {
                    onDeleteComment(comment.id);
                 }
             }
        } else if (onAnnotationClick) {
            onAnnotationClick(group);
        }
    }
  }, [groupedComments, currentUser, onDeleteComment, onAnnotationClick]);

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
        onClickAnnotation={handleAnnotationClick}
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
