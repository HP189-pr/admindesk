// Path: /src/Components/Dashboard/Clock.js

import React, { useState, useEffect } from 'react';
import './Clock.css'; // Optional: Custom CSS for styling
import PropTypes from 'prop-types';

const Clock = ({ showDate = false, compact = false, className = '', style = {} }) => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);

    return () => clearInterval(timer);
  }, []);

  const containerClass = ['clock-container', compact ? 'clock-compact' : '', className].filter(Boolean).join(' ');

  const formatDate = (d) => {
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    const weekday = d.toLocaleDateString(undefined, { weekday: 'long' });
    return `${day}-${month}-${year}  ${weekday}`;
  };

  return (
    <div className={containerClass} style={style}>
      {showDate && <div className="date">{formatDate(time)}</div>}
      <div className="time">{time.toLocaleTimeString()}</div>
    </div>
  );
};

Clock.propTypes = {
  showDate: PropTypes.bool,
  compact: PropTypes.bool,
  className: PropTypes.string,
  style: PropTypes.object,
};

export default Clock;
