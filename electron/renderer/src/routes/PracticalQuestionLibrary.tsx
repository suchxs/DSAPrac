import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SECTION_OPTIONS } from '../constants/theorySections';
import type {
  PracticalQuestionRecord,
  UpdatePracticalQuestionPayload,
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

interface EditableTestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

interface EditModalState {
  record: PracticalQuestionRecord;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  sectionKey: string;
  lesson: string;
  starterCode: string;
  solutionCode: string;
  functionName: string;
  timeLimit: number;
  memoryLimit: number;
  testCases: EditableTestCase[];
  imageDataUrl: string | null;
  imagePreview: string | null;
  imageFileName: string | null;
  imageDirty: boolean;
  removeImage: boolean;
  imageError: string | null;
  submitError: string | null;
  isSubmitting: boolean;
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

const getLessonOptions = (sectionKey: string): string[] => {
  return SECTION_OPTIONS.find((option) => option.value === sectionKey)?.lessons ?? [];
};

const createEditableTestCase = (
  input: string,
  expectedOutput: string,
  isHidden: boolean,
  seed: number
): EditableTestCase => ({
  id: `test-${seed}-${Math.random().toString(16).slice(2, 8)}`,
  input,
  expectedOutput,
  isHidden,
});

const createBlankTestCase = (isHidden: boolean = false): EditableTestCase =>
  createEditableTestCase('', '', isHidden, Date.now());

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
  const [editState, setEditState] = useState<EditModalState | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteModalState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

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
    const editableTestCases =
      record.testCases.length > 0
        ? record.testCases.map((tc, index) =>
            createEditableTestCase(tc.input, tc.expectedOutput, tc.isHidden, index)
          )
        : [createBlankTestCase(false), createBlankTestCase(false)];

    setEditState({
      record,
      title: record.title,
      description: record.description,
      difficulty: record.difficulty,
      sectionKey: record.sectionKey,
      lesson: record.lesson,
      starterCode: record.starterCode,
      solutionCode: record.solutionCode,
      functionName: record.functionName,
      timeLimit: record.timeLimit,
      memoryLimit: record.memoryLimit,
      testCases: editableTestCases,
      imageDataUrl: record.imageDataUrl ?? null,
      imagePreview: record.imageDataUrl ?? null,
      imageFileName: null,
      imageDirty: false,
      removeImage: false,
      imageError: null,
      submitError: null,
      isSubmitting: false,
    });
    if (editFileInputRef.current) {
      editFileInputRef.current.value = '';
    }
  };

  const handleCloseEdit = () => {
    setEditState(null);
    if (editFileInputRef.current) {
      editFileInputRef.current.value = '';
    }
  };

  const handleEditSectionChange = (sectionKey: string) => {
    setEditState((prev) => {
      if (!prev) return prev;
      const lessons = getLessonOptions(sectionKey);
      const nextLesson = lessons.includes(prev.lesson) ? prev.lesson : lessons[0] ?? '';
      return {
        ...prev,
        sectionKey,
        lesson: nextLesson,
      };
    });
  };

  const handleEditImageButton = () => {
    editFileInputRef.current?.click();
  };

  const handleEditImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              imageError: 'Unsupported file type. Please choose a PNG or JPG image.',
            }
          : prev
      );
      event.target.value = '';
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              imageError: 'Image is too large. Please choose a file under 5MB.',
            }
          : prev
      );
      event.target.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              imageDataUrl: dataUrl,
              imagePreview: dataUrl,
              imageFileName: file.name,
              imageDirty: true,
              removeImage: false,
              imageError: null,
            }
          : prev
      );
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleRemoveEditImage = () => {
    setEditState((prev) =>
      prev
        ? {
            ...prev,
            imageDataUrl: null,
            imagePreview: null,
            imageFileName: null,
            imageDirty: true,
            removeImage: true,
            imageError: null,
          }
        : prev
    );
    if (editFileInputRef.current) {
      editFileInputRef.current.value = '';
    }
  };

  const handleTestCaseChange = (id: string, field: keyof EditableTestCase, value: string | boolean) => {
    setEditState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        testCases: prev.testCases.map((tc) =>
          tc.id === id ? { ...tc, [field]: value } : tc
        ),
      };
    });
  };

  const handleAddTestCase = (isHidden: boolean) => {
    setEditState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        testCases: [...prev.testCases, createBlankTestCase(isHidden)],
      };
    });
  };

  const handleRemoveTestCase = (id: string) => {
    setEditState((prev) => {
      if (!prev || prev.testCases.length <= 1) return prev;
      return {
        ...prev,
        testCases: prev.testCases.filter((tc) => tc.id !== id),
      };
    });
  };

  const isEditValid =
    !!editState &&
    !!editState.title.trim() &&
    !!editState.description.trim() &&
    !!editState.sectionKey &&
    !!editState.lesson &&
    !!editState.starterCode.trim() &&
    !!editState.solutionCode.trim() &&
    !!editState.functionName.trim() &&
    editState.timeLimit > 0 &&
    editState.memoryLimit > 0 &&
    editState.testCases.length > 0 &&
    editState.testCases.every((tc) => tc.input.trim().length > 0 && tc.expectedOutput.trim().length > 0);

  const handleSubmitEdit = async () => {
    if (!editState || !isEditValid || editState.isSubmitting) return;

    const payload: UpdatePracticalQuestionPayload = {
      id: editState.record.id,
      filePath: editState.record.filePath,
      title: editState.title.trim(),
      description: editState.description.replace(/\r\n/g, '\n').trim(),
      difficulty: editState.difficulty,
      sectionKey: editState.sectionKey,
      lesson: editState.lesson,
      starterCode: editState.starterCode.replace(/\r\n/g, '\n'),
      solutionCode: editState.solutionCode.replace(/\r\n/g, '\n'),
      functionName: editState.functionName.trim(),
      timeLimit: editState.timeLimit,
      memoryLimit: editState.memoryLimit,
      testCases: editState.testCases.map((tc) => ({
        input: tc.input.trim(),
        expectedOutput: tc.expectedOutput.trim(),
        isHidden: tc.isHidden,
      })),
    };

    if (editState.imageDirty) {
      if (editState.removeImage) {
        payload.image = null;
      } else if (editState.imageDataUrl) {
        payload.image = {
          name: editState.imageFileName ?? 'embedded-image',
          dataUrl: editState.imageDataUrl,
        };
      } else {
        payload.image = null;
      }
    }

    setEditState((prev) => (prev ? { ...prev, isSubmitting: true, submitError: null } : prev));

    try {
      await window.api.updatePracticalQuestion(payload);
      const updatedId = editState.record.id;
      handleCloseEdit();
      setFeedback({
        type: 'success',
        title: 'Problem Updated',
        message: `Problem ${updatedId} was updated successfully.`,
      });
    } catch (err) {
      console.error('Failed to update practical question:', err);
      const message =
        err instanceof Error ? err.message : 'Failed to update the problem. Please try again.';
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              submitError: message,
              isSubmitting: false,
            }
          : prev
      );
    }
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

  const visibleTestCases = editState ? editState.testCases.filter(tc => !tc.isHidden) : [];
  const hiddenTestCases = editState ? editState.testCases.filter(tc => tc.isHidden) : [];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-12">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
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
          <div className="flex-1 space-y-10 overflow-y-auto pr-2">
            {groupedQuestions.map((section) => (
              <div key={section.sectionKey} className="space-y-6">
                <div>
                  <h2 className="text-xl font-semibold text-white">{section.section}</h2>
                  <div className="mt-1 h-0.5 w-16 bg-neutral-700" />
                </div>
                {section.lessons.map((lesson) => (
                  <div key={`${section.sectionKey}-${lesson.lesson}`} className="space-y-4">
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
                              <span className="text-neutral-500">Function:</span>{' '}
                              <span className="font-mono text-neutral-200">
                                {question.functionName}
                              </span>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                              <span className="text-neutral-500">Test Cases:</span>{' '}
                              <span className="text-neutral-200">{question.testCases.length}</span>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                              <span className="text-neutral-500">Time Limit:</span>{' '}
                              <span className="text-neutral-200">{question.timeLimit}ms</span>
                            </div>
                            <div className="rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2">
                              <span className="text-neutral-500">Memory:</span>{' '}
                              <span className="text-neutral-200">{question.memoryLimit}MB</span>
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
        )}
      </div>

      {/* Edit Modal */}
      {editState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm overflow-y-auto py-6">
          <div className="w-full max-w-5xl max-h-[95vh] flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-100 shadow-xl my-auto">
            <div className="shrink-0 border-b border-neutral-800 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Edit Practical Problem</h2>
                  <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                    {editState.record.id}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleCloseEdit}
                  className="inline-flex items-center justify-center rounded-md border border-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="flex flex-col gap-6">
                {/* Title and Difficulty */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                  <div className="lg:col-span-2">
                    <label className="block text-sm font-medium text-neutral-200">
                      Problem Title
                    </label>
                    <input
                      type="text"
                      value={editState.title}
                      onChange={(e) => setEditState((prev) => prev ? { ...prev, title: e.target.value } : prev)}
                      className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-200">
                      Difficulty
                    </label>
                    <select
                      value={editState.difficulty}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev ? { ...prev, difficulty: e.target.value as 'Easy' | 'Medium' | 'Hard' } : prev
                        )
                      }
                      className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    >
                      <option value="Easy">Easy</option>
                      <option value="Medium">Medium</option>
                      <option value="Hard">Hard</option>
                    </select>
                  </div>
                </div>

                {/* Section and Lesson */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-200">Section</label>
                    <select
                      value={editState.sectionKey}
                      onChange={(e) => handleEditSectionChange(e.target.value)}
                      className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    >
                      {SECTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-200">Lesson</label>
                    <select
                      value={editState.lesson}
                      onChange={(e) =>
                        setEditState((prev) => (prev ? { ...prev, lesson: e.target.value } : prev))
                      }
                      className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    >
                      {getLessonOptions(editState.sectionKey).map((lesson) => (
                        <option key={lesson} value={lesson}>
                          {lesson}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <label className="block text-sm font-medium text-neutral-200">
                    Problem Description
                  </label>
                  <textarea
                    value={editState.description}
                    onChange={(e) =>
                      setEditState((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                    }
                    className="mt-2 h-32 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                  />
                </div>

                {/* Image */}
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={handleEditImageButton}
                    className="inline-flex w-fit items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
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
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                      <rect x="3" y="3" width="18" height="18" ry="2" />
                    </svg>
                    {editState.imagePreview ? 'Replace Image' : 'Add Image'}
                  </button>
                  <input
                    ref={editFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg"
                    className="hidden"
                    onChange={handleEditImageChange}
                  />

                  {editState.imageError && (
                    <div className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                      {editState.imageError}
                    </div>
                  )}

                  {editState.imagePreview && (
                    <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
                        <span>{editState.imageFileName ?? 'existing-image'}</span>
                        <button
                          type="button"
                          onClick={handleRemoveEditImage}
                          className="inline-flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                      <img
                        src={editState.imagePreview}
                        alt="Problem preview"
                        className="max-h-64 w-full object-contain bg-neutral-950"
                      />
                    </div>
                  )}
                </div>

                {/* Function Name */}
                <div>
                  <label className="block text-sm font-medium text-neutral-200">
                    Function/Entry Point Name
                  </label>
                  <input
                    type="text"
                    value={editState.functionName}
                    onChange={(e) =>
                      setEditState((prev) => (prev ? { ...prev, functionName: e.target.value } : prev))
                    }
                    className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                  />
                </div>

                {/* Starter and Solution Code */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-200">
                      Starter Code
                    </label>
                    <textarea
                      value={editState.starterCode}
                      onChange={(e) =>
                        setEditState((prev) => (prev ? { ...prev, starterCode: e.target.value } : prev))
                      }
                      className="mt-2 h-48 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-200">
                      Solution Code
                    </label>
                    <textarea
                      value={editState.solutionCode}
                      onChange={(e) =>
                        setEditState((prev) => (prev ? { ...prev, solutionCode: e.target.value } : prev))
                      }
                      className="mt-2 h-48 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    />
                  </div>
                </div>

                {/* Limits */}
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-200">
                      Time Limit (ms)
                    </label>
                    <input
                      type="number"
                      value={editState.timeLimit}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev ? { ...prev, timeLimit: parseInt(e.target.value) || 0 } : prev
                        )
                      }
                      min="1"
                      className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-200">
                      Memory Limit (MB)
                    </label>
                    <input
                      type="number"
                      value={editState.memoryLimit}
                      onChange={(e) =>
                        setEditState((prev) =>
                          prev ? { ...prev, memoryLimit: parseInt(e.target.value) || 0 } : prev
                        )
                      }
                      min="1"
                      className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    />
                  </div>
                </div>

                {/* Test Cases */}
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-neutral-200">
                      Test Cases
                    </h3>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddTestCase(false)}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3 w-3"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Visible
                      </button>
                      <button
                        type="button"
                        onClick={() => handleAddTestCase(true)}
                        className="inline-flex items-center gap-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
                      >
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-3 w-3"
                        >
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Hidden
                      </button>
                    </div>
                  </div>

                  {/* Visible Test Cases */}
                  {visibleTestCases.length > 0 && (
                    <div className="mb-4">
                      <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
                        Visible Test Cases
                      </h4>
                      <div className="space-y-3">
                        {visibleTestCases.map((tc, index) => (
                          <div
                            key={tc.id}
                            className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-neutral-400">
                                Test #{index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTestCase(tc.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              <div>
                                <label className="block text-xs font-medium text-neutral-400">
                                  Input
                                </label>
                                <textarea
                                  value={tc.input}
                                  onChange={(e) =>
                                    handleTestCaseChange(tc.id, 'input', e.target.value)
                                  }
                                  className="mt-1 h-16 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-neutral-400">
                                  Expected Output
                                </label>
                                <textarea
                                  value={tc.expectedOutput}
                                  onChange={(e) =>
                                    handleTestCaseChange(tc.id, 'expectedOutput', e.target.value)
                                  }
                                  className="mt-1 h-16 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Hidden Test Cases */}
                  {hiddenTestCases.length > 0 && (
                    <div>
                      <h4 className="mb-3 text-xs font-medium uppercase tracking-wide text-neutral-400">
                        Hidden Test Cases
                      </h4>
                      <div className="space-y-3">
                        {hiddenTestCases.map((tc, index) => (
                          <div
                            key={tc.id}
                            className="rounded-lg border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <div className="mb-2 flex items-center justify-between">
                              <span className="text-xs font-medium text-neutral-400">
                                Hidden Test #{index + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveTestCase(tc.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                              <div>
                                <label className="block text-xs font-medium text-neutral-400">
                                  Input
                                </label>
                                <textarea
                                  value={tc.input}
                                  onChange={(e) =>
                                    handleTestCaseChange(tc.id, 'input', e.target.value)
                                  }
                                  className="mt-1 h-16 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                                />
                              </div>
                              <div>
                                <label className="block text-xs font-medium text-neutral-400">
                                  Expected Output
                                </label>
                                <textarea
                                  value={tc.expectedOutput}
                                  onChange={(e) =>
                                    handleTestCaseChange(tc.id, 'expectedOutput', e.target.value)
                                  }
                                  className="mt-1 h-16 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {editState.submitError && (
                  <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    {editState.submitError}
                  </div>
                )}

                <div className="flex justify-end gap-3 border-t border-neutral-900 pt-4">
                  <button
                    type="button"
                    onClick={handleSubmitEdit}
                    disabled={!isEditValid || editState.isSubmitting}
                    className="inline-flex items-center justify-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-5 py-2 text-sm font-medium text-black transition hover:bg-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-60"
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
                      <path d="m5 12 5 5L20 7" />
                    </svg>
                    {editState.isSubmitting ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

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
