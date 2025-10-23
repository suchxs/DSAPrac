import React, { FormEvent, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SECTION_OPTIONS } from '../constants/theorySections';

interface Choice {
  id: string;
  text: string;
  isCorrect: boolean;
}

const MIN_CHOICES = 6;
const MAX_CHOICES = 10;

const createChoice = (index: number): Choice => ({
  id: `choice-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
  text: '',
  isCorrect: false,
});

const TheoreticalQuestionCreator: React.FC = () => {
  const navigate = useNavigate();
  const [question, setQuestion] = useState('');
  const [choices, setChoices] = useState<Choice[]>([]);
  const [section, setSection] = useState('');
  const [lesson, setLesson] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ section: string; lesson: string; id: string } | null>(null);

  const correctCount = useMemo(
    () => choices.reduce((count, choice) => (choice.isCorrect ? count + 1 : count), 0),
    [choices]
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

  const handleSectionChange = (value: string) => {
    setSection(value);
    setLesson('');
  };

  const handleImageButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) return;

    if (!['image/png', 'image/jpeg'].includes(file.type)) {
      setImageError('Unsupported file type. Please choose a PNG or JPG image.');
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setImageError('Image is too large. Please choose a file under 5MB.');
      setImageFile(null);
      setImagePreview(null);
      return;
    }

    setImageError(null);
    setImageFile(file);

    const reader = new FileReader();
    reader.onload = () => {
      setImagePreview(typeof reader.result === 'string' ? reader.result : null);
    };
    reader.readAsDataURL(file);
  };

  const resetImageState = () => {
    setImageFile(null);
    setImagePreview(null);
    setImageError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = () => {
    resetImageState();
  };

  const isFormValid = useMemo(() => {
    if (!question.trim()) return false;
    if (!section || !lesson) return false;
    if (choices.length < MIN_CHOICES) return false;
    const filledChoices = choices.every((choice) => choice.text.trim().length > 0);
    if (!filledChoices) return false;
    return correctCount > 0;
  }, [question, section, lesson, choices, correctCount]);

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
        image: imagePreview
          ? {
              name: imageFile?.name ?? 'embedded-image',
              dataUrl: imagePreview,
            }
          : null,
        choices: choices.map((choice) => ({
          text: choice.text.trim(),
          isCorrect: choice.isCorrect,
        })),
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
                  Add Image
                </button>
                <span className="text-xs text-neutral-500">
                  Optional PNG or JPG to accompany the prompt.
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

              {imagePreview && (
                <div className="overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
                  <div className="flex items-center justify-between border-b border-neutral-800 px-4 py-2 text-xs text-neutral-400">
                    <span>{imageFile?.name}</span>
                    <button
                      type="button"
                      onClick={handleRemoveImage}
                      className="inline-flex items-center gap-1 rounded-md border border-neutral-800 px-2 py-1 text-[11px] font-medium uppercase tracking-wide text-neutral-400 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-200 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <img
                    src={imagePreview}
                    alt="Question attachment preview"
                    className="max-h-64 w-full object-contain bg-neutral-950"
                  />
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

          <div className="flex flex-col gap-4">
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
          </div>

          <div className="mt-10 flex flex-col gap-3 border-t border-neutral-900 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-xs text-neutral-500">
              Minimum {MIN_CHOICES} choices. You can mark multiple choices as correct to support
              select-all-that-apply questions.
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
