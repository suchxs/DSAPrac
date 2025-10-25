import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type {
  PracticalQuestionRecord,
  DeletePracticalQuestionPayload,
} from '../types/window';

interface GroupedLesson {
  lesson: string;
  questions: PracticalQuestionRecord[];
}

interface GroupedSection {
  section: string;
  sectionKey: string;
  lessons: GroupedLesson[];
}

interface DeleteModalState {
  record: PracticalQuestionRecord;
  isSubmitting: boolean;
  error: string | null;
}

interface FeedbackState {
  type: 'success' | 'error';
  title: string;
  message: string;
}

const groupQuestions = (questions: PracticalQuestionRecord[]): GroupedSection[] => {
  const sectionMap = new Map<string, GroupedSection>();

  questions.forEach((question) => {
    const sectionKey = `${question.sectionKey}::${question.section}`;
    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, {
        section: question.section,
        sectionKey: question.sectionKey,
        lessons: [],
      });
    }

    const sectionEntry = sectionMap.get(sectionKey)!;
    let lessonEntry = sectionEntry.lessons.find((lesson) => lesson.lesson === question.lesson);
    if (!lessonEntry) {
      lessonEntry = { lesson: question.lesson, questions: [] };
      sectionEntry.lessons.push(lessonEntry);
    }
    lessonEntry.questions.push(question);
  });

  const grouped = Array.from(sectionMap.values());
  grouped.sort((a, b) => a.sectionKey.localeCompare(b.sectionKey));
  grouped.forEach((section) => {
    section.lessons.sort((a, b) => a.lesson.localeCompare(b.lesson));
    section.lessons.forEach((lesson) => {
      lesson.questions.sort((a, b) => a.title.localeCompare(b.title));
    });
  });

  return grouped;
};

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'Easy':
      return 'text-emerald-400';
    case 'Medium':
      return 'text-amber-400';
    case 'Hard':
      return 'text-rose-400';
    default:
      return 'text-neutral-400';
  }
};

const PracticalQuestionLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<PracticalQuestionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteModalState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      const records = await window.api.listPracticalQuestions();
      setQuestions(records);
      setError(null);
    } catch (err) {
      console.error('Failed to load practical questions:', err);
      const message =
        err instanceof Error ? err.message : 'Unable to load questions. Please try again later.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadQuestions();
    const unsubscribe = window.api.onDataRefresh(() => {
      loadQuestions();
    });
    return () => {
      unsubscribe();
    };
  }, []);

  const groupedQuestions = useMemo(() => groupQuestions(questions), [questions]);

  const handleBack = () => {
    navigate('/question-maker');
    window.api.openQuestionMaker();
  };

  const handleOpenEdit = (record: PracticalQuestionRecord) => {
    // Navigate to creator with prefilled data
    navigate('/question-maker/practical', {
      state: {
        editMode: true,
        editData: {
          id: record.id,
          filePath: record.filePath,
          title: record.title,
          description: record.description,
          difficulty: record.difficulty,
          sectionKey: record.sectionKey,
          lesson: record.lesson,
          files: record.files, // Include all files (even answer files)
          testCases: record.testCases,
          imageDataUrl: record.imageDataUrl,
        }
      }
    });
  };

  const handleOpenDelete = (record: PracticalQuestionRecord) => {
    setDeleteState({
      record,
      isSubmitting: false,
      error: null,
    });
  };

  const handleCancelDelete = () => {
    setDeleteState(null);
  };

  const handleConfirmDelete = async () => {
    if (!deleteState || deleteState.isSubmitting) return;

    const payload: DeletePracticalQuestionPayload = {
      id: deleteState.record.id,
      filePath: deleteState.record.filePath,
    };

    setDeleteState((prev) => (prev ? { ...prev, isSubmitting: true, error: null } : prev));

    try {
      await window.api.deletePracticalQuestion(payload);
      const removedId = deleteState.record.id;
      setDeleteState(null);
      setFeedback({
        type: 'success',
        title: 'Problem Deleted',
        message: `Problem ${removedId} has been removed from the library.`,
      });
    } catch (err) {
      console.error('Failed to delete practical question:', err);
      const message =
        err instanceof Error ? err.message : 'Failed to delete the problem. Please try again.';
      setDeleteState((prev) =>
        prev
          ? {
              ...prev,
              error: message,
              isSubmitting: false,
            }
          : prev
      );
    }
  };

  const handleCloseFeedback = () => setFeedback(null);

  return (
    <div className="h-screen bg-neutral-950 text-neutral-50 overflow-hidden">
      <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-6 py-12">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between shrink-0">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Practical Problem Library</h1>
            <p className="mt-1 text-sm text-neutral-400">
              All coding challenges from{' '}
              <span className="font-semibold text-neutral-200">questions/practical</span> folder
            </p>
          </div>
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center justify-center rounded-md border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
          >
            Back
          </button>
        </header>

        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/60 px-6 py-4 text-sm text-neutral-400">
              Loading problems...
            </div>
          </div>
        ) : error ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md rounded-lg border border-rose-500/40 bg-rose-500/10 px-6 py-4 text-sm text-rose-200">
              {error}
            </div>
          </div>
        ) : questions.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="max-w-md rounded-lg border border-neutral-800 bg-neutral-900/60 px-6 py-4 text-sm text-neutral-400">
              No practical problems have been created yet. Add problems from the creator page to
              populate this library.
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-neutral-900 scrollbar-thumb-neutral-700 hover:scrollbar-thumb-neutral-600">
            <div className="space-y-10">
            {groupedQuestions.map((section) => (
              <div key={section.sectionKey} className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">{section.section}</h2>
                  <div className="mt-1 h-0.5 w-16 bg-neutral-700" />
                </div>
                {section.lessons.map((lesson) => (
                  <div key={`${section.sectionKey}-${lesson.lesson}`} className="space-y-4 mt-8">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-medium text-neutral-200">{lesson.lesson}</h3>
                      <span className="text-xs uppercase tracking-wide text-neutral-500">
                        {lesson.questions.length} problem{lesson.questions.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4">
                      {lesson.questions.map((question) => (
                        <article
                          key={question.id}
                          className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 transition hover:border-neutral-700"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <div className="flex items-center gap-3">
                                <h4 className="text-lg font-semibold text-white">
                                  {question.title}
                                </h4>
                                <span
                                  className={`text-xs font-semibold uppercase ${getDifficultyColor(
                                    question.difficulty
                                  )}`}
                                >
                                  {question.difficulty}
                                </span>
                              </div>
                              <p className="mt-2 text-sm text-neutral-400 line-clamp-2">
                                {question.description}
                              </p>
                            </div>
                            {question.createdAt && (
                              <div className="text-right text-xs text-neutral-500 shrink-0">
                                <div>Created</div>
                                <div>{new Date(question.createdAt).toLocaleDateString()}</div>
                              </div>
                            )}
                          </div>

                          {question.imageDataUrl && (
                            <img
                              src={question.imageDataUrl}
                              alt="Problem diagram"
                              className="max-h-48 w-full rounded-lg object-contain bg-neutral-950"
                            />
                          )}

                          <div className="grid grid-cols-2 gap-4 text-xs">
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                              <span className="text-neutral-500">Test Cases:</span>{' '}
                              <span className="text-neutral-200">{question.testCases.length}</span>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                              <span className="text-neutral-500">Avg. Execution Time:</span>{' '}
                              <span className="text-neutral-200">
                                {(() => {
                                  const testsWithTime = question.testCases.filter(tc => tc.executionTime != null);
                                  if (testsWithTime.length === 0) return 'N/A';
                                  const avg = testsWithTime.reduce((sum, tc) => sum + (tc.executionTime || 0), 0) / testsWithTime.length;
                                  return `${avg.toFixed(2)}ms`;
                                })()}
                              </span>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                              <span className="text-neutral-500">Avg. Memory Usage:</span>{' '}
                              <span className="text-neutral-200">
                                {(() => {
                                  const testsWithMemory = question.testCases.filter(tc => tc.memoryUsage != null);
                                  if (testsWithMemory.length === 0) return 'N/A';
                                  const avg = testsWithMemory.reduce((sum, tc) => sum + (tc.memoryUsage || 0), 0) / testsWithMemory.length;
                                  return `${(avg / 1024).toFixed(2)}MB`;
                                })()}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(question)}
                              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-3.5 w-3.5"
                              >
                                <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                              </svg>
                              Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenDelete(question)}
                              className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="h-3.5 w-3.5"
                              >
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                              Delete
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            </div>
          </div>
        )}
      </div>

      {/* Edit Modal - Removed: Edit now navigates to creator */}

      {/* Delete Modal */}
      {deleteState && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <h2 className="text-xl font-semibold">Delete Problem?</h2>
            <p className="mt-2 text-sm text-neutral-400">
              This will permanently remove problem {deleteState.record.id}. Progress counters will
              be updated automatically.
            </p>
            {deleteState.error && (
              <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                {deleteState.error}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={handleCancelDelete}
                disabled={deleteState.isSubmitting}
                className="inline-flex items-center justify-center rounded-md border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={deleteState.isSubmitting}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-rose-500/60 bg-rose-500/20 px-4 py-2 text-sm font-semibold text-rose-100 transition hover:border-rose-400 hover:bg-rose-500/30 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
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
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
                {deleteState.isSubmitting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Modal */}
      {feedback && (
        <div className="fixed inset-0 z-70 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <h2 className="text-xl font-semibold">{feedback.title}</h2>
            <p className="mt-2 text-sm text-neutral-400">{feedback.message}</p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleCloseFeedback}
                className="inline-flex items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white cursor-pointer"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticalQuestionLibrary;
