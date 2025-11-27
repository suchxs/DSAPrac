import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';

interface PracticalProgress {
  completed: boolean;
  completedAt?: string;
  bestScore?: number;
  totalTests?: number;
  attempts?: number;
  lastAttemptAt?: string;
  lastScore?: number;
}

interface ProgressData {
  version: number;
  theory: Record<string, { answered: number; total: number; lastAnsweredAt?: string }>;
  practical: Record<string, PracticalProgress>;
  activity: Record<string, number>;
}

interface PracticalQuestionRecord {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  sectionKey: string;
  section: string;
  lesson: string;
  filePath: string;
  files: any[];
  testCases: any[];
  imageDataUrl?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

interface Section {
  id: string;
  name: string;
  tags: string[];
}

const sections: Section[] = [
  {
    id: 's1',
    name: 'Section 1',
    tags: ['Arrays', 'Linked Lists', 'Cursor-Based', 'Stack', 'Queue', 'ADT List'],
  },
  {
    id: 's2',
    name: 'Section 2',
    tags: ['SET and ADT Set', 'ADT Dictionary'],
  },
  {
    id: 's3',
    name: 'Section 3',
    tags: [
      'ADT Tree and Implementations',
      'Binary Search Tree (BST)',
      'Heapsort Sorting Technique',
      'Directed and Undirected Graph',
      'Graph Algorithms',
      'ADT Priority Queue',
    ],
  },
];

const PracticeMode: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [practicalQuestions, setPracticalQuestions] = useState<PracticalQuestionRecord[]>([]);
  const [selectedPractical, setSelectedPractical] = useState<string | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  useEffect(() => {
    loadProgress();
    loadPracticalQuestions();
    const unsubscribe = window.api.onDataRefresh(({ progress }) => {
      setProgress(progress);
      loadPracticalQuestions();
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

  const loadPracticalQuestions = async () => {
    try {
      const questions = await window.api.listPracticalQuestions();
      setPracticalQuestions(questions);
    } catch (error) {
      console.error('Failed to load practical questions:', error);
    }
  };

  const toggleTag = (tag: string) => {
    const newSelected = new Set(selectedTags);
    if (newSelected.has(tag)) {
      newSelected.delete(tag);
    } else {
      newSelected.add(tag);
    }
    setSelectedTags(newSelected);
  };

  const toggleSection = (sectionId: string) => {
    const section = sections.find((s) => s.id === sectionId);
    if (!section) return;

    const allSelected = section.tags.every((tag) => selectedTags.has(tag));
    const newSelected = new Set(selectedTags);

    section.tags.forEach((tag) => {
      if (allSelected) {
        newSelected.delete(tag);
      } else {
        newSelected.add(tag);
      }
    });

    setSelectedTags(newSelected);
  };

  const getTagCount = (tag: string) => {
    if (!progress?.theory[tag]) return '0/0';
    const { answered, total } = progress.theory[tag];
    return `${answered}/${total}`;
  };

  const handleStartTheory = () => {
    if (selectedTags.size === 0) return;
    navigate('/practice/theory-quiz', { 
      state: { selectedTags: Array.from(selectedTags) } 
    });
  };

  const handleSelectPractical = (questionId: string) => {
    if (selectedPractical === questionId) {
      setSelectedPractical(null);
    } else {
      setSelectedPractical(questionId);
    }
  };

  const handleStartPractical = () => {
    if (!selectedPractical) return;
    window.api.openPracticalProblem(selectedPractical);
  };

  const handleResetPractical = async () => {
    if (!selectedPractical) return;
    setIsResetting(true);
    try {
      await window.api.resetPracticalProgress({ questionId: selectedPractical });
      setShowResetModal(false);
      setSelectedPractical(null);
      // Progress will be updated via onDataRefresh callback
    } catch (error) {
      console.error('Failed to reset practical progress:', error);
    } finally {
      setIsResetting(false);
    }
  };

  // Group practical questions by section and lesson
  const groupedPractical = practicalQuestions.reduce((acc, question) => {
    const sectionKey = question.section;
    if (!acc[sectionKey]) {
      acc[sectionKey] = {};
    }
    const lessonKey = question.lesson;
    if (!acc[sectionKey][lessonKey]) {
      acc[sectionKey][lessonKey] = [];
    }
    acc[sectionKey][lessonKey].push(question);
    return acc;
  }, {} as Record<string, Record<string, PracticalQuestionRecord[]>>);

  const getDifficultyColor = (difficulty: 'Easy' | 'Medium' | 'Hard') => {
    switch (difficulty) {
      case 'Easy':
        return 'text-green-400';
      case 'Medium':
        return 'text-yellow-400';
      case 'Hard':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  // Calculate overall progress
  const calculateOverallProgress = () => {
    if (!progress) return { solved: 0, total: 0, percentage: 0 };

    // Theory progress: count answered questions
    let theorySolved = 0;
    let theoryTotal = 0;
    Object.values(progress.theory).forEach(({ answered, total }) => {
      theorySolved += answered;
      theoryTotal += total;
    });

    // Practical progress: count completed questions
    const practicalSolved = Object.values(progress.practical).filter(
      (p) => p.completed
    ).length;
    const practicalTotal = practicalQuestions.length;

    const totalSolved = theorySolved + practicalSolved;
    const totalQuestions = theoryTotal + practicalTotal;
    const percentage = totalQuestions > 0 ? (totalSolved / totalQuestions) * 100 : 0;

    return {
      solved: totalSolved,
      total: totalQuestions,
      percentage,
      theorySolved,
      theoryTotal,
      practicalSolved,
      practicalTotal,
    };
  };

  const overallProgress = calculateOverallProgress();

  const handleBack = () => {
    window.api.openMenu();
  };

  return (
    <div className="h-screen relative overflow-y-auto pt-8 scroll-smooth">
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

      <div className="container mx-auto px-6 py-4 pb-16 relative">
        {/* Header */}
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Practice Mode</h1>
            <p className="opacity-80 text-xs mt-0.5">
              Select tags below or answer each practical problem.
            </p>
          </div>
          <button onClick={handleBack} className="button-modern px-4 py-1.5 text-sm rounded-xl cursor-pointer">
            Back
          </button>
        </div>

        {/* Theory and Practical Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 min-h-[500px]">
          {/* Theory Section */}
          <GlassCard className="p-3 flex flex-col min-h-[500px]">
            <h2 className="text-sm font-semibold mb-0.5">Theory</h2>
            <p className="text-xs opacity-80 mb-2">
              Multiple-choice questions. Select tags below.
            </p>

            <div className="space-y-4 flex-1 overflow-y-auto pr-2 scroll-smooth max-h-[420px]">
              {sections.map((section, sectionIdx) => (
                <div 
                  key={section.id} 
                  className={`pb-4 ${sectionIdx > 0 ? 'pt-4' : ''} ${sectionIdx < sections.length - 1 ? 'border-b border-white/10' : ''}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-medium opacity-90">{section.name}</h3>
                    <button
                      className="text-blue-200 hover:text-white text-xs cursor-pointer"
                      onClick={() => toggleSection(section.id)}
                    >
                      Toggle all
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {section.tags.map((tag) => (
                      <label
                        key={tag}
                        className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-white/5 cursor-pointer group"
                      >
                        <span className="flex items-center gap-3">
                          <div className="relative">
                            <input
                              type="checkbox"
                              className="sr-only peer"
                              checked={selectedTags.has(tag)}
                              onChange={() => toggleTag(tag)}
                            />
                            <div className="w-5 h-5 rounded border-2 border-zinc-600 bg-zinc-800/50 peer-checked:bg-blue-500 peer-checked:border-blue-500 transition-all flex items-center justify-center group-hover:border-zinc-500">
                              <svg 
                                className={`w-3 h-3 text-white transition-opacity ${selectedTags.has(tag) ? 'opacity-100' : 'opacity-0'}`}
                                fill="none" 
                                viewBox="0 0 24 24" 
                                stroke="currentColor" 
                                strokeWidth={3}
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          </div>
                          <span className="text-sm">{tag}</span>
                        </span>
                        <span className="tag-count text-xs px-2 py-1 rounded-lg bg-white/10">
                          {getTagCount(tag)}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-end gap-3">
              <button
                onClick={handleStartTheory}
                disabled={selectedTags.size === 0}
                className={`button-modern px-4 py-1.5 text-sm rounded-xl ${
                  selectedTags.size === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                Start Theory Quiz
              </button>
            </div>
          </GlassCard>

          {/* Practical Section */}
          <GlassCard className="p-3 flex flex-col min-h-[500px]">
            <h2 className="text-sm font-semibold mb-0.5">Practical</h2>
            <p className="text-xs opacity-80 mb-2">
              Select one problem to practice.
            </p>

            <div className="flex-1 overflow-y-auto pr-2 space-y-4 scroll-smooth max-h-[420px]" style={{ scrollbarWidth: 'thin' }}>
              {Object.keys(groupedPractical).length === 0 ? (
                <div className="p-4 rounded-xl bg-white/5 text-sm opacity-80">
                  No coding problems yet. Create problems in Question Maker to see them here.
                </div>
              ) : (
                Object.entries(groupedPractical).map(([sectionName, lessons], idx, arr) => (
                  <div 
                    key={sectionName} 
                    className={`pb-4 ${idx > 0 ? 'pt-4' : ''} ${idx < arr.length - 1 ? 'border-b border-white/10' : ''}`}
                  >
                    <h3 className="text-xs font-semibold text-white/80 mb-4 uppercase tracking-wider">
                      {sectionName}
                    </h3>
                    {Object.entries(lessons).map(([lessonName, questions], lessonIdx) => (
                      <div 
                        key={lessonName} 
                        className={`pl-3 ${lessonIdx > 0 ? 'mt-4 pt-3 border-t border-white/5' : ''}`}
                      >
                        <h4 className="text-xs font-medium opacity-70 mb-3">{lessonName}</h4>
                        <div className="space-y-1.5">
                          {questions.map((question) => {
                            const isSelected = selectedPractical === question.id;
                            const progressEntry = progress?.practical[question.id];
                            const isCompleted = progressEntry?.completed ?? false;
                            const bestScore = progressEntry?.bestScore ?? 0;
                            const totalTests =
                              progressEntry?.totalTests ?? (question.testCases?.length ?? 0);
                            const attempts = progressEntry?.attempts ?? 0;

                            let statusLabel = 'Not started';
                            let statusClass =
                              'bg-zinc-800/60 text-zinc-300 border border-zinc-700/50';

                            if (isCompleted) {
                              statusLabel = 'Solved';
                              statusClass =
                                'bg-emerald-500/15 text-emerald-300 border border-emerald-500/40';
                            } else if (attempts > 0) {
                              statusLabel =
                                bestScore > 0 && totalTests > 0
                                  ? `Attempted ${bestScore}/${totalTests}`
                                  : 'Attempted';
                              statusClass =
                                'bg-amber-500/15 text-amber-300 border border-amber-500/40';
                            }

                            return (
                              <button
                                key={question.id}
                                onClick={() => handleSelectPractical(question.id)}
                                className={`w-full text-left p-2 rounded-lg transition-all cursor-pointer ${
                                  isSelected
                                    ? 'bg-blue-500/20 border border-blue-400/50'
                                    : 'bg-white/5 hover:bg-white/10 border border-transparent'
                                }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-medium truncate">
                                        {question.title}
                                      </span>
                                      {isCompleted && (
                                        <svg
                                          className="w-4 h-4 text-green-400 shrink-0"
                                          fill="currentColor"
                                          viewBox="0 0 20 20"
                                        >
                                          <path
                                            fillRule="evenodd"
                                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                              clipRule="evenodd"
                                            />
                                          </svg>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-2">
                                      <span
                                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide border ${statusClass}`}
                                      >
                                        {statusLabel}
                                      </span>
                                      {!isCompleted && attempts > 0 && totalTests > 0 && (
                                        <span className="text-[10px] text-neutral-500 uppercase tracking-wide">
                                          {attempts} attempt{attempts === 1 ? '' : 's'}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                  <span
                                    className={`text-xs font-semibold shrink-0 ${getDifficultyColor(
                                      question.difficulty
                                    )}`}
                                  >
                                    {question.difficulty}
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>

            {selectedPractical && (
              <div className="mt-3 flex items-center justify-end gap-2">
                <button
                  onClick={() => setShowResetModal(true)}
                  className="px-4 py-1.5 text-sm rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 transition cursor-pointer"
                >
                  Reset Problem
                </button>
                <button
                  onClick={handleStartPractical}
                  className="button-modern px-4 py-1.5 text-sm rounded-xl cursor-pointer"
                >
                  Start Problem
                </button>
              </div>
            )}
          </GlassCard>
        </div>

        {/* Overall Progress Bar */}
        {progress && (
          <GlassCard className="p-4 mt-6">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold">Overall Progress</h2>
                  <p className="text-xs opacity-80">
                    Track your completion across all questions
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold">
                    {overallProgress.solved}/{overallProgress.total}
                  </div>
                  <div className="text-xs opacity-80">
                    {overallProgress.percentage.toFixed(1)}% Complete
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div className="relative">
                <div className="h-3 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-blue-500 to-purple-500 transition-all duration-500 ease-out"
                    style={{ width: `${overallProgress.percentage}%` }}
                  />
                </div>
              </div>

              {/* Breakdown */}
              <div className="grid grid-cols-2 gap-3 text-sm mt-6">
                <div className="p-2 rounded-lg bg-white/5">
                  <div className="opacity-70 mb-0.5 text-xs">Theory Questions</div>
                  <div className="font-semibold text-sm">
                    {overallProgress.theorySolved ?? 0}/{overallProgress.theoryTotal ?? 0}
                    <span className="ml-2 opacity-70 text-xs">
                      ({(overallProgress.theoryTotal ?? 0) > 0
                        ? (((overallProgress.theorySolved ?? 0) / (overallProgress.theoryTotal ?? 1)) * 100).toFixed(1)
                        : 0}%)
                    </span>
                  </div>
                </div>
                <div className="p-2 rounded-lg bg-white/5">
                  <div className="opacity-70 mb-0.5 text-xs">Practical Problems</div>
                  <div className="font-semibold text-sm">
                    {overallProgress.practicalSolved ?? 0}/{overallProgress.practicalTotal ?? 0}
                    <span className="ml-2 opacity-70 text-xs">
                      ({(overallProgress.practicalTotal ?? 0) > 0
                        ? (((overallProgress.practicalSolved ?? 0) / (overallProgress.practicalTotal ?? 1)) * 100).toFixed(1)
                        : 0}%)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        )}
      </div>

      {/* Reset Problem Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-700 rounded-2xl p-6 w-[420px] shadow-2xl">
            <div className="flex items-start gap-4 mb-4">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-1">Reset Problem Progress</h3>
                <p className="text-sm text-zinc-400">
                  This will reset all your progress on this problem, including your code changes and submission history. The problem will be restored to its original state as published by the author.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 mt-6">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="px-4 py-2 text-sm rounded-xl bg-zinc-800 hover:bg-zinc-700 transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleResetPractical}
                disabled={isResetting}
                className="px-4 py-2 text-sm rounded-xl bg-red-600 hover:bg-red-500 text-white font-medium transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {isResetting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Resetting...
                  </>
                ) : (
                  'I Understand, Proceed'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeMode;

