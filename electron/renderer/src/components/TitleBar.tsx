import React, { useState, useEffect } from 'react';

const TitleBar: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state
    window.api.windowIsMaximized().then(setIsMaximized);
  }, []);

  const handleMinimize = () => {
    window.api.windowMinimize();
  };

  const handleMaximize = () => {
    window.api.windowMaximize();
    // Toggle the state immediately for UI feedback
    setIsMaximized(!isMaximized);
  };

  const handleClose = () => {
    window.api.windowClose();
  };

  return (
    <div className="title-bar select-none flex items-center justify-between h-8 bg-black/30 backdrop-blur-md text-white px-3 fixed top-0 left-0 right-0 z-50" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* App Title/Icon */}
      <div className="flex items-center gap-2 text-sm font-medium">
        <img src="/assets/icon.png" alt="DSAPrac" className="w-4 h-4" onError={(e) => {
          // Fallback if icon.png doesn't exist, try icon.ico
          e.currentTarget.src = '/icons/icon.ico';
        }} />
        <span className="text-blue-400">DSAPrac</span>
      </div>

      {/* Window Controls */}
      <div className="flex items-center" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        {/* Minimize Button */}
        <button
          onClick={handleMinimize}
          className="hover:bg-white/10 transition-colors w-12 h-8 flex items-center justify-center"
          aria-label="Minimize"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <rect x="0" y="5" width="12" height="2" fill="currentColor" />
          </svg>
        </button>

        {/* Maximize/Restore Button */}
        <button
          onClick={handleMaximize}
          className="hover:bg-white/10 transition-colors w-12 h-8 flex items-center justify-center"
          aria-label={isMaximized ? 'Restore' : 'Maximize'}
        >
          {isMaximized ? (
            // Restore icon (two overlapping squares)
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="2" y="0" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
              <rect x="0" y="2" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          ) : (
            // Maximize icon (single square)
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <rect x="0" y="0" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          )}
        </button>

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="hover:bg-red-600 transition-colors w-12 h-8 flex items-center justify-center"
          aria-label="Close"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1 1L11 11M11 1L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
