import React, { useState, useEffect } from 'react';
import GlassCard from '../components/GlassCard';
import Heatmap from '../components/Heatmap';

interface ProgressData {
  version: number;
  theory: Record<string, { answered: number; total: number; lastAnsweredAt?: string }>;
  practical: Record<string, { completed: boolean; completedAt?: string }>;
  activity: Record<string, number>;
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
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<ProgressData | null>(null);

  useEffect(() => {
    loadProgress();
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
    // TODO: Implement theory quiz start
    console.log('Starting theory quiz with tags:', Array.from(selectedTags));
  };

  const handleBack = () => {
    window.api.openMenu();
  };

  return (
    <div className="min-h-screen relative overflow-hidden pt-8">
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
            <h1 className="text-3xl font-semibold tracking-tight">Practice Mode</h1>
            <p className="opacity-80 text-sm mt-1">
              Select tags below or answer each practical problem.
            </p>
          </div>
          <button onClick={handleBack} className="button-modern px-4 py-2 rounded-xl cursor-pointer">
            Back
          </button>
        </div>

        {/* Theory and Practical Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Theory Section */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold mb-1">Theory</h2>
            <p className="text-sm opacity-80 mb-4">
              Multiple-choice questions. Select tags below.
            </p>

            <div className="space-y-6 max-h-96 overflow-y-auto pr-2">
              {sections.map((section) => (
                <div key={section.id}>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-medium opacity-90">{section.name}</h3>
                    <button
                      className="text-blue-200 hover:text-white text-sm"
                      onClick={() => toggleSection(section.id)}
                    >
                      Toggle all
                    </button>
                  </div>
                  <div className="grid grid-cols-1 gap-2">
                    {section.tags.map((tag) => (
                      <label
                        key={tag}
                        className="flex items-center justify-between gap-3 p-2 rounded-xl hover:bg-white/5 cursor-pointer"
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

            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={handleStartTheory}
                disabled={selectedTags.size === 0}
                className={`button-modern px-5 py-2 rounded-xl ${
                  selectedTags.size === 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
                }`}
              >
                Start Theory Quiz
              </button>
            </div>
          </GlassCard>

          {/* Practical Section */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold mb-1">Practical</h2>
            <p className="text-sm opacity-80 mb-4">Git Gud.</p>

            <div className="max-h-96 overflow-y-auto pr-2 space-y-2">
              <div className="p-4 rounded-xl bg-white/5 text-sm opacity-80">
                No coding problems yet. Once you add problems, they'll appear here with
                completion status.
              </div>
            </div>
          </GlassCard>
        </div>

        {/* Heatmap */}
        {progress && <Heatmap activity={progress.activity} />}
      </div>
    </div>
  );
};

export default PracticeMode;
