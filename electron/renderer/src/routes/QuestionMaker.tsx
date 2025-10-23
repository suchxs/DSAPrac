import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';

interface QuestionCounts {
  theoretical: number;
  practical: number;
}

const QuestionMaker: React.FC = () => {
  const [counts, setCounts] = useState<QuestionCounts>({ theoretical: 0, practical: 0 });

  useEffect(() => {
    loadQuestionCounts();
  }, []);

  const loadQuestionCounts = async () => {
    try {
      const counts = await window.api.getQuestionCounts();
      setCounts(counts);
    } catch (error) {
      console.error('Failed to load question counts:', error);
    }
  };

  const handleCreateTheoretical = () => {
    // TODO: Navigate to theoretical question creator
    console.log('Creating theoretical question');
    alert('Theoretical Question Creator - Coming Soon!\n\nThis will open a form to create multiple-choice questions for theory practice.');
  };

  const handleCreatePractical = () => {
    // TODO: Navigate to practical question creator
    console.log('Creating practical question');
    alert('Practical Question Creator - Coming Soon!\n\nThis will open a form to create coding problems with test cases.');
  };

  const handleBack = () => {
    window.api.openMenu();
  };

  return (
    <div className="min-h-screen relative overflow-hidden">
      {/* Animated Background GIF */}
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

      <div className="container mx-auto px-6 py-8 relative">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Question Creator</h1>
            <p className="opacity-80 text-sm mt-1">
              Create theoretical or practical questions for the system.
            </p>
          </div>
          <button onClick={handleBack} className="button-modern px-4 py-2 rounded-xl cursor-pointer">
            Back
          </button>
        </div>

        {/* Question Type Selection Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {/* Theoretical Questions */}
          <GlassCard className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 mb-4">
                <svg className="w-8 h-8 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold mb-2">Theoretical</h2>
              <p className="text-sm opacity-80 mb-4">
                Multiple-choice questions for theory practice
              </p>
              
              {/* Question Counter */}
              <div className="inline-block px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-400/20 mb-6">
                <div className="text-sm opacity-70 mb-1">Loaded Questions</div>
                <div className="text-3xl font-bold text-blue-400">{counts.theoretical}</div>
              </div>
            </div>

            <button
              onClick={handleCreateTheoretical}
              className="w-full button-modern px-6 py-3 rounded-xl text-lg font-medium cursor-pointer hover:scale-105 transition-transform"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Theoretical Question
              </span>
            </button>

            <div className="mt-4 text-xs opacity-60 text-center">
              Questions will be tagged by topic and section
            </div>
          </GlassCard>

          {/* Practical Questions */}
          <GlassCard className="p-8">
            <div className="text-center mb-6">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-cyan-500/10 mb-4">
                <svg className="w-8 h-8 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                </svg>
              </div>
              <h2 className="text-2xl font-semibold mb-2">Practical</h2>
              <p className="text-sm opacity-80 mb-4">
                Coding problems with test cases and solutions
              </p>
              
              {/* Question Counter */}
              <div className="inline-block px-4 py-2 rounded-lg bg-cyan-500/10 border border-cyan-400/20 mb-6">
                <div className="text-sm opacity-70 mb-1">Loaded Questions</div>
                <div className="text-3xl font-bold text-cyan-400">{counts.practical}</div>
              </div>
            </div>

            <button
              onClick={handleCreatePractical}
              className="w-full button-modern px-6 py-3 rounded-xl text-lg font-medium cursor-pointer hover:scale-105 transition-transform"
            >
              <span className="flex items-center justify-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Create Practical Question
              </span>
            </button>

            <div className="mt-4 text-xs opacity-60 text-center">
              Include problem description, test cases, and reference solution
            </div>
          </GlassCard>
        </div>

        {/* Info Section */}
        <div className="max-w-5xl mx-auto mt-8">
          <GlassCard className="p-6">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-sm opacity-80">
                <p className="font-medium mb-1">Question Storage</p>
                <p>
                  Questions are stored as Markdown files in the <code className="px-1.5 py-0.5 rounded bg-white/10">questions/</code> directory. 
                  Theoretical questions use multiple-choice format, while practical questions include problem descriptions and test cases.
                </p>
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default QuestionMaker;
