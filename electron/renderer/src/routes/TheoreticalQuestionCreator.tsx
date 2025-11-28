import React, { FormEvent, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SECTION_OPTIONS } from '../constants/theorySections';

interface Choice {
  id: string;
  text: string;
  isCorrect: boolean;
}

interface ImageItem {
  id: string;
  file: File | null;
  preview: string;
  name: string;
}

const MIN_CHOICES = 4;
const MAX_CHOICES = 10;
const MAX_IMAGES = 5;

const createChoice = (index: number): Choice => ({
  id: `choice-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
  text: '',
  isCorrect: false,
});

type MultiItem = { id: string; subtitle: string; answers: string[] };
const createMultiItem = (): MultiItem => ({
  id: `multi-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  subtitle: '',
  answers: [''],
});

const TheoreticalQuestionCreator: React.FC = () => {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [questionType, setQuestionType] = useState<'mcq' | 'identification' | 'multi-identification'>('mcq');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [identificationAnswers, setIdentificationAnswers] = useState<string[]>(['']);
  const [multiItems, setMultiItems] = useState<MultiItem[]>([createMultiItem()]);
  const [section, setSection] = useState('');
  const [lesson, setLesson] = useState('');
  const [images, setImages] = useState<ImageItem[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [draggedImageId, setDraggedImageId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ section: string; lesson: string; id: string } | null>(null);
  
  // Author
  const [author, setAuthor] = useState('');
  
  // Exam info
  const [isPreviousExam, setIsPreviousExam] = useState(false);
  const [examSchoolYear, setExamSchoolYear] = useState('');
  const [examSemester, setExamSemester] = useState('');

  const correctCount = useMemo(
    () =>
      questionType === 'mcq'
        ? choices.reduce((count, choice) => (choice.isCorrect ? count + 1 : count), 0)
        : questionType === 'identification'
        ? identificationAnswers.filter((a) => a.trim().length > 0).length
        : multiItems.filter((item) => item.answers.some((a) => a.trim().length > 0)).length,
    [choices, questionType, identificationAnswers, multiItems]
  );

  const lessonOptions = useMemo(() => {
    if (!section) {
      return [];
    }
    const matchedSection = SECTION_OPTIONS.find((option) => option.value === section);
    return matchedSection ? matchedSection.lessons : [];
  }, [section]);

  const handleChoiceTextChange = (id: string, value: string) => {
    setChoices((prev) =>
      prev.map((choice) => (choice.id === id ? { ...choice, text: value } : choice))
    );
  };

  const toggleCorrect = (id: string) => {
    setChoices((prev) =>
      prev.map((choice) =>
        choice.id === id ? { ...choice, isCorrect: !choice.isCorrect } : choice
      )
    );
  };

  const handleAddChoice = () => {
    if (choices.length >= MAX_CHOICES) return;
    setChoices((prev) => [...prev, createChoice(prev.length)]);
  };

  const handleRemoveChoice = (id: string) => {
    setChoices((prev) => prev.filter((choice) => choice.id !== id));
  };

  const handleAddIdentificationAnswer = () => {
    setIdentificationAnswers((prev) => [...prev, '']);
  };

  const handleIdentificationChange = (idx: number, value: string) => {
    setIdentificationAnswers((prev) => prev.map((ans, i) => (i === idx ? value : ans)));
  };

  const handleRemoveIdentification = (idx: number) => {
    setIdentificationAnswers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAddMultiItem = () => {
    setMultiItems((prev) => [...prev, createMultiItem()]);
  };

  const handleRemoveMultiItem = (id: string) => {
    setMultiItems((prev) => (prev.length > 1 ? prev.filter((item) => item.id !== id) : prev));
  };

  const handleMultiSubtitleChange = (id: string, value: string) => {
    setMultiItems((prev) => prev.map((item) => (item.id === id ? { ...item, subtitle: value } : item)));
  };

  const handleAddMultiAnswer = (id: string) => {
    setMultiItems((prev) =>
      prev.map((item) =>
        item.id === id ? { ...item, answers: [...item.answers, ''] } : item
      )
    );
  };

  const handleMultiAnswerChange = (id: string, idx: number, value: string) => {
    setMultiItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? { ...item, answers: item.answers.map((ans, i) => (i === idx ? value : ans)) }
          : item
      )
    );
  };

  const handleRemoveMultiAnswer = (id: string, idx: number) => {
    setMultiItems((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
              ...item,
              answers: item.answers.filter((_, i) => i !== idx).length > 0
                ? item.answers.filter((_, i) => i !== idx)
                : [''],
            }
          : item
      )
    );
  };

  const handleSectionChange = (value: string) => {
    setSection(value);
    setLesson('');
  };

  const handleImageButtonClick = () => {
    if (images.length >= MAX_IMAGES) {
      setImageError(`Maximum ${MAX_IMAGES} images allowed.`);
      return;
    }
    fileInputRef.current?.click();
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (images.length >= MAX_IMAGES) {
      setImageError(`Maximum ${MAX_IMAGES} images allowed.`);
      return;
    }

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setImageError('Unsupported file type. Please choose a PNG or JPG image.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image is too large. Please choose a file under 5MB.');
      return;
    }

    setImageError(null);

    const reader = new FileReader();
    reader.onload = () => {
      const preview = typeof reader.result === 'string' ? reader.result : '';
      if (preview) {
        const newImage: ImageItem = {
          id: `img-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          file,
          preview,
          name: file.name,
        };
        setImages((prev) => [...prev, newImage]);
      }
    };
    reader.readAsDataURL(file);

    // Clear file input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetImageState = () => {
    setImages([]);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (imageId: string) => {
    setImages((prev) => prev.filter((img) => img.id !== imageId));
  };

  const handleDragStart = (imageId: string) => {
    setDraggedImageId(imageId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleDrop = (targetId: string) => {
    if (!draggedImageId || draggedImageId === targetId) {
      setDraggedImageId(null);
      return;
    }

    setImages((prev) => {
      const draggedIndex = prev.findIndex((img) => img.id === draggedImageId);
      const targetIndex = prev.findIndex((img) => img.id === targetId);
      if (draggedIndex === -1 || targetIndex === -1) return prev;

      const newImages = [...prev];
      const [removed] = newImages.splice(draggedIndex, 1);
      newImages.splice(targetIndex, 0, removed);
      return newImages;
    });
    setDraggedImageId(null);
  };

  const handleMoveImageUp = (index: number) => {
    if (index === 0) return;
    setImages((prev) => {
      const newImages = [...prev];
      [newImages[index - 1], newImages[index]] = [newImages[index], newImages[index - 1]];
      return newImages;
    });
  };

  const handleMoveImageDown = (index: number) => {
    if (index >= images.length - 1) return;
    setImages((prev) => {
      const newImages = [...prev];
      [newImages[index], newImages[index + 1]] = [newImages[index + 1], newImages[index]];
      return newImages;
    });
  };

  const isFormValid = useMemo(() => {
    if (!question.trim()) return false;
    if (!section || !lesson) return false;
    if (!author.trim()) return false;
    if (questionType === 'mcq') {
      if (choices.length < MIN_CHOICES) return false;
      const filledChoices = choices.every((choice) => choice.text.trim().length > 0);
      if (!filledChoices) return false;
      return correctCount > 0;
    } else if (questionType === 'identification') {
      const filledIds = identificationAnswers.filter((a) => a.trim().length > 0).length;
      return filledIds > 0;
    } else {
      if (multiItems.length === 0) return false;
      const allHaveAnswer = multiItems.every((item) =>
        item.answers.some((ans) => ans.trim().length > 0)
      );
      return allHaveAnswer;
    }
  }, [question, section, lesson, author, choices, correctCount, questionType, identificationAnswers, multiItems]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        question: question.replace(/\r\n/g, '\n'),
        section,
        lesson,
        author: author.trim(),
        images: images.map((img, index) => ({
          name: img.name,
          dataUrl: img.preview,
          order: index,
        })),
        choices: questionType === 'mcq'
          ? choices.map((choice) => ({
              text: choice.text.trim(),
              isCorrect: choice.isCorrect,
            }))
          : [],
        questionType,
        identificationAnswers: questionType === 'identification'
          ? identificationAnswers.filter((a) => a.trim().length > 0)
          : undefined,
        multiIdentificationItems:
          questionType === 'multi-identification'
            ? multiItems
                .map((item) => ({
                  subtitle: item.subtitle.trim(),
                  answers: item.answers.map((a) => a.trim()).filter((a) => a.length > 0),
                }))
                .filter((item) => item.answers.length > 0)
            : undefined,
        isPreviousExam,
        examSchoolYear: isPreviousExam ? examSchoolYear : undefined,
        examSemester: isPreviousExam ? examSemester : undefined,
      };

      const result = await window.api.createTheoreticalQuestion(payload);
      setSubmitSuccess({
        section: result.section,
        lesson: result.lesson,
        id: result.id,
      });
      setSubmitError(null);
    } catch (error) {
      console.error('Failed to create theoretical question:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to save the question. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const choiceRequirementMet = choices.length >= MIN_CHOICES;

  const handleSuccessAcknowledge = () => {
    resetImageState();
    setQuestion('');
    setChoices([]);
    setSection('');
    setLesson('');
    setAuthor('');
    setIsPreviousExam(false);
    setExamSchoolYear('');
    setExamSemester('');
    setSubmitSuccess(null);
    setSubmitError(null);
    navigate('/question-maker');
    window.api.openQuestionMaker();
  };

  return (
    <div className="h-screen overflow-y-auto bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex min-h-full w-full max-w-4xl flex-col px-6 py-12">
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              New Theoretical Question
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Craft a multiple-choice question with at least six options and mark every correct
              answer.
            </p>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
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
                <path d="M19 12H5" />
                <path d="M12 19l-7-7 7-7" />
              </svg>
              Back
            </button>
            <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-xs uppercase tracking-wide text-neutral-400">
              <span className="font-semibold text-neutral-200">{correctCount}</span>{' '}
              correct answer{correctCount === 1 ? '' : 's'}
            </div>
          </div>
        </header>

        <form
          onSubmit={handleSubmit}
          className="flex flex-1 flex-col rounded-xl border border-neutral-900 bg-neutral-900/70 p-6"
        >
          <div className="mb-8">
            <label htmlFor="question" className="block text-sm font-medium text-neutral-200">
              Question
            </label>
            <textarea
              id="question"
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="e.g. What is the time complexity of binary search on a sorted array?"
              className="mt-2 h-32 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
            />
            <p className="mt-2 text-xs text-neutral-500">
              Markdown formatting is supported. Keep the prompt concise and focused on one concept.
            </p>

            <div className="mt-4 flex flex-col gap-3">
              <div className="inline-flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleImageButtonClick}
                  className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
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
                  Add Image ({images.length}/{MAX_IMAGES})
                </button>
                <span className="text-xs text-neutral-500">
                  Optional - Up to {MAX_IMAGES} images, drag to reorder
                </span>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleImageChange}
              />

              {imageError && (
                <div className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {imageError}
                </div>
              )}

              {images.length > 0 && (
                <div className="mt-3 space-y-3">
                  {images.map((img, index) => (
                    <div
                      key={img.id}
                      draggable
                      onDragStart={() => handleDragStart(img.id)}
                      onDragOver={handleDragOver}
                      onDrop={() => handleDrop(img.id)}
                      className={`overflow-hidden rounded-lg border bg-neutral-950 transition-all ${
                        draggedImageId === img.id ? 'border-blue-500 opacity-50' : 'border-neutral-800'
                      }`}
                    >
                      <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1 text-neutral-500">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 cursor-grab" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                            </svg>
                            #{index + 1}
                          </span>
                          <span className="truncate max-w-[200px]">{img.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleMoveImageUp(index)}
                            disabled={index === 0}
                            className="p-1 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveImageDown(index)}
                            disabled={index === images.length - 1}
                            className="p-1 rounded hover:bg-neutral-800 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveImage(img.id)}
                            className="inline-flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                      <img
                        src={img.preview}
                        alt={`Preview ${index + 1}`}
                        className="max-h-48 w-full object-contain bg-neutral-950"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="mb-8 grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="section" className="block text-sm font-medium text-neutral-200">
                Section
              </label>
              <select
                id="section"
                value={section}
                onChange={(event) => handleSectionChange(event.target.value)}
                className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 cursor-pointer"
              >
                <option value="">Select a section</option>
                {SECTION_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-neutral-500">
                Section determines which lesson group the question belongs to.
              </p>
            </div>

            <div>
              <label htmlFor="lesson" className="block text-sm font-medium text-neutral-200">
                Lesson
              </label>
              <select
                id="lesson"
                value={lesson}
                onChange={(event) => setLesson(event.target.value)}
                disabled={!section}
                className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 cursor-pointer disabled:cursor-not-allowed disabled:text-neutral-500"
              >
                <option value="">Select a lesson</option>
                {lessonOptions.map((lessonOption) => (
                  <option key={lessonOption} value={lessonOption}>
                    {lessonOption}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-neutral-500">
                Lessons depend on the selected section. Select a section to see available lessons.
              </p>
            </div>
          </div>

          {/* Author Field */}
          <div className="mb-8">
            <label htmlFor="author" className="block text-sm font-medium text-neutral-200">
              Question Author <span className="text-rose-400">*</span>
            </label>
            <input
              id="author"
              type="text"
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="e.g. John Doe"
              className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 placeholder:text-neutral-600"
            />
          </div>

          {/* Previous Exam Checkbox */}
          <div className="mb-8">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPreviousExam}
                onChange={(e) => setIsPreviousExam(e.target.checked)}
                className="h-4 w-4 rounded border-neutral-700 bg-neutral-900 text-emerald-500 focus:ring-emerald-500 cursor-pointer"
              />
              <span className="text-sm font-medium text-neutral-200">
                This question was part of a previous DSA exam
              </span>
            </label>

            {isPreviousExam && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2 pl-7">
                <div>
                  <label htmlFor="examSemester" className="block text-sm font-medium text-neutral-200">
                    Semester <span className="text-neutral-500">(optional)</span>
                  </label>
                  <select
                    id="examSemester"
                    value={examSemester}
                    onChange={(e) => setExamSemester(e.target.value)}
                    className="mt-2 w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 cursor-pointer"
                  >
                    <option value="">Select semester</option>
                    <option value="1st">1st Semester</option>
                    <option value="2nd">2nd Semester</option>
                    <option value="Summer">Summer</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="examSchoolYear" className="block text-sm font-medium text-neutral-200">
                    Year <span className="text-neutral-500">(optional)</span>
                  </label>
                  <select
                    id="examSchoolYear"
                    value={examSchoolYear}
                    onChange={(e) => setExamSchoolYear(e.target.value)}
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

          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4 flex-wrap">
              <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wide">
                Question Type
              </h2>
              <label className="flex items-center gap-2 text-xs text-neutral-200">
                <input
                  type="radio"
                  checked={questionType === 'mcq'}
                  onChange={() => setQuestionType('mcq')}
                  className="h-3 w-3 text-blue-500 bg-neutral-900 border-neutral-700"
                />
                Multiple Choice
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-200">
                <input
                  type="radio"
                  checked={questionType === 'identification'}
                  onChange={() => setQuestionType('identification')}
                  className="h-3 w-3 text-blue-500 bg-neutral-900 border-neutral-700"
                />
                Identification
              </label>
              <label className="flex items-center gap-2 text-xs text-neutral-200">
                <input
                  type="radio"
                  checked={questionType === 'multi-identification'}
                  onChange={() => setQuestionType('multi-identification')}
                  className="h-3 w-3 text-blue-500 bg-neutral-900 border-neutral-700"
                />
                Multiple Identification
              </label>
            </div>

            {questionType === 'mcq' ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wide">
                    Choices
                  </h2>
                  <div className="flex items-center gap-3">
                    <span
                      className={`text-xs font-medium ${
                        choiceRequirementMet ? 'text-neutral-500' : 'text-rose-400'
                      }`}
                    >
                      {choices.length}/{MIN_CHOICES} required | Max {MAX_CHOICES}
                    </span>
                    <button
                      type="button"
                      onClick={handleAddChoice}
                      disabled={choices.length >= MAX_CHOICES}
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
                  {choices.length === 0 && (
                    <div className="flex items-center justify-between rounded-lg border border-dashed border-neutral-800 bg-neutral-950 px-4 py-6 text-sm text-neutral-500">
                      No choices yet. Use "Add Choice" to start adding answer options.
                    </div>
                  )}
                  {choices.map((choice, index) => {
                    const label = String.fromCharCode(65 + index);
                    const isCorrect = choice.isCorrect;

                    return (
                      <div
                        key={choice.id}
                        className={`flex flex-col rounded-lg border px-4 py-3 transition ${
                          isCorrect
                            ? 'border-emerald-500/80 bg-emerald-500/10'
                            : 'border-neutral-800 bg-neutral-950'
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="flex items-center gap-2 text-sm font-semibold text-neutral-400">
                            <span className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-neutral-900 text-xs uppercase text-neutral-300">
                              {label}
                            </span>
                            <span>Choice {index + 1}</span>
                          </div>

                          <div className="ml-auto flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleCorrect(choice.id)}
                              className={`inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs font-medium transition cursor-pointer ${
                                isCorrect
                                  ? 'border-emerald-400 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                                  : 'border-neutral-800 text-neutral-300 hover:border-neutral-700 hover:bg-neutral-900'
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
                              {isCorrect ? 'Correct Answer' : 'Mark Correct'}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveChoice(choice.id)}
                              className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
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
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
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
                    );
                  })}
                </div>
              </>
            ) : questionType === 'identification' ? (
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wide">
                    Identification Answers
                  </h2>
                  <button
                    type="button"
                    onClick={handleAddIdentificationAnswer}
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
                {identificationAnswers.map((ans, idx) => (
                  <div key={`ident-${idx}`} className="flex items-center gap-2">
                    <input
                      type="text"
                      value={ans}
                      onChange={(e) => handleIdentificationChange(idx, e.target.value)}
                      placeholder="Correct answer"
                      className="flex-1 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                    />
                    {identificationAnswers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => handleRemoveIdentification(idx)}
                        className="text-xs text-rose-300 hover:text-rose-200 px-2 py-1 rounded border border-rose-400/40 bg-rose-500/10 cursor-pointer"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wide">
                    Items & Answers
                  </h2>
                  <button
                    type="button"
                    onClick={handleAddMultiItem}
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
                    Add Item
                  </button>
                </div>
                <div className="grid gap-3">
                  {multiItems.map((item, idx) => (
                    <div
                      key={item.id}
                      className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-4"
                    >
                      <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="text-xs uppercase tracking-wide text-neutral-500">
                            Item {idx + 1}
                          </div>
                          <input
                            type="text"
                            value={item.subtitle}
                            onChange={(e) => handleMultiSubtitleChange(item.id, e.target.value)}
                            placeholder="Optional subtitle / prompt"
                            className="flex-1 min-w-[200px] rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                          />
                          {multiItems.length > 1 && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMultiItem(item.id)}
                              className="text-xs text-rose-300 hover:text-rose-200 px-2 py-1 rounded border border-rose-400/40 bg-rose-500/10 cursor-pointer"
                            >
                              Remove Item
                            </button>
                          )}
                        </div>
                        <div className="flex items-center justify-between pb-2 border-b border-neutral-800">
                          <h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-300">
                            Acceptable Answers
                          </h3>
                        </div>
                        <div className="space-y-3 mt-2">
                          {item.answers.map((ans, aIdx) => (
                            <div key={`${item.id}-ans-${aIdx}`} className="flex items-center gap-2">
                              <input
                                type="text"
                                value={ans}
                                onChange={(e) => handleMultiAnswerChange(item.id, aIdx, e.target.value)}
                                placeholder="Case-sensitive answer"
                                className="flex-1 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                              />
                              {item.answers.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => handleRemoveMultiAnswer(item.id, aIdx)}
                                  className="text-[11px] text-rose-300 hover:text-rose-200 px-2 py-1 rounded border border-rose-400/40 bg-rose-500/10 cursor-pointer"
                                >
                                  Remove
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="pt-2 flex justify-end">
                          <button
                            type="button"
                            onClick={() => handleAddMultiAnswer(item.id)}
                            className="inline-flex items-center gap-2 rounded-md border border-neutral-700 px-3 py-1.5 text-[11px] font-medium text-neutral-100 transition hover:border-neutral-500 hover:bg-neutral-800 cursor-pointer"
                          >
                            Add Answer
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-neutral-900 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-neutral-500">
              {questionType === 'mcq'
                ? `Minimum ${MIN_CHOICES} choices. You can mark multiple choices as correct to support select-all-that-apply questions.`
                : questionType === 'identification'
                ? 'Provide at least one acceptable answer. Matching is case sensitive.'
                : 'Add at least one item with an acceptable answer. Matching is case sensitive and each item is worth 2 points.'}
            </div>
            <button
              type="submit"
              disabled={!isFormValid || isSubmitting}
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
              {isSubmitting ? 'Saving...' : 'Save Question'}
            </button>
          </div>

          {submitError && (
            <div className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              {submitError}
            </div>
          )}
        </form>
      </div>

      {submitSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <div className="flex flex-col gap-2">
              <h2 className="text-xl font-semibold">Question Saved</h2>
              <p className="text-sm text-neutral-400">
                Your theoretical question for{' '}
                <span className="font-medium text-neutral-100">
                  {submitSuccess.section} / {submitSuccess.lesson}
                </span>{' '}
                has been stored successfully.
              </p>
              <p className="text-xs text-neutral-500">
                Files are saved under the repository <span className="font-semibold text-neutral-200">questions/theory</span> directory so they can be version-controlled.
              </p>
              <p className="text-xs text-neutral-500">
                The question bank and progress counters have been updated and are ready for practice.
              </p>
            </div>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleSuccessAcknowledge}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white cursor-pointer"
              >
                Back to Question Maker
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TheoreticalQuestionCreator;
