import React from 'react';

const TelemetryWidget = ({ title, value, unit, type }) => {
  // Determine if we have a valid value to display
  const hasValue = value !== null && value !== undefined && !Number.isNaN(value);

  // Format the value based on type
  let displayValue = '--';
  if (hasValue) {
    if (type === 'string' || type === 'mode') {
      displayValue = value;
    } else {
      // Format numeric values to 2 decimal places
      displayValue = Number(value).toFixed(2);
    }
  }

  // Specialized rendering for battery
  if (type === 'battery' && hasValue) {
    const percentage = Math.max(0, Math.min(100, value));
    let colorClass = 'var(--accent-green)';
    if (percentage <= 20) colorClass = 'var(--accent-red)';
    else if (percentage <= 50) colorClass = 'var(--accent-yellow)';

    return (
      <div className="widget-card">
        <div className="widget-title">{title}</div>
        <div className="widget-value-container">
          <span className="widget-value">{displayValue}</span>
          {unit && <span className="widget-unit">{unit}</span>}
        </div>
        <div className="battery-bar-container">
          <div
            className="battery-bar"
            style={{ width: `${percentage}%`, backgroundColor: colorClass }}
          ></div>
        </div>
      </div>
    );
  }

  // Specialized rendering for flight mode
  if (type === 'mode') {
    return (
      <div className="widget-card">
        <div className="widget-title">{title}</div>
        <div className="widget-value-container">
          <span className="widget-value flight-mode">{hasValue ? displayValue : '--'}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="widget-card">
      <div className="widget-title">{title}</div>
      <div className="widget-value-container">
        <span className="widget-value">{displayValue}</span>
        {unit && <span className="widget-unit">{unit}</span>}
      </div>
    </div>
  );
};

export default TelemetryWidget;
