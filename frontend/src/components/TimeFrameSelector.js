import React from 'react';

const TimeFrameSelector = ({ selected, onChange }) => {
  const timeFrames = ['1m', '3m', '15m', '1H', '4H', '1D', '1W'];

  return (
    <div className="timeframe-selector">
      {timeFrames.map((tf) => (
        <button
          key={tf}
          className={`timeframe-button ${selected === tf ? 'active' : ''}`}
          onClick={() => onChange(tf)}
        >
          {tf}
        </button>
      ))}
    </div>
  );
};

export default TimeFrameSelector;