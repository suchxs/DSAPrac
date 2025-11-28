import React, { useState, useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useLocation, useNavigate } from 'react-router-dom';

interface TheoreticalQuestionRecord {
  id: string;
  sectionKey: string;
  section: string;
  lesson: string;
  filePath: string;
  question: string;
  author?: string;
  choices: Array<{ text: string; isCorrect: boolean }>;
  questionType?: 'mcq' | 'identification';
  identificationAnswers?: string[];
  correctCount: number;
  imageDataUrl?: string | null;
  imageDataUrls?: string[];
  createdAt?: string;
  updatedAt?: string;
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
}

interface QuizAnswer {
  questionId: string;
  selectedAnswers: number[]; // Changed from single number to array for multiple answers
  isCorrect?: boolean;
  textAnswer?: string;
}

interface LocationState {
  selectedTags: string[];
}

const TheoryQuiz: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { selectedTags } = (location.state as LocationState) || { selectedTags: [] };
  const formatElapsed = (ms: number) => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60)
      .toString()
      .padStart(2, '0');
    const seconds = Math.floor(totalSeconds % 60)
      .toString()
      .padStart(2, '0');
    return `${minutes}:${seconds}`;
  };

  const [questions, setQuestions] = useState<TheoreticalQuestionRecord[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Map<string, QuizAnswer>>(new Map());
  const [showResults, setShowResults] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showExitModal, setShowExitModal] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadQuestions();
    timerRef.current = setInterval(() => {
      setElapsedMs((prev) => prev + 1000);
    }, 1000);
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  const loadQuestions = async () => {
    try {
      setLoading(true);
      // Load all theoretical questions
      const allQuestions = await window.api.listTheoreticalQuestions();
      
      // Filter by selected tags (section-lesson combination)
      const filtered = allQuestions.filter((q) =>
        selectedTags.some(tag => `${q.section}-${q.lesson}`.toLowerCase().includes(tag.toLowerCase()) || q.section === tag || q.lesson === tag)
      );

      setQuestions(filtered);
      
      // Initialize answers map
      const initialAnswers = new Map<string, QuizAnswer>();
      filtered.forEach((q) => {
        initialAnswers.set(q.id, {
          questionId: q.id,
          selectedAnswers: [],
        });
      });
      setAnswers(initialAnswers);
    } catch (error) {
      console.error('Failed to load questions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answerIndex: number) => {
    if (showResults) return;

    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion.questionType === 'identification') return;

    const currentAnswer = answers.get(currentQuestion.id);
    const currentSelections = currentAnswer?.selectedAnswers || [];
    
    // Toggle the answer (add if not selected, remove if selected)
    const newSelections = currentSelections.includes(answerIndex)
      ? currentSelections.filter(i => i !== answerIndex)
      : [...currentSelections, answerIndex];

    const newAnswers = new Map(answers);
    newAnswers.set(currentQuestion.id, {
      questionId: currentQuestion.id,
      selectedAnswers: newSelections,
    });
    setAnswers(newAnswers);
  };

  const handleIdentificationInput = (value: string) => {
    if (showResults) return;
    const currentQuestion = questions[currentQuestionIndex];
    if (currentQuestion.questionType !== 'identification') return;

    const newAnswers = new Map(answers);
    newAnswers.set(currentQuestion.id, {
      questionId: currentQuestion.id,
      selectedAnswers: [],
      textAnswer: value,
    });
    setAnswers(newAnswers);
  };

  const handleNext = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(currentQuestionIndex + 1);
    }
  };

  const handleSubmit = async () => {
    // Calculate results
    const newAnswers = new Map(answers);
    const progressUpdates = new Map<string, string[]>(); // Track question IDs per lesson
    
    questions.forEach((q) => {
      const answer = newAnswers.get(q.id);
      if (!answer) return;

      if (q.questionType === 'identification') {
        const provided = (q.identificationAnswers || []).filter((a) => typeof a === 'string' && a.trim().length > 0);
        const user = answer.textAnswer ?? '';
        answer.isCorrect = provided.includes(user);
        newAnswers.set(q.id, answer);
        if (answer.isCorrect) {
          const lesson = q.lesson;
          if (!progressUpdates.has(lesson)) {
            progressUpdates.set(lesson, []);
          }
          progressUpdates.get(lesson)!.push(q.id);
        }
        return;
      }

      if (answer.selectedAnswers.length > 0) {
        // Get all correct answer indices
        const correctIndices = q.choices
          .map((choice, index) => choice.isCorrect ? index : -1)
          .filter(index => index !== -1);
        
        // Check if selected answers match all correct answers exactly
        const selectedSorted = [...answer.selectedAnswers].sort();
        const correctSorted = [...correctIndices].sort();
        answer.isCorrect = JSON.stringify(selectedSorted) === JSON.stringify(correctSorted);
        newAnswers.set(q.id, answer);

        // Track progress for correct answers (by lesson, with question IDs)
        if (answer.isCorrect) {
          const lesson = q.lesson; // Use lesson name, not section name
          console.log('Correct answer for lesson:', lesson, 'question ID:', q.id);
          if (!progressUpdates.has(lesson)) {
            progressUpdates.set(lesson, []);
          }
          progressUpdates.get(lesson)!.push(q.id);
        }
      }
    });

    // Update progress for all correct answers
    console.log('Progress updates to apply:', Array.from(progressUpdates.entries()));
    try {
      for (const [lesson, questionIds] of progressUpdates.entries()) {
        console.log(`Updating progress for "${lesson}": question IDs:`, questionIds);
        const result = await window.api.updateTheory(lesson, questionIds);
        console.log('Progress update result:', result);
      }
      
      // Record activity (heatmap) even if no correct answers
      // This ensures the heatmap colors when students practice, regardless of score
      await window.api.recordActivity();
      console.log('Activity recorded for today');
    } catch (error) {
      console.error('Failed to update progress:', error);
    }

    setAnswers(newAnswers);
    setShowResults(true);
    setShowSubmitModal(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const handleBack = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
    navigate('/practice');
  };

  const handleRetry = () => {
    setShowResults(false);
    setCurrentQuestionIndex(0);
    const resetAnswers = new Map<string, QuizAnswer>();
    questions.forEach((q) => {
      resetAnswers.set(q.id, {
        questionId: q.id,
        selectedAnswers: [],
      });
    });
    setAnswers(resetAnswers);
  };

  const getWeakAreas = () => {
    const tagStats = new Map<string, { correct: number; total: number }>();
    
    questions.forEach((q) => {
      const answer = answers.get(q.id);
      const tagKey = `${q.section} - ${q.lesson}`;
      if (!tagStats.has(tagKey)) {
        tagStats.set(tagKey, { correct: 0, total: 0 });
      }
      const stats = tagStats.get(tagKey)!;
      stats.total++;
      if (answer?.isCorrect) {
        stats.correct++;
      }
    });

    const weakAreas = Array.from(tagStats.entries())
      .map(([tag, stats]) => ({
        tag,
        accuracy: (stats.correct / stats.total) * 100,
        correct: stats.correct,
        total: stats.total,
      }))
      .filter(area => area.accuracy < 70)
      .sort((a, b) => a.accuracy - b.accuracy);

    return weakAreas;
  };

  if (loading) {
    return (
      <div className="h-screen relative overflow-y-auto pt-8 scroll-smooth bg-neutral-950 text-neutral-50">
        <div className="container mx-auto px-6 py-4 pb-16 relative max-w-4xl">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-neutral-400">Loading questions...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (questions.length === 0) {
    return (
      <div className="h-screen relative overflow-y-auto pt-8 scroll-smooth bg-neutral-950 text-neutral-50">
        <div className="container mx-auto px-6 py-4 pb-16 relative max-w-4xl">
          <div className="flex items-center justify-center h-[60vh]">
            <div className="text-center">
              <p className="text-xl text-neutral-400 mb-4">No questions found for selected tags</p>
              <button
                onClick={handleBack}
                className="px-6 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors cursor-pointer"
              >
                Back to Practice
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const currentQuestion = questions[currentQuestionIndex];
  const currentAnswer = answers.get(currentQuestion.id);
  const isAnswered = (question: TheoreticalQuestionRecord, answer?: QuizAnswer) => {
    if (!answer) return false;
    if (question.questionType === 'identification') {
      return (answer.textAnswer ?? '').trim().length > 0;
    }
    return answer.selectedAnswers.length > 0;
  };

  const answeredCount = questions.reduce((count, q) => {
    const ans = answers.get(q.id);
    return isAnswered(q, ans) ? count + 1 : count;
  }, 0);

  const allAnswered = questions.every((q) => isAnswered(q, answers.get(q.id)));
  const totalCorrect = Array.from(answers.values()).filter(a => a.isCorrect).length;
  const scorePercentage = (totalCorrect / questions.length) * 100;

  if (showResults) {
    const weakAreas = getWeakAreas();

    return (
      <div className="h-screen relative overflow-y-auto pt-8 scroll-smooth bg-neutral-950 text-neutral-50">
        <div className="container mx-auto px-6 py-4 pb-16 relative max-w-4xl">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-3xl font-semibold tracking-tight mb-2">Quiz Results</h1>
            <p className="text-neutral-400">Review your performance</p>
          </div>

          {/* Score Card */}
          <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-8 mb-6">
            <div className="text-center mb-6">
              <div className="text-6xl font-bold mb-2">
                <span className={scorePercentage >= 70 ? 'text-green-400' : scorePercentage >= 50 ? 'text-yellow-400' : 'text-red-400'}>
                  {scorePercentage.toFixed(0)}%
                </span>
              </div>
              <p className="text-xl text-neutral-300">
                {totalCorrect} out of {questions.length} correct
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-neutral-950 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-400">{totalCorrect}</div>
                <div className="text-xs text-neutral-400 mt-1">Correct</div>
              </div>
              <div className="bg-neutral-950 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-400">{questions.length - totalCorrect}</div>
                <div className="text-xs text-neutral-400 mt-1">Incorrect</div>
              </div>
              <div className="bg-neutral-950 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-400">{questions.length}</div>
                <div className="text-xs text-neutral-400 mt-1">Total</div>
              </div>
            </div>
          </div>

          {/* Weak Areas */}
          {weakAreas.length > 0 && (
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-6 mb-6">
              <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Areas to Improve
              </h2>
              <div className="space-y-3">
                {weakAreas.map((area) => (
                  <div key={area.tag} className="bg-neutral-950 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{area.tag}</span>
                      <span className="text-sm text-neutral-400">
                        {area.correct}/{area.total} ({area.accuracy.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-neutral-800 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          area.accuracy >= 70 ? 'bg-green-500' : area.accuracy >= 50 ? 'bg-yellow-500' : 'bg-red-500'
                        }`}
                        style={{ width: `${area.accuracy}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3">
            <button
              onClick={handleRetry}
              className="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Try Again
            </button>
            <button
              onClick={handleBack}
              className="flex-1 px-6 py-3 bg-neutral-800 hover:bg-neutral-700 rounded-lg font-medium transition-colors cursor-pointer"
            >
              Back to Practice
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen relative overflow-y-auto pt-8 scroll-smooth bg-neutral-950 text-neutral-50">
      <div className="container mx-auto px-6 py-4 pb-16 relative max-w-4xl">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Theory Quiz</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Question {currentQuestionIndex + 1} of {questions.length}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-xs text-neutral-300 font-mono px-3 py-1 rounded bg-neutral-900 border border-neutral-800">
              Time: {Math.floor(elapsedMs / 60000).toString().padStart(2, '0')}:
              {Math.floor((elapsedMs / 1000) % 60).toString().padStart(2, '0')}
            </div>
            <button
              onClick={() => setShowExitModal(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
            >
              Exit Quiz
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between text-sm text-neutral-400 mb-2">
            <span>Progress</span>
            <span>{answeredCount} / {questions.length} answered</span>
          </div>
          <div className="w-full bg-neutral-800 rounded-full h-2">
            <div
              className="bg-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${(questions.length === 0 ? 0 : (answeredCount / questions.length) * 100)}%` }}
            />
          </div>
        </div>

        {/* Question Card */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-xl p-8 mb-6">
          {/* Question Tag */}
          <div className="flex items-center gap-2 mb-2">
            <span className="px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-xs font-medium">
              {currentQuestion.lesson}
            </span>
            <span className="text-xs text-neutral-500">
              {currentQuestion.section}
            </span>
          </div>

          {/* Author */}
          {currentQuestion.author && (
            <div className="text-xs text-neutral-400 mb-4">
              by {currentQuestion.author}
            </div>
          )}

          {/* Question */}
          <div className="prose prose-invert prose-sm max-w-none mb-4 leading-relaxed">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({node, ...props}) => <h1 className="text-white border-b border-white/10 pb-1" {...props} />,
                h2: ({node, ...props}) => <h2 className="text-white border-b border-white/10 pb-1" {...props} />,
                h3: ({node, ...props}) => <h3 className="text-white" {...props} />,
                hr: () => <hr className="border-t border-white/20 my-2" />,
              }}
            >
              {currentQuestion.question || ''}
            </ReactMarkdown>
          </div>

          {/* Images */}
          {currentQuestion.imageDataUrls && currentQuestion.imageDataUrls.length > 0 && (
            <div className={`mb-6 grid gap-3 ${currentQuestion.imageDataUrls.length === 1 ? 'grid-cols-1' : currentQuestion.imageDataUrls.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {currentQuestion.imageDataUrls.map((url, imgIndex) => (
                <div key={imgIndex} className="flex flex-col gap-1">
                  <img
                    src={url}
                    alt={`Question image ${imgIndex + 1}`}
                    className="max-h-48 w-full rounded-lg object-contain bg-neutral-950 border border-neutral-800"
                  />
                  {currentQuestion.imageDataUrls!.length > 1 && (
                    <span className="text-xs text-neutral-500 text-center">Image {imgIndex + 1}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Options */}
          <div className="space-y-3">
            {currentQuestion.questionType === 'identification' ? (
              <div className="flex flex-col gap-2">
                <label className="text-xs text-neutral-400">Enter your answer (case sensitive)</label>
                <input
                  type="text"
                  value={currentAnswer?.textAnswer ?? ''}
                  onChange={(e) => handleIdentificationInput(e.target.value)}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                  placeholder="Your answer"
                />
              </div>
            ) : (
              currentQuestion.choices.map((choice, index) => {
                const letter = String.fromCharCode(65 + index); // A, B, C, D...
                const isSelected = currentAnswer?.selectedAnswers.includes(index);
                
                return (
                  <button
                    key={index}
                    onClick={() => handleAnswerSelect(index)}
                    className={`w-full text-left p-4 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-blue-500/10 border-blue-500 text-blue-400'
                        : 'bg-neutral-950 border-neutral-800 hover:border-neutral-700 hover:bg-neutral-900'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {/* Checkbox */}
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        isSelected
                          ? 'border-blue-500 bg-blue-500'
                          : 'border-neutral-600'
                      }`}>
                        {isSelected && (
                          <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      {/* Letter Label */}
                      <span className="font-semibold text-sm w-6">{letter}.</span>
                      {/* Answer Text */}
                      <span className="flex-1">{choice.text}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Previous Exam Badge - Lower Right */}
          {currentQuestion.isPreviousExam && (
            <div className="flex justify-end mt-4">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 shadow-[0_0_10px_rgba(16,185,129,0.2)]">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-4 w-4 text-emerald-400"
                >
                  <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                  <path d="M6 12v5c3 3 9 3 12 0v-5" />
                </svg>
                <span className="text-xs font-medium text-emerald-400">
                  Previous DSA Exam
                  {(currentQuestion.examSchoolYear || currentQuestion.examSemester) && (
                    <span className="text-emerald-500/70 ml-1">
                      ({[currentQuestion.examSchoolYear, currentQuestion.examSemester].filter(Boolean).join(' • ')})
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between gap-4">
          <button
            onClick={() => currentQuestionIndex > 0 && setCurrentQuestionIndex(currentQuestionIndex - 1)}
            disabled={currentQuestionIndex === 0}
            className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
          >
            Previous
          </button>

          <div className="flex gap-2">
            {questions.map((_, index) => {
              const questionAnswer = answers.get(questions[index].id);
              const answered = isAnswered(questions[index], questionAnswer);

              return (
                <button
                  key={index}
                  onClick={() => setCurrentQuestionIndex(index)}
                  className={`w-8 h-8 rounded-full text-sm font-medium transition-colors cursor-pointer ${
                    index === currentQuestionIndex
                      ? 'bg-blue-500 text-white'
                      : answered
                      ? 'bg-green-500/20 text-green-400 border border-green-500'
                      : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'
                  }`}
                >
                  {index + 1}
                </button>
              );
            })}
          </div>

          {allAnswered ? (
            <button
              onClick={() => setShowSubmitModal(true)}
              className="px-6 py-3 bg-green-600 hover:bg-green-700 rounded-lg font-medium transition-colors cursor-pointer animate-pulse"
            >
              Submit Quiz
            </button>
          ) : (
            <button
              onClick={handleNext}
              disabled={currentQuestionIndex === questions.length - 1}
              className="px-6 py-3 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors cursor-pointer"
            >
              Next
            </button>
          )}
        </div>

        {/* Exit Confirmation Modal */}
        {showExitModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold mb-2">Exit Quiz?</h3>
              <p className="text-neutral-400 mb-6">
                Your progress will be lost. Are you sure you want to exit?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowExitModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBack}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors cursor-pointer"
                >
                  Exit Quiz
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Submit Confirmation Modal */}
        {showSubmitModal && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6 max-w-md w-full mx-4">
              <h3 className="text-xl font-semibold mb-2">Submit Quiz?</h3>
              <p className="text-neutral-400 mb-6">
                You've answered all {questions.length} questions. Ready to see your results?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowSubmitModal(false)}
                  className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 rounded-lg transition-colors cursor-pointer"
                >
                  Review Answers
                </button>
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 rounded-lg transition-colors cursor-pointer"
                >
                  Submit Quiz
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TheoryQuiz;
