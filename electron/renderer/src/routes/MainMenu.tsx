import React from 'react';

const MainMenu: React.FC = () => {
  const handlePractice = () => {
    window.api.openPractice();
  };

  const handleExam = () => {
    window.api.openExam();
  };

  const handleQuestionCreator = () => {
    console.log('Question Creator clicked');
    if (window.api && window.api.openQuestionMaker) {
      console.log('Calling openQuestionMaker API');
      window.api.openQuestionMaker();
    } else {
      console.error('openQuestionMaker API not available - app needs restart');
      alert('Please restart the app to use Question Creator.\n\nThe app was started before this feature was added.');
    }
  };

  const handleExit = () => {
    window.api.exitApp();
  };

  const openGitHub = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="min-h-screen relative overflow-hidden flex items-center justify-center p-6">
      <div 
        className="fixed inset-0 -z-10"
        style={{
          backgroundImage: 'url(/assets/background.gif)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          opacity: 0.35,
        }}
      />

      <div className="w-full max-w-2xl relative">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-6xl font-semibold tracking-tight mb-2" style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <span className="text-blue-400">DSA</span>
            <span className="text-white">Prac</span>
          </h1>
          <p className="text-sm text-white/50 font-light">CIS2101 Reviewer</p>
        </div>

        {/* Main Actions - Glass Card */}
        <div className="glass-card mb-4">
          <div className="grid grid-cols-2 gap-3">
            {/* Practice Button - Primary */}
            <button
              onClick={handlePractice}
              className="group relative overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-6 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-white mb-1">Practice</h3>
                  <p className="text-xs text-white/50">Practice and drill problems</p>
                </div>
              </div>
            </button>

            {/* Exam Button - Primary */}
            <button
              onClick={handleExam}
              className="group relative overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-6 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="flex items-start gap-4">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-white mb-1">Exam</h3>
                  <p className="text-xs text-white/50">Timed assessment mode</p>
                </div>
              </div>
            </button>
          </div>

          {/* Secondary Actions */}
          <div className="grid grid-cols-2 gap-3 mt-3">
            <button
              onClick={handleQuestionCreator}
              className="group relative overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg p-4 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-white/80">Question Creator</span>
              </div>
            </button>

            <button
              onClick={handleExit}
              className="group relative overflow-hidden bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/20 rounded-lg p-4 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-red-500/10 text-red-400 group-hover:bg-red-500/20 transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                </div>
                <span className="text-sm font-medium text-red-400/80 group-hover:text-red-400">Exit</span>
              </div>
            </button>
          </div>

          {/* Stats */}
          <div className="mt-6 pt-6 border-t border-white/5">
            <div className="grid grid-cols-2 gap-4">
              <div className="text-center p-3 rounded-lg bg-white/5">
                <div className="text-2xl font-semibold text-white mb-1">0</div>
                <div className="text-xs text-white/40 font-light">Problems Solved</div>
              </div>
              <div className="text-center p-3 rounded-lg bg-white/5">
                <div className="text-2xl font-semibold text-white mb-1">0</div>
                <div className="text-xs text-white/40 font-light">Day Streak</div>
              </div>
            </div>
          </div>
        </div>

        {/* Footer - Made by */}
        <div className="text-center mt-6">
          <p className="text-xs text-white/30 mb-2 font-light">Made by</p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => openGitHub('https://github.com/suchxs')}
              className="text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer"
            >
              suchxs
            </button>
            <span className="text-white/20">·</span>
            <button
              onClick={() => openGitHub('https://github.com/koeyori')}
              className="text-sm text-cyan-400 hover:text-cyan-300 font-medium transition-colors cursor-pointer"
            >
              Koeyori
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MainMenu;
