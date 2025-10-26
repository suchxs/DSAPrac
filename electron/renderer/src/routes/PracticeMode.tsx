import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import GlassCard from '../components/GlassCard';

interface ProgressData {
  version: number;
  theory: Record<string, { answered: number; total: number; lastAnsweredAt?: string }>;
  practical: Record<string, { completed: boolean; completedAt?: string }>;
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

            <div className="space-y-3 flex-1 overflow-y-auto pr-2 scroll-smooth max-h-[420px]">
              {sections.map((section) => (
                <div key={section.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <h3 className="text-sm font-medium opacity-90">{section.name}</h3>
                    <button
                      className="text-blue-200 hover:text-white text-xs"
                      onClick={() => toggleSection(section.id)}
                    >
                      Toggle all
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-1.5">
                    {section.tags.map((tag) => (
                      <label
                        key={tag}
                        className="flex items-center justify-between gap-3 p-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            className="accent-blue-400"
                            checked={selectedTags.has(tag)}
                            onChange={() => toggleTag(tag)}
                          />
                          {tag}
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

            <div className="flex-1 overflow-y-auto pr-2 space-y-6 scroll-smooth max-h-[420px]" style={{ scrollbarWidth: 'thin' }}>
              {Object.keys(groupedPractical).length === 0 ? (
                <div className="p-4 rounded-xl bg-white/5 text-sm opacity-80">
                  No coding problems yet. Create problems in Question Maker to see them here.
                </div>
              ) : (
                Object.entries(groupedPractical).map(([sectionName, lessons], idx) => (
                  <div key={sectionName} className={idx > 0 ? 'mt-6' : ''}>
                    <h3 className="text-xs font-medium opacity-75 mb-2">
                      {sectionName}
                    </h3>
                    {Object.entries(lessons).map(([lessonName, questions]) => (
                      <div key={lessonName} className="space-y-1.5 pl-2 mt-3">
                        <h4 className="text-xs font-medium opacity-75 mb-2">{lessonName}</h4>
                        <div className="space-y-1.5">
                          {questions.map((question) => {
                            const isSelected = selectedPractical === question.id;
                            const isCompleted = progress?.practical[question.id]?.completed || false;
                            
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
                  onClick={() => setSelectedPractical(null)}
                  className="px-4 py-1.5 text-sm rounded-xl bg-white/5 hover:bg-white/10 transition cursor-pointer"
                >
                  Clear Selection
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
    </div>
  );
};

export default PracticeMode;

