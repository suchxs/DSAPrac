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
  const [selectedSection, setSelectedSection] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<'c' | 'cpp' | 'rust'>('c');
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const toggleSection = (sectionId: string) => {
    setSelectedSection((prev) => (prev === sectionId ? null : sectionId));
  };

  const handleStartExam = () => {
    if (!selectedSection) return;

    setShowConfirmModal(true);
  };

  const handleConfirmStartExam = () => {
    if (!selectedSection) return;

    // TODO: Start exam session
    console.log('Starting exam with section:', selectedSection);
    alert(
      `Exam will start with:\nSection: ${selectedSection}\nLanguage: ${selectedLanguage === 'c' ? 'C' : selectedLanguage === 'cpp' ? 'C++' : 'Rust'}\n\nQuestions will be randomized from the current question bank.\n\nFullscreen exam session coming soon!`
    );
    setShowConfirmModal(false);
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

      <div className="container mx-auto px-6 py-6 pb-16 relative max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Exam Mode</h1>
            <p className="opacity-80 text-sm mt-1 leading-relaxed">
              Pick one section for this exam session. Theoretical and practical sets are generated
              from the chosen section.
            </p>
          </div>
          <button onClick={handleBack} className="button-modern px-4 py-2 rounded-xl cursor-pointer">
            Back
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <GlassCard className="p-6 lg:col-span-2">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Select Section</h2>
              {selectedSection && (
                <span className="text-xs px-3 py-1 rounded-full border border-blue-400/40 bg-blue-500/10 text-blue-200">
                  {sections.find((section) => section.id === selectedSection)?.title || selectedSection}
                </span>
              )}
            </div>

            {/* Section Selection */}
            <div className="space-y-2.5 mb-8">
              {sections.map((section) => (
                <button
                  key={section.id}
                  onClick={() => toggleSection(section.id)}
                  className={`w-full text-left flex items-start gap-4 p-4 rounded-xl border transition-all cursor-pointer ${
                    selectedSection === section.id
                      ? 'bg-blue-500/10 border-blue-400/50 shadow-[0_0_0_1px_rgba(96,165,250,0.2)]'
                      : 'bg-white/0 border-white/10 hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium text-lg">{section.title}</div>
                    <div className="text-sm opacity-70 mt-1 leading-relaxed">{section.description}</div>
                  </div>
                  <div className="mt-1">
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        selectedSection === section.id
                          ? 'border-blue-400 bg-blue-500/20'
                          : 'border-neutral-500'
                      }`}
                    >
                      {selectedSection === section.id && <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            <div className="mb-8">
              <h3 className="text-base font-semibold mb-2">Programming Language</h3>
              <p className="text-sm opacity-75 mb-3">
                Select the language for the practical exam part.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={() => setSelectedLanguage('c')}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                    selectedLanguage === 'c'
                      ? 'bg-blue-500/15 border-blue-400/60 text-blue-200'
                      : 'bg-white/0 border-white/10 hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  C
                </button>
                <button
                  onClick={() => setSelectedLanguage('cpp')}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                    selectedLanguage === 'cpp'
                      ? 'bg-red-500/15 border-red-400/60 text-red-200'
                      : 'bg-white/0 border-white/10 hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  C++
                </button>
                <button
                  onClick={() => setSelectedLanguage('rust')}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all cursor-pointer ${
                    selectedLanguage === 'rust'
                      ? 'bg-yellow-500/15 border-yellow-400/60 text-yellow-200'
                      : 'bg-white/0 border-white/10 hover:bg-white/5 hover:border-white/20'
                  }`}
                >
                  Rust
                </button>
              </div>
            </div>

            {/* Start Button */}
            <div className="flex items-center justify-end">
              <button
                onClick={handleStartExam}
                disabled={!selectedSection}
                className={`button-modern px-6 py-3 rounded-xl text-lg font-medium transition-all ${
                  !selectedSection
                    ? 'opacity-50 cursor-not-allowed'
                    : 'hover:scale-105 cursor-pointer'
                }`}
              >
                Start Exam
              </button>
            </div>
          </GlassCard>

          <GlassCard className="p-6">
            <h2 className="text-lg font-semibold mb-4">Exam Coverage</h2>

            <div className="space-y-3">
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="text-sm text-blue-300 font-medium mb-1">Theoretical</div>
                <div className="text-2xl font-semibold">30 mins</div>
                <div className="text-xs opacity-80 mt-1">30 Questions</div>
              </div>

              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
                <div className="text-sm text-violet-300 font-medium mb-1">Practical</div>
                <div className="text-2xl font-semibold">2 Hours</div>
                <div className="text-xs opacity-80 mt-1">4 Questions Total</div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/10 text-xs opacity-70 leading-relaxed">
              Exams are grouped by section. Your selected section determines both theory and
              practical question pools, and questions are randomized from the current bank.
            </div>
          </GlassCard>
        </div>
      </div>

      {showConfirmModal && selectedSection && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="w-full max-w-2xl rounded-2xl border border-white/15 bg-neutral-950/95 p-6 shadow-2xl">
            <h2 className="text-2xl font-semibold mb-1">Start Exam?</h2>
            <p className="text-sm text-neutral-400 mb-5">
              Please confirm your exam configuration before continuing.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4">
                <div className="text-xs uppercase tracking-wide text-blue-300/90 mb-1">Section</div>
                <div className="text-lg font-semibold">
                  {sections.find((section) => section.id === selectedSection)?.title || selectedSection}
                </div>
              </div>
              <div className="rounded-xl border border-violet-500/30 bg-violet-500/10 p-4">
                <div className="text-xs uppercase tracking-wide text-violet-300/90 mb-1">Language</div>
                <div className="text-lg font-semibold">
                  {selectedLanguage === 'c' ? 'C' : selectedLanguage === 'cpp' ? 'C++' : 'Rust'}
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-white/5 p-4 mb-4">
              <h3 className="font-semibold mb-2">Exam Scope</h3>
              <ul className="text-sm text-neutral-300 space-y-1.5">
                <li>• Questions are randomized based on the current question bank.</li>
                <li>• Theoretical: 30 mins, 30 Questions.</li>
                <li>• Practical: 2 Hours, 4 Questions Total.</li>
              </ul>
            </div>

            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 mb-6">
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

            <div className="flex items-center justify-end gap-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmStartExam}
                className="button-modern px-5 py-2.5 rounded-lg cursor-pointer"
              >
                Confirm & Start
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamConfig;
