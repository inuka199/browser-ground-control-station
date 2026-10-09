import React from 'react';

const ConnectionStatus = ({ status }) => {
  let statusText = 'Disconnected';
  let dotClass = 'disconnected';

  if (status === 'connected') {
    statusText = 'Connected';
    dotClass = 'connected';
  } else if (status === 'reconnecting' || status === 'connecting') {
    statusText = 'Reconnecting...';
    dotClass = 'reconnecting';
  }

  return (
    <div className="status-indicator">
      <div className={`status-dot ${dotClass}`}></div>
      <span>{statusText}</span>
    </div>
  );
};

export default ConnectionStatus;
