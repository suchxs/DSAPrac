import React, { useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useNavigate } from "react-router-dom";
import { SECTION_OPTIONS } from "../constants/theorySections";
import type {
  TheoreticalQuestionRecord,
  UpdateTheoreticalQuestionPayload,
  DeleteTheoreticalQuestionPayload,
} from "../types/window";

interface GroupedLesson {
  lesson: string;
  questions: TheoreticalQuestionRecord[];
}

interface GroupedSection {
  section: string;
  sectionKey: string;
  lessons: GroupedLesson[];
}

interface EditableChoice {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface EditImageItem {
  id: string;
  name: string;
  dataUrl: string;
}

interface EditModalState {
  record: TheoreticalQuestionRecord;
  sectionKey: string;
  lesson: string;
  question: string;
  author: string;
  questionType: "mcq" | "identification";
  identificationAnswers: string[];
  isPreviousExam: boolean;
  examSchoolYear: string;
  examSemester: string;
  choices: EditableChoice[];
  images: EditImageItem[];
  imageDirty: boolean;
  imageError: string | null;
  submitError: string | null;
  isSubmitting: boolean;
}

interface DeleteModalState {
  record: TheoreticalQuestionRecord;
  isSubmitting: boolean;
  error: string | null;
}

interface FeedbackState {
  type: "success" | "error";
  title: string;
  message: string;
}

const MIN_CHOICES = 4;
const MAX_CHOICES = 10;
const MAX_EDIT_IMAGES = 5;

const groupQuestions = (questions: TheoreticalQuestionRecord[]): GroupedSection[] => {
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
      lesson.questions.sort((a, b) => a.id.localeCompare(b.id));
    });
  });

  return grouped;
};

const getLessonOptions = (sectionKey: string): string[] => {
  return SECTION_OPTIONS.find((option) => option.value === sectionKey)?.lessons ?? [];
};

const createEditableChoice = (text: string, isCorrect: boolean, seed: number): EditableChoice => ({
  id: `choice-${seed}-${Math.random().toString(16).slice(2, 8)}`,
  text,
  isCorrect,
});

const createBlankChoice = (): EditableChoice =>
  createEditableChoice("", false, Date.now());

