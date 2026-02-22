import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Heatmap from '../components/Heatmap';

interface ProgressData {
  version: number;
  theory: Record<string, { answered: number; total: number; lastAnsweredAt?: string }>;
  practical: Record<string, { completed: boolean; completedAt?: string }>;
  activity: Record<string, number>;
}

const MainMenu: React.FC = () => {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [runtimeInfo, setRuntimeInfo] = useState<{ version: string; os: string }>({
    version: '1.0',
    os: 'Unknown',
  });

  useEffect(() => {
    loadProgress();
    loadRuntimeInfo();
    const unsubscribe = window.api.onDataRefresh(({ progress }) => {
      setProgress(progress);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const loadProgress = async () => {
    try {
      const data = await window.api.getProgress();
      setProgress(data);
    } catch (error) {
      console.error('Failed to load progress:', error);
    }
  };

  const loadRuntimeInfo = async () => {
    try {
      const data = await window.api.getRuntimeInfo();
      setRuntimeInfo({ version: data.version, os: data.os });
    } catch (error) {
      console.error('Failed to load runtime info:', error);
    }
  };

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

  const handleSettings = () => {
    navigate('/settings');
  };

  const openGitHub = (url: string) => {
    window.open(url, '_blank');
  };

  return (
    <div className="h-screen relative overflow-y-auto pt-8 scroll-smooth">
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

      <div className="container mx-auto px-6 py-8 pb-16 relative max-w-3xl">
        {/* Header */}
        <div className="text-center mb-8">
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
              className="group relative overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-5 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-white mb-1">Practice</h3>
                  <p className="text-sm text-white/50">Practice and drill problems</p>
                </div>
              </div>
            </button>

            {/* Exam Button - Primary */}
            <button
              onClick={handleExam}
              className="group relative overflow-hidden bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-5 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-medium text-white mb-1">Exam</h3>
                  <p className="text-sm text-white/50">Timed assessment mode</p>
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
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </div>
                <span className="text-base font-medium text-white/80">Question Creator</span>
              </div>
            </button>

            <button
              onClick={handleSettings}
              className="group relative overflow-hidden bg-white/5 hover:bg-blue-500/10 border border-white/10 hover:border-blue-500/20 rounded-lg p-4 transition-all duration-200 text-left cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="p-1.5 rounded-md bg-blue-500/10 text-blue-400 group-hover:bg-blue-500/20 transition-colors">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                <span className="text-base font-medium text-blue-400/80 group-hover:text-blue-400">Settings</span>
              </div>
            </button>
          </div>
        </div>

        {/* Activity Heatmap */}
        {progress && <Heatmap activity={progress.activity} />}

        {/* Footer - Made by */}
        <div className="text-center mt-8">
          <p className="text-sm text-white/30 mb-2 font-light">Made by</p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => openGitHub('https://github.com/suchxs')}
              className="text-base text-blue-400 hover:text-blue-300 font-medium transition-colors cursor-pointer"
            >
              suchxs
            </button>
            <span className="text-white/20 text-base">·</span>
            <button
              onClick={() => openGitHub('https://github.com/koeyori')}
              className="text-base text-cyan-400 hover:text-cyan-300 font-medium transition-colors cursor-pointer"
            >
              Koeyori
            </button>
          </div>
        </div>
      </div>

      {/* Version Number - Bottom Left */}
      <div className="fixed bottom-3 left-3 text-sm text-white/40 font-medium">
        {`BETA v${runtimeInfo.version} (${runtimeInfo.os})`}
      </div>
    </div>
  );
};

export default MainMenu;
