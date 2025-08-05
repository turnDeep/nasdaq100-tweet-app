import React from 'react';

const PositionIndicator = ({ sentiment }) => {
  const { buy_percentage, sell_percentage } = sentiment;

  return (
    <div className="position-indicator">
      <div className="position-label">みんなのポジション</div>
      <div className="position-bar">
        <div
          className="position-sell"
          style={{ width: `${sell_percentage}%` }}
        >
          SELL
        </div>
        <div
          className="position-buy"
          style={{ width: `${buy_percentage}%` }}
        >
          BUY
        </div>
      </div>
    </div>
  );
};

export default PositionIndicator;
