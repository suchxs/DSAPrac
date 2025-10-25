import React from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';
import TitleBar from '../components/TitleBar';

const Settings: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen natural-bg text-white">
      <TitleBar />
      
      <div className="container mx-auto px-4 py-8 pt-20">
        <div className="flex items-center gap-4 mb-8">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-white/10 rounded-lg transition-colors"
            title="Back to Main Menu"
          >
            <svg
              className="w-6 h-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>
          <h1 className="text-4xl font-bold">Settings</h1>
        </div>

        <GlassCard className="p-8">
          <div className="text-center py-12">
            <div className="text-6xl mb-4">⚙️</div>
            <h2 className="text-2xl font-semibold mb-2">Settings Coming Soon</h2>
            <p className="text-neutral-400">
              Configuration options will be available here
            </p>
          </div>
        </GlassCard>
      </div>
    </div>
  );
};

export default Settings;
