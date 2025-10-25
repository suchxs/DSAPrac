import React, { useState } from 'react';
import GlassCard from '../components/GlassCard';

interface SectionInfo {
  id: string;
  title: string;
  description: string;
}

const sections: SectionInfo[] = [
  {
    id: 'section-1',
    title: 'Section 1',
    description: 'Arrays, Linked Lists, Cursor-Based, Stack, Queue, ADT List',
  },
  {
    id: 'section-2',
    title: 'Section 2',
    description: 'SET and ADT Set, ADT Dictionary',
  },
  {
    id: 'section-3',
    title: 'Section 3',
    description: 'ADT Tree, BST, Heapsort, Graphs, ADT Priority Queue',
  },
];

const ExamConfig: React.FC = () => {
  const [selectedSections, setSelectedSections] = useState<Set<string>>(new Set());

  const toggleSection = (sectionId: string) => {
    const newSelected = new Set(selectedSections);
    if (newSelected.has(sectionId)) {
      newSelected.delete(sectionId);
    } else {
      newSelected.add(sectionId);
    }
    setSelectedSections(newSelected);
  };

  const handleStartExam = () => {
    if (selectedSections.size === 0) return;

    // TODO: Start exam session
    console.log('Starting exam with sections:', Array.from(selectedSections));
    alert(
      `Exam will start with:\nSections: ${Array.from(selectedSections).join(', ')}\n\nFullscreen exam session coming soon!`
    );
  };

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
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Exam Mode</h1>
            <p className="opacity-80 text-sm mt-1">
              Select sections to test your knowledge. Theory and practical questions will be
              bundled and randomized.
            </p>
          </div>
          <button onClick={handleBack} className="button-modern px-4 py-2 rounded-xl cursor-pointer">
            Back
          </button>
        </div>

        <div className="max-w-2xl mx-auto">
          <GlassCard className="p-8">
            <h2 className="text-xl font-semibold mb-2">Configure Your Exam</h2>
            <p className="text-sm opacity-80 mb-6">
              Choose which sections to include in your exam session.
            </p>

            {/* Section Selection */}
            <div className="space-y-4 mb-8">
              {sections.map((section) => (
                <label
                  key={section.id}
                  className="flex items-center gap-3 p-4 rounded-xl hover:bg-white/5 cursor-pointer transition-all"
                >
                  <input
                    type="checkbox"
                    className="accent-blue-400 w-5 h-5"
                    checked={selectedSections.has(section.id)}
                    onChange={() => toggleSection(section.id)}
                  />
                  <div className="flex-1">
                    <div className="font-medium text-lg">{section.title}</div>
                    <div className="text-sm opacity-70 mt-1">{section.description}</div>
                  </div>
                </label>
              ))}
            </div>

            {/* Warning Box */}
            <div className="mb-6 p-4 rounded-xl bg-amber-500/10 border border-amber-500/30">
              <div className="flex items-start gap-3">
                <svg
                  className="w-5 h-5 text-amber-400 shrink-0 mt-0.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                    clipRule="evenodd"
                  />
                </svg>
                <div className="flex-1">
                  <h3 className="font-semibold text-amber-300 mb-1">Important Notice</h3>
                  <ul className="text-sm opacity-90 space-y-1">
                    <li>
                      • The exam will run in <strong>protected fullscreen mode</strong>
                    </li>
                    <li>
                      • Alt-tabbing or switching windows is <strong>not permitted</strong>
                    </li>
                    <li>• A countdown timer will track your progress</li>
                    <li>
                      • Leaving fullscreen will <strong>invalidate your exam</strong>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Start Button */}
            <div className="flex items-center justify-end">
              <button
                onClick={handleStartExam}
                disabled={selectedSections.size === 0}
                className={`button-modern px-6 py-3 rounded-xl text-lg font-medium transition-all ${
                  selectedSections.size === 0
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:scale-105 cursor-pointer'
                }`}
              >
                Start Exam
              </button>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
};

export default ExamConfig;