const TheoreticalQuestionLibrary: React.FC = () => {
  const navigate = useNavigate();
  const [questions, setQuestions] = useState<TheoreticalQuestionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditModalState | null>(null);
  const [deleteState, setDeleteState] = useState<DeleteModalState | null>(null);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const editFileInputRef = useRef<HTMLInputElement | null>(null);

  const loadQuestions = async () => {
    try {
      setIsLoading(true);
      const records = await window.api.listTheoreticalQuestions();
      setQuestions(records);
      setError(null);
    } catch (err) {
      console.error("Failed to load theoretical questions:", err);
      const message =
        err instanceof Error ? err.message : "Unable to load questions. Please try again later.";
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
    navigate("/question-maker");
    window.api.openQuestionMaker();
  };

  const handleOpenEdit = (record: TheoreticalQuestionRecord) => {
    const questionType = record.questionType === "identification" ? "identification" : "mcq";
    const editableChoices =
      record.choices.length > 0
        ? record.choices.map((choice, index) =>
            createEditableChoice(choice.text, choice.isCorrect, index)
          )
        : Array.from({ length: MIN_CHOICES }, () => createBlankChoice());
    const identificationAnswers =
      questionType === "identification"
        ? record.identificationAnswers && record.identificationAnswers.length > 0
          ? record.identificationAnswers
          : [""]
        : [];

    // Convert imageDataUrls array to EditImageItem array
    const existingImages: EditImageItem[] = (record.imageDataUrls ?? []).map((url, index) => ({
      id: `existing-${index}-${Date.now()}`,
      name: `image-${index + 1}`,
      dataUrl: url,
    }));

    setEditState({
      record,
      sectionKey: record.sectionKey,
      lesson: record.lesson,
      question: record.question,
      author: record.author ?? "",
      questionType,
      identificationAnswers,
      isPreviousExam: record.isPreviousExam ?? false,
      examSchoolYear: record.examSchoolYear ?? "",
      examSemester: record.examSemester ?? "",
      choices: editableChoices,
      images: existingImages,
      imageDirty: false,
      imageError: null,
      submitError: null,
      isSubmitting: false,
    });
    if (editFileInputRef.current) {
      editFileInputRef.current.value = "";
    }
  };

  const handleCloseEdit = () => {
    setEditState(null);
    if (editFileInputRef.current) {
      editFileInputRef.current.value = "";
    }
  };

  const handleEditSectionChange = (sectionKey: string) => {
    setEditState((prev) => {
      if (!prev) return prev;
      const lessons = getLessonOptions(sectionKey);
      const nextLesson = lessons.includes(prev.lesson) ? prev.lesson : lessons[0] ?? "";
      return {
        ...prev,
        sectionKey,
        lesson: nextLesson,
      };
    });
  };

  const handleEditQuestionTypeChange = (type: "mcq" | "identification") => {
    setEditState((prev) => {
      if (!prev || prev.questionType === type) return prev;

      if (type === "mcq") {
        const nextChoices =
          prev.choices.length > 0 ? prev.choices : Array.from({ length: MIN_CHOICES }, () => createBlankChoice());
        return {
          ...prev,
          questionType: "mcq",
          choices: nextChoices,
          // Keep identification answers so they can be restored if the user switches back before saving
          identificationAnswers: prev.identificationAnswers.length > 0 ? prev.identificationAnswers : [""],
        };
      }

      return {
        ...prev,
        questionType: "identification",
        identificationAnswers: prev.identificationAnswers.length > 0 ? prev.identificationAnswers : [""],
      };
    });
  };

  const handleEditLessonChange = (lesson: string) => {
    setEditState((prev) => (prev ? { ...prev, lesson } : prev));
  };

  const handleEditQuestionChange = (value: string) => {
    setEditState((prev) => (prev ? { ...prev, question: value } : prev));
  };

  const handleEditAuthorChange = (value: string) => {
    setEditState((prev) => (prev ? { ...prev, author: value } : prev));
  };

  const handleTogglePreviousExam = (checked: boolean) => {
    setEditState((prev) =>
      prev
        ? {
            ...prev,
            isPreviousExam: checked,
            examSchoolYear: checked ? prev.examSchoolYear : '',
            examSemester: checked ? prev.examSemester : '',
          }
        : prev
    );
  };

  const handleExamSemesterChange = (value: string) => {
    setEditState((prev) => (prev ? { ...prev, examSemester: value } : prev));
  };

  const handleExamSchoolYearChange = (value: string) => {
    setEditState((prev) => (prev ? { ...prev, examSchoolYear: value } : prev));
  };

  const handleChoiceTextChange = (id: string, value: string) => {
    setEditState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        choices: prev.choices.map((choice) =>
          choice.id === id ? { ...choice, text: value } : choice
        ),
      };
    });
  };

  const handleToggleChoiceCorrect = (id: string) => {
    setEditState((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        choices: prev.choices.map((choice) =>
          choice.id === id ? { ...choice, isCorrect: !choice.isCorrect } : choice
        ),
      };
    });
  };

  const handleAddChoice = () => {
    setEditState((prev) => {
      if (!prev || prev.choices.length >= MAX_CHOICES) return prev;
      return {
        ...prev,
        choices: [...prev.choices, createBlankChoice()],
      };
    });
  };

  const handleRemoveChoice = (id: string) => {
    setEditState((prev) => {
      if (!prev || prev.choices.length <= MIN_CHOICES) return prev;
      return {
        ...prev,
        choices: prev.choices.filter((choice) => choice.id !== id),
      };
    });
  };

  const editCorrectCount = editState
    ? editState.questionType === "mcq"
      ? editState.choices.reduce((count, choice) => (choice.isCorrect ? count + 1 : count), 0)
      : editState.identificationAnswers.filter((a) => a.trim().length > 0).length
    : 0;

  const editChoicesMetRequirement = editState
    ? editState.questionType === "mcq"
      ? editState.choices.length >= MIN_CHOICES
      : editState.identificationAnswers.some((a) => a.trim().length > 0)
    : false;

  const isEditValid =
    !!editState &&
    !!editState.sectionKey &&
    !!editState.lesson &&
    editState.author.trim().length > 0 &&
    editState.question.trim().length > 0 &&
    (editState.questionType === "mcq"
      ? editState.choices.length >= MIN_CHOICES &&
        editState.choices.every((choice) => choice.text.trim().length > 0) &&
        editCorrectCount > 0
      : editState.identificationAnswers.some((a) => a.trim().length > 0));

  const handleEditImageButton = () => {
    editFileInputRef.current?.click();
  };

  const handleEditImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    // Check if we've reached max images
    if (editState && editState.images.length >= MAX_EDIT_IMAGES) {
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              imageError: `Maximum ${MAX_EDIT_IMAGES} images allowed.`,
            }
          : prev
      );
      event.target.value = "";
      return;
    }

    if (!["image/png", "image/jpeg"].includes(file.type)) {
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              imageError: "Unsupported file type. Please choose a PNG or JPG image.",
            }
          : prev
      );
      event.target.value = "";
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              imageError: "Image is too large. Please choose a file under 5MB.",
            }
          : prev
      );
      event.target.value = "";
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : null;
      if (!dataUrl) return;
      
      const newImage: EditImageItem = {
        id: `img-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        name: file.name,
        dataUrl,
      };
      
      setEditState((prev) =>
        prev
          ? {
              ...prev,
              images: [...prev.images, newImage],
              imageDirty: true,
              imageError: null,
            }
          : prev
      );
    };
    reader.readAsDataURL(file);
    event.target.value = "";
  };

  const handleAddIdentificationAnswerEdit = () => {
    setEditState((prev) => {
      if (!prev) return prev;
      return { ...prev, identificationAnswers: [...prev.identificationAnswers, ""] };
    });
  };

  const handleIdentificationChangeEdit = (idx: number, value: string) => {
    setEditState((prev) => {
      if (!prev) return prev;
      const next = prev.identificationAnswers.map((a, i) => (i === idx ? value : a));
      return { ...prev, identificationAnswers: next };
    });
  };

  const handleRemoveIdentificationEdit = (idx: number) => {
    setEditState((prev) => {
      if (!prev) return prev;
      const next = prev.identificationAnswers.filter((_, i) => i !== idx);
      return { ...prev, identificationAnswers: next.length > 0 ? next : [""] };
    });
  };

  const handleRemoveEditImage = (imageId: string) => {
    setEditState((prev) =>
      prev
        ? {
            ...prev,
            images: prev.images.filter(img => img.id !== imageId),
            imageDirty: true,
            imageError: null,
          }
        : prev
    );
  };

  const handleMoveEditImageUp = (index: number) => {
    if (index === 0) return;
    setEditState((prev) => {
      if (!prev) return prev;
      const newImages = [...prev.images];
      [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
      return { ...prev, images: newImages, imageDirty: true };
    });
  };

  const handleMoveEditImageDown = (index: number) => {
    if (!editState || index === editState.images.length - 1) return;
    setEditState((prev) => {
      if (!prev) return prev;
      const newImages = [...prev.images];
      [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
      return { ...prev, images: newImages, imageDirty: true };
    });
  };

  const handleSubmitEdit = async () => {
    if (!editState || !isEditValid || editState.isSubmitting) return;

    const payload: UpdateTheoreticalQuestionPayload = {
      id: editState.record.id,
      filePath: editState.record.filePath,
      sectionKey: editState.sectionKey,
      lesson: editState.lesson,
      question: editState.question.replace(/\r\n/g, "\n"),
      author: editState.author.trim(),
      choices:
        editState.questionType === "mcq"
          ? editState.choices.map((choice) => ({
              text: choice.text.trim(),
              isCorrect: choice.isCorrect,
            }))
          : [],
      questionType: editState.questionType,
      identificationAnswers:
        editState.questionType === "identification"
          ? editState.identificationAnswers.filter((a) => a.trim().length > 0)
          : undefined,
      isPreviousExam: editState.isPreviousExam,
      examSchoolYear: editState.isPreviousExam ? editState.examSchoolYear : undefined,
      examSemester: editState.isPreviousExam ? editState.examSemester : undefined,
    };

    // Handle multi-image update
    if (editState.imageDirty) {
      payload.images = editState.images.map((img, index) => ({
        name: img.name,
        dataUrl: img.dataUrl,
        order: index,
      }));
    }

    setEditState((prev) => (prev ? { ...prev, isSubmitting: true, submitError: null } : prev));

    try {
      await window.api.updateTheoreticalQuestion(payload);
      const updatedId = editState.record.id;
      handleCloseEdit();
      setFeedback({
        type: "success",
        title: "Question Updated",
        message: `Card ${updatedId} was updated successfully.`,
      });
    } catch (err) {
      console.error("Failed to update theoretical question:", err);
      const message =
        err instanceof Error ? err.message : "Failed to update the question. Please try again.";
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

  const handleOpenDelete = (record: TheoreticalQuestionRecord) => {
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

    const payload: DeleteTheoreticalQuestionPayload = {
      id: deleteState.record.id,
      filePath: deleteState.record.filePath,
    };

    setDeleteState((prev) => (prev ? { ...prev, isSubmitting: true, error: null } : prev));

    try {
      await window.api.deleteTheoreticalQuestion(payload);
      const removedId = deleteState.record.id;
      setDeleteState(null);
      setFeedback({
        type: "success",
        title: "Question Deleted",
        message: `Card ${removedId} has been removed from the library.`,
      });
    } catch (err) {
      console.error("Failed to delete theoretical question:", err);
      const message =
        err instanceof Error ? err.message : "Failed to delete the question. Please try again.";
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
            <h1 className="text-3xl font-semibold tracking-tight">Theory Question Library</h1>
            <p className="mt-1 text-sm text-neutral-400">
              All data is fetched from{" "}
              <span className="font-semibold text-neutral-200">questions/theory</span> folder
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
              Loading questions...
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
              No theoretical questions have been created yet. Add cards from the creator page to populate this library, or join our
              <span className="font-semibold text-neutral-200"> Discord Server</span> for Community Created Questions
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto pr-2 scrollbar-thin scrollbar-track-neutral-900 scrollbar-thumb-neutral-700 hover:scrollbar-thumb-neutral-600">
            <div>
            {groupedQuestions.map((section, sectionIdx) => (
              <div key={section.sectionKey} className={`space-y-8 ${sectionIdx > 0 ? 'mt-16 pt-8 border-t border-neutral-800' : ''}`}>
                <div>
                  <h2 className="text-xl font-semibold text-white">{section.section}</h2>
                  <div className="mt-1 h-0.5 w-16 bg-neutral-700" />
                </div>
                {section.lessons.map((lesson) => (
                  <div key={`${section.sectionKey}-${lesson.lesson}`} className="mt-6 space-y-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-medium text-neutral-200">{lesson.lesson}</h3>
                      <span className="text-xs uppercase tracking-wide text-neutral-500">
                        {lesson.questions.length} card{lesson.questions.length === 1 ? "" : "s"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                      {lesson.questions.map((question) => (
                        <article
                          key={question.id}
                          className="flex flex-col gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/70 p-6 transition hover:border-neutral-700"
                        >
              <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col">
                  <span className="text-xs uppercase tracking-wide text-neutral-500">
                    Card ID
                  </span>
                  <span className="text-sm font-medium text-neutral-300">
                    {question.id}
                  </span>
                  <span className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide border border-blue-500/40 text-blue-200">
                    {question.questionType === 'identification' ? 'Identification' : 'Multiple Choice'}
                  </span>
                </div>
                {question.createdAt && (
                  <div className="text-right text-xs text-neutral-500">
                    <div>Created</div>
                    <div>{question.createdAt}</div>
                              </div>
                            )}
                          </div>

                          <div className="prose prose-invert prose-sm max-w-none">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                h1: ({node, ...props}) => <h1 className="text-white" {...props} />,
                                h2: ({node, ...props}) => <h2 className="text-white" {...props} />,
                                h3: ({node, ...props}) => <h3 className="text-white" {...props} />,
                              }}
                            >
                              {question.question || ''}
                            </ReactMarkdown>
                          </div>

                          {question.imageDataUrls && question.imageDataUrls.length > 0 && (
                            <div className="relative">
                              <img
                                src={question.imageDataUrls[0]}
                                alt="Question attachment"
                                className="max-h-48 w-full rounded-lg object-contain bg-neutral-950"
                              />
                              {question.imageDataUrls.length > 1 && (
                                <span className="absolute top-2 right-2 px-2 py-1 bg-neutral-900/80 rounded-md text-xs text-neutral-400">
                                  +{question.imageDataUrls.length - 1} more
                                </span>
                              )}
                            </div>
                          )}

                          {question.questionType === "identification" ? (
                            <div className="flex flex-col gap-2">
                              {question.identificationAnswers && question.identificationAnswers.length > 0 ? (
                                question.identificationAnswers.map((answer, idx) => (
                                  <div
                                    key={idx}
                                    className="rounded-md border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200"
                                  >
                                    Acceptable #{idx + 1}: <span className="font-semibold">{answer}</span>
                                  </div>
                                ))
                              ) : (
                                <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-neutral-400">
                                  No identification answers provided.
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {question.choices.map((choice, index) => (
                                <div
                                  key={index}
                                  className={`rounded-md px-3 py-2 text-sm ${
                                    choice.isCorrect
                                      ? "border border-emerald-500/60 bg-emerald-500/10 text-emerald-200"
                                      : "border border-neutral-800 bg-neutral-950 text-neutral-400"
                                  }`}
                                >
                                  <span className="font-medium">
                                    {String.fromCharCode(65 + index)}.
                                  </span>{" "}
                                  {choice.text}
                                </div>
                              ))}
                            </div>
                          )}

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

      {editState && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-100 shadow-xl">
            <div className="shrink-0 border-b border-neutral-800 p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">Edit Theoretical Question</h2>
                  <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                    Card {editState.record.id}
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
              <div>
                <label htmlFor="edit-question" className="block text-sm font-medium text-neutral-200">
                  Question
                </label>
                <textarea
                  id="edit-question"
                  value={editState.question}
                  onChange={(event) => handleEditQuestionChange(event.target.value)}
                  className="mt-2 h-32 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                />
                <p className="mt-2 text-xs text-neutral-500">
                  Markdown formatting is supported. Keep the prompt concise and focused on one concept.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="edit-type-mcq"
                    name="edit-question-type"
                    checked={editState.questionType === "mcq"}
                    onChange={() => handleEditQuestionTypeChange("mcq")}
                    className="h-4 w-4 cursor-pointer border-neutral-700 bg-neutral-900 text-neutral-200 focus:ring-neutral-400"
                  />
                  <label htmlFor="edit-type-mcq" className="text-sm font-medium text-neutral-200 cursor-pointer">
                    Multiple Choice
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="edit-type-identification"
                    name="edit-question-type"
                    checked={editState.questionType === "identification"}
                    onChange={() => handleEditQuestionTypeChange("identification")}
                    className="h-4 w-4 cursor-pointer border-neutral-700 bg-neutral-900 text-neutral-200 focus:ring-neutral-400"
                  />
                  <label
                    htmlFor="edit-type-identification"
                    className="text-sm font-medium text-neutral-200 cursor-pointer"
                  >
                    Identification
                  </label>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="edit-section" className="block text-sm font-medium text-neutral-200">
                    Section
                  </label>
                  <select
                    id="edit-section"
                    value={editState.sectionKey}
                    onChange={(event) => handleEditSectionChange(event.target.value)}
                    className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 cursor-pointer"
                  >
                    {SECTION_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="edit-lesson" className="block text-sm font-medium text-neutral-200">
                    Lesson
                  </label>
                  <select
                    id="edit-lesson"
                    value={editState.lesson}
                    onChange={(event) => handleEditLessonChange(event.target.value)}
                    className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 cursor-pointer"
                  >
                {getLessonOptions(editState.sectionKey).map((lesson) => (
                      <option key={lesson} value={lesson}>
                        {lesson}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="edit-author" className="block text-sm font-medium text-neutral-200">
                  Question Author <span className="text-rose-400">*</span>
                </label>
                <input
                  id="edit-author"
                  type="text"
                  value={editState.author}
                  onChange={(event) => handleEditAuthorChange(event.target.value)}
                  placeholder="e.g. Jane Doe"
                  className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 placeholder:text-neutral-600"
                />
              </div>

              <div>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editState.isPreviousExam}
                    onChange={(event) => handleTogglePreviousExam(event.target.checked)}
                    className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
                  />
                  <span className="text-sm font-medium text-neutral-200">
                    This question was part of a previous DSA exam
                  </span>
                </label>

                {editState.isPreviousExam && (
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 pl-7">
                    <div>
                      <label htmlFor="edit-exam-semester" className="block text-sm font-medium text-neutral-200">
                        Semester <span className="text-neutral-500">(optional)</span>
                      </label>
                      <select
                        id="edit-exam-semester"
                        value={editState.examSemester}
                        onChange={(event) => handleExamSemesterChange(event.target.value)}
                        className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 cursor-pointer"
                      >
                        <option value="">Select semester</option>
                        <option value="1st">1st Semester</option>
                        <option value="2nd">2nd Semester</option>
                        <option value="Summer">Summer</option>
                      </select>
                    </div>
                    <div>
                      <label htmlFor="edit-exam-year" className="block text-sm font-medium text-neutral-200">
                        Year <span className="text-neutral-500">(optional)</span>
                      </label>
                      <select
                        id="edit-exam-year"
                        value={editState.examSchoolYear}
                        onChange={(event) => handleExamSchoolYearChange(event.target.value)}
                        className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 cursor-pointer"
                      >
                        <option value="">Select year</option>
                        {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - i).map((year) => (
                          <option key={year} value={year.toString()}>{year}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-3">
                <div className="inline-flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleEditImageButton}
                    disabled={editState.images.length >= MAX_EDIT_IMAGES}
                    className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
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
                    Add Image ({editState.images.length}/{MAX_EDIT_IMAGES})
                  </button>
                  <span className="text-xs text-neutral-500">
                    Optional PNG or JPG images (up to {MAX_EDIT_IMAGES}).
                  </span>
                </div>
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

                {editState.images.length > 0 && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {editState.images.map((img, index) => (
                      <div
                        key={img.id}
                        className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950"
                      >
                        <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-2 text-xs text-neutral-400">
                          <span className="truncate flex-1" title={img.name}>
                            {index + 1}. {img.name}
                          </span>
                          <div className="flex items-center gap-1 ml-2">
                            <button
                              type="button"
                              onClick={() => handleMoveEditImageUp(index)}
                              disabled={index === 0}
                              className="p-1 rounded text-neutral-500 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move up"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleMoveEditImageDown(index)}
                              disabled={index === editState.images.length - 1}
                              className="p-1 rounded text-neutral-500 hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed"
                              title="Move down"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveEditImage(img.id)}
                              className="p-1 rounded text-neutral-500 hover:text-red-400"
                              title="Remove"
                            >
                              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        </div>
                        <img
                          src={img.dataUrl}
                          alt={`Question attachment ${index + 1}`}
                          className="max-h-40 w-full object-contain bg-neutral-950"
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {editState.questionType === "mcq" ? (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wide">
                      Choices
                    </h3>
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs font-medium ${editChoicesMetRequirement ? "text-neutral-500" : "text-rose-400"}`}
                      >
                        {editState.choices.length}/{MIN_CHOICES} required | Max {MAX_CHOICES}
                      </span>
                      <button
                        type="button"
                        onClick={handleAddChoice}
                        disabled={editState.choices.length >= MAX_CHOICES}
                        className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
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
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Choice
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {editState.choices.map((choice, index) => (
                      <div
                        key={choice.id}
                        className={`flex flex-col rounded-lg border px-4 py-3 transition ${
                          choice.isCorrect
                            ? "border-emerald-500/80 bg-emerald-500/10"
                            : "border-neutral-800 bg-neutral-950"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-400">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-xs uppercase text-neutral-300">
                              {String.fromCharCode(65 + index)}
                            </span>
                            <span>Choice {index + 1}</span>
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleToggleChoiceCorrect(choice.id)}
                              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                                choice.isCorrect
                                  ? "border-emerald-400 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30"
                                  : "border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900"
                              }`}
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
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                              {choice.isCorrect ? "Correct Answer" : "Mark Correct"}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveChoice(choice.id)}
                              disabled={editState.choices.length <= MIN_CHOICES}
                              className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
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
                              Remove
                            </button>
                          </div>
                        </div>

                        <textarea
                          value={choice.text}
                          onChange={(event) => handleChoiceTextChange(choice.id, event.target.value)}
                          placeholder={`Answer option ${index + 1}`}
                          className="mt-3 min-h-[72px] w-full rounded-md border border-neutral-800 bg-transparent px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-neutral-200 uppercase tracking-wide">
                      Identification Answers
                    </h3>
                    <div className="flex items-center gap-3 text-xs text-neutral-500">
                      <span>{editCorrectCount} acceptable answer{editCorrectCount === 1 ? "" : "s"}</span>
                      <button
                        type="button"
                        onClick={handleAddIdentificationAnswerEdit}
                        className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-2 text-xs font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
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
                          <line x1="12" y1="5" x2="12" y2="19" />
                          <line x1="5" y1="12" x2="19" y2="12" />
                        </svg>
                        Add Answer
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-col gap-3">
                    {editState.identificationAnswers.map((answer, idx) => (
                      <div
                        key={`${idx}-${editState.record.id}`}
                        className="flex items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 px-4 py-3"
                      >
                        <div className="text-xs uppercase tracking-wide text-neutral-500">#{idx + 1}</div>
                        <input
                          value={answer}
                          onChange={(event) => handleIdentificationChangeEdit(idx, event.target.value)}
                          placeholder="Acceptable answer (case sensitive)"
                          className="flex-1 rounded-md border border-neutral-800 bg-transparent px-3 py-2 text-sm text-neutral-100 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                        />
                        <button
                          type="button"
                          onClick={() => handleRemoveIdentificationEdit(idx)}
                          className="inline-flex items-center justify-center rounded-md border border-neutral-800 p-2 text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
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
                            <path d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4 flex flex-col gap-3 border-t border-neutral-900 pt-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="text-xs text-neutral-500">
                  {editState.questionType === "mcq"
                    ? `Minimum ${MIN_CHOICES} choices. You can mark multiple choices as correct to support select-all-that-apply questions.`
                    : "Provide at least one acceptable answer. Matching is case sensitive."}
                </div>
                <div className="flex items-center gap-3">
                  <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs uppercase tracking-wide text-neutral-400">
                    <span className="font-semibold text-neutral-200">{editCorrectCount}</span>{" "}
                    correct answer{editCorrectCount === 1 ? "" : "s"}
                  </div>
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
                    {editState.isSubmitting ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>

              {editState.submitError && (
                <div className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                  {editState.submitError}
                </div>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {deleteState && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <h2 className="text-xl font-semibold">Delete Question?</h2>
            <p className="mt-2 text-sm text-neutral-400">
              This will permanently remove card {deleteState.record.id}. The associated practice
              counters will be updated automatically.
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
                {deleteState.isSubmitting ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

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

export default TheoreticalQuestionLibrary;
