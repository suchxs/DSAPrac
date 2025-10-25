import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';

interface QuestionCounts {
  theoretical: number;
  practical: number;
}

const QuestionMaker: React.FC = () => {
  const navigate = useNavigate();
  const [counts, setCounts] = useState<QuestionCounts>({ theoretical: 0, practical: 0 });
  const [showRevealPrompt, setShowRevealPrompt] = useState(false);

  useEffect(() => {
    loadQuestionCounts();
    const unsubscribe = window.api.onDataRefresh(({ counts }) => {
      setCounts(counts);
    });
    return () => {
      unsubscribe();
    };
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
    navigate('/question-maker/theoretical');
  };

  const handleViewAllQuestions = () => {
    if (counts.theoretical === 0) {
      navigate('/question-maker/theoretical/library');
      return;
    }
    setShowRevealPrompt(true);
  };

  const handleCloseRevealPrompt = () => {
    setShowRevealPrompt(false);
  };

  const handleConfirmReveal = () => {
    setShowRevealPrompt(false);
    navigate('/question-maker/theoretical/library');
  };

  const handleCreatePractical = () => {
    navigate('/question-maker/practical');
  };

  const handleViewAllPractical = () => {
    navigate('/question-maker/practical/library');
  };

  const handleBack = () => {
    window.api.openMenu();
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 pt-8">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-12">
        <div className="mb-10 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Question Creator</h1>
            <p className="mt-1 text-sm text-neutral-400">
              Create your own questions!
            </p>
          </div>
          <button
            onClick={handleBack}
            className="inline-flex items-center justify-center rounded-md border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
          >
            Back to Menu
          </button>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
          <GlassCard className="flex flex-col justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 p-8">
            <div>
              <h2 className="text-2xl font-semibold text-white">Theoretical Questions</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Create md flashcards
              </p>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">Total Questions</span>
                  <span className="text-3xl font-bold text-white">{counts.theoretical}</span>
                </div>
                <button
                  onClick={handleViewAllQuestions}
                  className="inline-flex w-full items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
                >
                  View All Questions
                </button>
              </div>
            </div>

            <button
              onClick={handleCreateTheoretical}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-md border border-neutral-700 bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-neutral-200 cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Theoretical Question
            </button>
          </GlassCard>

          <GlassCard className="flex flex-col justify-between rounded-xl border border-neutral-800 bg-neutral-900/60 p-8">
            <div>
              <h2 className="text-2xl font-semibold text-white">Practical Problems</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Create Codechum boilerplate questions
              </p>

              <div className="mt-6 space-y-4">
                <div className="flex items-center justify-between rounded-lg border border-neutral-800 bg-neutral-900 px-4 py-3">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">Total Problems</span>
                  <span className="text-3xl font-bold text-white">{counts.practical}</span>
                </div>
                <button
                  onClick={handleViewAllPractical}
                  className="inline-flex w-full items-center justify-center rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
                >
                  View All Problems
                </button>
              </div>
            </div>

            <button
              onClick={handleCreatePractical}
              className="mt-8 inline-flex items-center justify-center gap-2 rounded-md border border-neutral-700 bg-white px-4 py-3 text-sm font-medium text-black transition hover:bg-neutral-200 cursor-pointer"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Create Practical Problem
            </button>
          </GlassCard>
        </div>
      </div>

      {showRevealPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <h2 className="text-xl font-semibold">View Answers?</h2>
            <p className="mt-2 text-sm text-neutral-400">
              You&apos;re about to open the full theory question bank with correct answers visible.
              Proceed only if you want to review, otherwise keep practicing without spoilers.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCloseRevealPrompt}
                className="inline-flex items-center justify-center rounded-md border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
              >
                Stay Here
              </button>
              <button
                type="button"
                onClick={handleConfirmReveal}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white cursor-pointer"
              >
                View Questions
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionMaker;
