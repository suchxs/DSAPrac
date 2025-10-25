import React, { FormEvent, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SECTION_OPTIONS } from '../constants/theorySections';
import Editor from '@monaco-editor/react';

interface CodeFile {
  id: string;
  filename: string;
  content: string;
  isLocked: boolean;
  isAnswerFile: boolean;
  language: 'c' | 'cpp';
}

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
}

type Difficulty = 'Easy' | 'Medium' | 'Hard';

const createCodeFile = (index: number, language: 'c' | 'cpp', filename?: string, isHeaderFile?: boolean): CodeFile => {
  let content = '';
  
  if (isHeaderFile && filename) {
    // Generate header guard from filename
    const guardName = filename
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '_')
      .replace(/_+/g, '_');
    
    content = `#ifndef ${guardName}\n#define ${guardName}\n\n// Your header declarations here\n\n#endif // ${guardName}\n`;
  }
  
  return {
    id: `file-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
    filename: filename || '',
    content,
    isLocked: false,
    isAnswerFile: false,
    language,
  };
};

const createTestCase = (index: number, isHidden: boolean = false): TestCase => ({
  id: `test-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
  input: '',
  expectedOutput: '',
  isHidden,
});

const PracticalQuestionCreator: React.FC = () => {
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('Easy');
  const [section, setSection] = useState('');
  const [lesson, setLesson] = useState('');
  const [defaultLanguage, setDefaultLanguage] = useState<'c' | 'cpp' | null>(null);
  const [files, setFiles] = useState<CodeFile[]>([]);
  const [activeFileId, setActiveFileId] = useState<string>('');
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState<{ section: string; lesson: string; id: string } | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordInput, setRecordInput] = useState('');
  const [recordOutput, setRecordOutput] = useState('');
  const [recordError, setRecordError] = useState<string | null>(null);
  const [isHiddenTest, setIsHiddenTest] = useState(false);
  
  // Modal states
  const [showLanguageModal, setShowLanguageModal] = useState(true);
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isHeaderFile, setIsHeaderFile] = useState(false);

  // Set initial active file
  React.useEffect(() => {
    if (files.length > 0 && !activeFileId) {
      setActiveFileId(files[0].id);
    }
  }, [files, activeFileId]);

  const lessonOptions = useMemo(() => {
    if (!section) {
      return [];
    }
    const matchedSection = SECTION_OPTIONS.find((option) => option.value === section);
    return matchedSection ? matchedSection.lessons : [];
  }, [section]);

  const handleSectionChange = (value: string) => {
    setSection(value);
    setLesson('');
  };

  const activeFile = useMemo(() => {
    return files.find((f) => f.id === activeFileId);
  }, [files, activeFileId]);

  const handleFileChange = (id: string, field: keyof CodeFile, value: string | boolean) => {
    setFiles((prev) =>
      prev.map((file) => (file.id === id ? { ...file, [field]: value } : file))
    );
  };

  const handleEditorChange = (value: string | undefined) => {
    if (activeFileId && value !== undefined) {
      handleFileChange(activeFileId, 'content', value);
    }
  };

  const handleLanguageSelect = (lang: 'c' | 'cpp') => {
    setDefaultLanguage(lang);
    setShowLanguageModal(false);
  };

  const handleAddFile = () => {
    setNewFileName('');
    setIsHeaderFile(false);
    setShowAddFileModal(true);
  };

  const handleConfirmAddFile = () => {
    if (!newFileName.trim() || !defaultLanguage) return;
    
    let filename = newFileName.trim();
    let newFile: CodeFile;
    
    if (isHeaderFile) {
      // Ensure it ends with .h
      if (!filename.endsWith('.h')) {
        filename += '.h';
      }
      newFile = createCodeFile(files.length, defaultLanguage, filename, true);
    } else {
      // Auto-add file extension based on language
      const extension = defaultLanguage === 'c' ? '.c' : '.cpp';
      if (!filename.endsWith('.c') && !filename.endsWith('.cpp')) {
        filename += extension;
      }
      newFile = createCodeFile(files.length, defaultLanguage, filename, false);
    }
    
    newFile.language = defaultLanguage; // Set language based on selection
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setShowAddFileModal(false);
  };

  const handleRemoveFile = (id: string) => {
    if (files.length <= 1) return;
    setFiles((prev) => {
      const newFiles = prev.filter((f) => f.id !== id);
      if (activeFileId === id && newFiles.length > 0) {
        setActiveFileId(newFiles[0].id);
      }
      return newFiles;
    });
  };

  const handleTestCaseChange = (id: string, field: keyof TestCase, value: string | boolean) => {
    setTestCases((prev) =>
      prev.map((tc) => (tc.id === id ? { ...tc, [field]: value } : tc))
    );
  };

  const handleAddTestCase = (isHidden: boolean) => {
    setTestCases((prev) => [...prev, createTestCase(prev.length, isHidden)]);
  };

  const handleRemoveTestCase = (id: string) => {
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
  };

  const handleRecordTestCase = async () => {
    if (files.length === 0) {
      setRecordError('Please add at least one code file before recording a test case.');
      return;
    }

    const allFilesValid = files.every(f => f.filename.trim() && f.content.trim());
    if (!allFilesValid) {
      setRecordError('All files must have a filename and content before recording.');
      return;
    }

    setIsRecording(true);
    setRecordError(null);
    setRecordOutput('');

    try {
      const result = await window.api.executeCodeWithInput({
        files: files.map(f => ({
          filename: f.filename,
          content: f.content,
          isLocked: f.isLocked,
          isAnswerFile: f.isAnswerFile,
          language: f.language,
        })),
        input: recordInput,
      });

      if (!result.success) {
        setRecordError(result.error || 'Code execution failed');
        setRecordOutput('');
        setIsRecording(false);
        return;
      }

      // Show the output
      setRecordOutput(result.output || '');
      
    } catch (error) {
      console.error('Failed to execute code:', error);
      setRecordError(error instanceof Error ? error.message : 'Failed to execute code');
      setRecordOutput('');
      setIsRecording(false);
    }
  };

  const handleSaveTestCase = () => {
    if (!recordOutput) {
      setRecordError('Please run the program first to capture output.');
      return;
    }

    // Create a new test case with the input and captured output
    const newTestCase = createTestCase(testCases.length, isHiddenTest);
    newTestCase.input = recordInput;
    newTestCase.expectedOutput = recordOutput;
    
    setTestCases((prev) => [...prev, newTestCase]);
    
    // Reset recording state
    setRecordInput('');
    setRecordOutput('');
    setIsRecording(false);
    setRecordError(null);
    setIsHiddenTest(false);
  };

  const handleCancelRecording = () => {
    setRecordInput('');
    setRecordOutput('');
    setIsRecording(false);
    setRecordError(null);
    setIsHiddenTest(false);
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

  const visibleTestCases = useMemo(() => testCases.filter(tc => !tc.isHidden), [testCases]);
  const hiddenTestCases = useMemo(() => testCases.filter(tc => tc.isHidden), [testCases]);

  const isFormValid = useMemo(() => {
    if (!title.trim() || !description.trim()) return false;
    if (!section || !lesson) return false;
    if (files.length === 0) return false;
    
    // Check that at least one file is marked as answer file
    const hasAnswerFile = files.some(f => f.isAnswerFile);
    if (!hasAnswerFile) return false;
    
    const allFilesValid = files.every(
      (f) => f.filename.trim().length > 0
    );
    if (!allFilesValid) return false;
    
    // Require at least 3 test cases
    if (testCases.length < 3) return false;
    
    const allTestCasesValid = testCases.every(
      (tc) => tc.input.trim().length > 0 && tc.expectedOutput.trim().length > 0
    );
    return allTestCasesValid;
  }, [title, description, section, lesson, files, testCases]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const payload = {
        title: title.trim(),
        description: description.replace(/\r\n/g, '\n').trim(),
        difficulty,
        section,
        lesson,
        files: files.map((f) => ({
          filename: f.filename.trim(),
          content: f.content.replace(/\r\n/g, '\n'),
          isLocked: f.isLocked,
          isAnswerFile: f.isAnswerFile,
          language: f.language,
        })),
        testCases: testCases.map((tc) => ({
          input: tc.input.trim(),
          expectedOutput: tc.expectedOutput.trim(),
          isHidden: tc.isHidden,
        })),
        image: imagePreview
          ? {
              name: imageFile?.name ?? 'embedded-image',
              dataUrl: imagePreview,
            }
          : null,
      };

      const result = await window.api.createPracticalQuestion(payload);
      setSubmitSuccess({
        section: result.section,
        lesson: result.lesson,
        id: result.id,
      });
      setSubmitError(null);
    } catch (error) {
      console.error('Failed to create practical question:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to save the question. Please try again.';
      setSubmitError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSuccessAcknowledge = () => {
    resetImageState();
    setTitle('');
    setDescription('');
    setDifficulty('Easy');
    setSection('');
    setLesson('');
    setFiles([]);
    setActiveFileId('');
    setTestCases([]);
    setSubmitSuccess(null);
    setSubmitError(null);
    navigate('/question-maker');
    window.api.openQuestionMaker();
  };

  return (
    <div className="fixed inset-0 top-8 bg-neutral-950 text-neutral-100 flex flex-col">
      {/* Top Bar */}
      <div className="h-14 border-b border-neutral-800 bg-neutral-900/70 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-3 py-1.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
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
          <div className="h-6 w-px bg-neutral-700" />
          <h1 className="text-lg font-semibold tracking-tight text-white">
            New Practical Problem
          </h1>
        </div>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!isFormValid || isSubmitting}
          className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-6 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? (
            <>
              <svg
                className="h-4 w-4 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
              Creating...
            </>
          ) : (
            <>
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
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Create Problem
            </>
          )}
        </button>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Problem Description */}
        <div className="w-1/2 border-r border-neutral-800 overflow-y-auto">
          <div className="p-6 space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label htmlFor="title" className="block text-sm font-medium text-neutral-200 mb-2">
                  Problem Title
                </label>
                <input
                  id="title"
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Two Sum"
                  className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                />
              </div>

              <div>
                <label htmlFor="difficulty" className="block text-sm font-medium text-neutral-200 mb-2">
                  Difficulty
                </label>
                <select
                  id="difficulty"
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as Difficulty)}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                >
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div>
                <label htmlFor="section" className="block text-sm font-medium text-neutral-200 mb-2">
                  Section
                </label>
                <select
                  id="section"
                  value={section}
                  onChange={(e) => handleSectionChange(e.target.value)}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                >
                  <option value="">Select Section</option>
                  {SECTION_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="lesson" className="block text-sm font-medium text-neutral-200 mb-2">
                  Lesson
                </label>
                <select
                  id="lesson"
                  value={lesson}
                  onChange={(e) => setLesson(e.target.value)}
                  disabled={!section}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 disabled:opacity-50"
                >
                  <option value="">Select Lesson</option>
                  {lessonOptions.map((lessonName) => (
                    <option key={lessonName} value={lessonName}>
                      {lessonName}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label htmlFor="description" className="block text-sm font-medium text-neutral-200 mb-2">
                Problem Description
              </label>
              <textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe the problem. Markdown is supported."
                className="w-full h-48 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 resize-none"
              />
            </div>

            {/* Image Upload */}
            <div>
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
                Add Image (Optional)
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg"
                className="hidden"
                onChange={handleImageChange}
              />

              {imageError && (
                <div className="mt-3 rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                  {imageError}
                </div>
              )}

              {imagePreview && (
                <div className="mt-3 overflow-hidden rounded-lg border border-neutral-800 bg-neutral-950">
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
                    alt="Preview"
                    className="max-h-64 w-full object-contain p-4"
                  />
                </div>
              )}
            </div>

            {/* Test Cases */}
            <div>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Test Cases</h3>
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
                            Test Case #{index + 1}
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
                            <label className="block text-xs font-medium text-neutral-400 mb-1">
                              Input
                            </label>
                            <textarea
                              value={tc.input}
                              onChange={(e) =>
                                handleTestCaseChange(tc.id, 'input', e.target.value)
                              }
                              placeholder="Input data..."
                              className="h-20 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 resize-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1">
                              Expected Output
                            </label>
                            <textarea
                              value={tc.expectedOutput}
                              onChange={(e) =>
                                handleTestCaseChange(tc.id, 'expectedOutput', e.target.value)
                              }
                              placeholder="Expected output..."
                              className="h-20 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

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
                            Hidden Test Case #{index + 1}
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
                            <label className="block text-xs font-medium text-neutral-400 mb-1">
                              Input
                            </label>
                            <textarea
                              value={tc.input}
                              onChange={(e) =>
                                handleTestCaseChange(tc.id, 'input', e.target.value)
                              }
                              placeholder="Input data..."
                              className="h-20 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 resize-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-neutral-400 mb-1">
                              Expected Output
                            </label>
                            <textarea
                              value={tc.expectedOutput}
                              onChange={(e) =>
                                handleTestCaseChange(tc.id, 'expectedOutput', e.target.value)
                              }
                              placeholder="Expected output..."
                              className="h-20 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-xs text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 resize-none"
                            />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {testCases.length === 0 && (
                <p className="text-center text-sm text-neutral-500 py-8">
                  No test cases yet. Add at least 3 test cases.
                </p>
              )}
            </div>

            {/* Record Test Case */}
            <div className="mb-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Record Test Case</h3>
                <span className="text-xs text-neutral-500">Run code to capture input/output</span>
              </div>

              <div className="rounded-lg border border-neutral-800 bg-neutral-950 p-4 space-y-4">
                {/* Input Area */}
                <div>
                  <label className="block text-sm font-medium text-neutral-200 mb-2">
                    Program Input
                  </label>
                  <textarea
                    value={recordInput}
                    onChange={(e) => setRecordInput(e.target.value)}
                    placeholder="Enter input data for your program (can be empty for programs with no input)"
                    className="h-32 w-full rounded-md border border-neutral-800 bg-neutral-900 px-3 py-2 font-mono text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500 resize-none"
                    disabled={isRecording && !!recordOutput}
                  />
                  <p className="mt-1 text-xs text-neutral-500">
                    Tip: For programs with scanf/cin, enter values line by line
                  </p>
                </div>

                {/* Output Area - Shows after execution */}
                {recordOutput && (
                  <div>
                    <label className="block text-sm font-medium text-neutral-200 mb-2">
                      Program Output
                    </label>
                    <div className="rounded-md border border-green-500/30 bg-green-500/5 px-3 py-2">
                      <pre className="font-mono text-sm text-green-200 whitespace-pre-wrap overflow-x-auto max-h-48 overflow-y-auto">
                        {recordOutput}
                      </pre>
                    </div>
                  </div>
                )}

                {recordError && (
                  <div className="rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
                    {recordError}
                  </div>
                )}

                {/* Action Buttons */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {!recordOutput ? (
                      <button
                        type="button"
                        onClick={handleRecordTestCase}
                        disabled={isRecording}
                        className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isRecording ? (
                          <>
                            <svg
                              className="h-4 w-4 animate-spin"
                              xmlns="http://www.w3.org/2000/svg"
                              fill="none"
                              viewBox="0 0 24 24"
                            >
                              <circle
                                className="opacity-25"
                                cx="12"
                                cy="12"
                                r="10"
                                stroke="currentColor"
                                strokeWidth="4"
                              ></circle>
                              <path
                                className="opacity-75"
                                fill="currentColor"
                                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                              ></path>
                            </svg>
                            Running...
                          </>
                        ) : (
                          <>
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
                              <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            Run Program
                          </>
                        )}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={handleSaveTestCase}
                          className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-green-700 cursor-pointer"
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
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Save Test Case
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelRecording}
                          className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 cursor-pointer"
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
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          Cancel
                        </button>
                      </>
                    )}
                  </div>

                  {recordOutput && (
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isHiddenTest}
                        onChange={(e) => setIsHiddenTest(e.target.checked)}
                        className="rounded border-neutral-700 bg-neutral-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-neutral-950"
                      />
                      <span className="text-xs font-medium text-neutral-400">
                        Hidden Test Case
                      </span>
                    </label>
                  )}
                </div>
              </div>
            </div>

            {submitError && (
              <div className="rounded-md border border-rose-500/50 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
                {submitError}
              </div>
            )}

            {/* Validation Warnings */}
            {!isFormValid && (
              <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
                <div className="font-semibold mb-2">Before saving, please ensure:</div>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  {!title.trim() && <li>Problem title is filled</li>}
                  {!description.trim() && <li>Problem description is filled</li>}
                  {(!section || !lesson) && <li>Section and lesson are selected</li>}
                  {files.length === 0 && <li>At least one code file is added</li>}
                  {!files.some(f => f.isAnswerFile) && <li>At least one file is marked as "Answer File"</li>}
                  {files.some(f => !f.filename.trim()) && <li>All files have a filename</li>}
                  {testCases.length < 3 && <li>At least 3 test cases are added (currently {testCases.length})</li>}
                  {testCases.some(tc => !tc.input.trim() || !tc.expectedOutput.trim()) && (
                    <li>All test cases have input and expected output</li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Code Editor */}
        <div className="w-1/2 flex flex-col">
          {/* File Tabs */}
          <div className="h-12 border-b border-neutral-800 bg-neutral-900/50 flex items-center px-3 gap-2 shrink-0 overflow-x-auto">
            {files.map((file) => (
              <div
                key={file.id}
                className={`group flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition cursor-pointer ${
                  activeFileId === file.id
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/50'
                }`}
                onClick={() => setActiveFileId(file.id)}
              >
                <span className="font-mono text-xs">
                  {file.filename || 'untitled'}
                </span>
                {file.isLocked && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3 text-amber-400"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemoveFile(file.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 transition"
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
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddFile}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-neutral-400 transition hover:text-neutral-200 hover:bg-neutral-800/50 cursor-pointer"
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
              New File
            </button>
          </div>

          {/* File Configuration Bar */}
          {activeFile && (
            <div className="h-14 border-b border-neutral-800 bg-neutral-900/30 flex items-center justify-between px-4 shrink-0">
              <div className="flex items-center gap-4">
                <input
                  type="text"
                  value={activeFile.filename}
                  onChange={(e) => handleFileChange(activeFile.id, 'filename', e.target.value)}
                  placeholder="filename.c"
                  className="w-48 rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 font-mono text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                />
                <select
                  value={activeFile.language}
                  onChange={(e) => handleFileChange(activeFile.id, 'language', e.target.value as 'c' | 'cpp')}
                  className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-1.5 text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                >
                  <option value="c">C</option>
                  <option value="cpp">C++</option>
                </select>
              </div>
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeFile.isAnswerFile}
                    onChange={(e) => handleFileChange(activeFile.id, 'isAnswerFile', e.target.checked)}
                    className="rounded border-neutral-700 bg-neutral-900 text-green-500 focus:ring-green-500 focus:ring-offset-neutral-950"
                  />
                  <span className="text-xs font-medium text-neutral-400">
                    Answer File (cleared in exam)
                  </span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeFile.isLocked}
                    onChange={(e) => handleFileChange(activeFile.id, 'isLocked', e.target.checked)}
                    className="rounded border-neutral-700 bg-neutral-900 text-amber-500 focus:ring-amber-500 focus:ring-offset-neutral-950"
                  />
                  <span className="text-xs font-medium text-neutral-400">
                    Lock file (read-only)
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Code Editor */}
          <div className="flex-1 overflow-hidden">
            {activeFile ? (
              <Editor
                height="100%"
                language={activeFile.language}
                value={activeFile.content}
                onChange={handleEditorChange}
                theme="vs-dark"
                options={{
                  minimap: { enabled: false },
                  fontSize: 14,
                  fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
                  padding: { top: 16, bottom: 16 },
                  scrollBeyondLastLine: false,
                  smoothScrolling: true,
                  cursorBlinking: 'smooth',
                  renderLineHighlight: 'all',
                  tabSize: 4,
                  insertSpaces: true,
                  // Enhanced syntax highlighting
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: {
                    other: true,
                    comments: false,
                    strings: false,
                  },
                  parameterHints: { enabled: false },
                  formatOnPaste: true,
                  formatOnType: true,
                  autoClosingBrackets: 'always',
                  autoClosingQuotes: 'always',
                  autoIndent: 'full',
                  bracketPairColorization: { enabled: true },
                  guides: {
                    bracketPairs: false,
                    indentation: true,
                  },
                  renderWhitespace: 'none',
                  showUnused: true,
                  wordWrap: 'off',
                  wrappingIndent: 'indent',
                  colorDecorators: true,
                  codeLens: false,
                  folding: true,
                  foldingStrategy: 'indentation',
                  renderControlCharacters: true,
                  unicodeHighlight: {
                    ambiguousCharacters: true,
                    invisibleCharacters: true,
                  },
                  // Keep useful highlights
                  occurrencesHighlight: 'singleFile',
                  selectionHighlight: true,
                  renderValidationDecorations: 'on', // Only show error underlines
                  glyphMargin: false,
                  lineDecorationsWidth: 0,
                  lineNumbersMinChars: 3,
                  overviewRulerLanes: 0,
                }}
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center text-neutral-500 px-8">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-16 w-16 mb-4 text-neutral-700"
                >
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="18" x2="12" y2="12" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <p className="text-lg font-medium text-neutral-400 mb-2">No files yet</p>
                <p className="text-sm text-neutral-600 text-center max-w-xs">
                  Click the "+ New File" button to create your first code file
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Language Selection Modal */}
      {showLanguageModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Select Programming Language</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Choose the language for this practical problem. This will be used as the default for all files.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleLanguageSelect('c')}
                className="group relative overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 p-6 text-left transition hover:border-blue-500 hover:bg-neutral-750 cursor-pointer"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-full bg-blue-500/10 p-3 group-hover:bg-blue-500/20 transition">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-8 w-8 text-blue-400"
                    >
                      <path d="M3 3h18v18H3z" />
                      <path d="M7 7h4v4H7z" />
                      <path d="M7 13h4v4H7z" />
                      <path d="M13 7h4v4h-4z" />
                      <path d="M13 13h4v4h-4z" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">C</div>
                    <div className="text-xs text-neutral-400">C Programming</div>
                  </div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => handleLanguageSelect('cpp')}
                className="group relative overflow-hidden rounded-lg border border-neutral-700 bg-neutral-800 p-6 text-left transition hover:border-purple-500 hover:bg-neutral-750 cursor-pointer"
              >
                <div className="flex flex-col items-center gap-3">
                  <div className="rounded-full bg-purple-500/10 p-3 group-hover:bg-purple-500/20 transition">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-8 w-8 text-purple-400"
                    >
                      <path d="M3 3h18v18H3z" />
                      <path d="M7 7h4v4H7z" />
                      <path d="M7 13h4v4H7z" />
                      <path d="M13 7h4v4h-4z" />
                      <path d="M13 13h4v4h-4z" />
                      <path d="M15 9h2" />
                      <path d="M15 15h2" />
                    </svg>
                  </div>
                  <div>
                    <div className="text-lg font-semibold">C++</div>
                    <div className="text-xs text-neutral-400">C++ Programming</div>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add File Modal */}
      {showAddFileModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <div className="mb-4">
              <h2 className="text-xl font-semibold">Add New File</h2>
              <p className="mt-2 text-sm text-neutral-400">
                Create a new code file for your problem.
              </p>
            </div>
            
            <div className="space-y-4">
              {/* File Type Selection */}
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-3">
                  File Type
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setIsHeaderFile(false)}
                    className={`rounded-lg border p-4 text-left transition cursor-pointer ${
                      !isHeaderFile
                        ? 'border-blue-500 bg-blue-500/10 text-white'
                        : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 ${!isHeaderFile ? 'bg-blue-500/20' : 'bg-neutral-700'}`}>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-5 w-5"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <line x1="12" y1="18" x2="12" y2="12" />
                          <line x1="9" y1="15" x2="15" y2="15" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-semibold text-sm">Source File</div>
                        <div className="text-xs text-neutral-400">.c / .cpp</div>
                      </div>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsHeaderFile(true)}
                    className={`rounded-lg border p-4 text-left transition cursor-pointer ${
                      isHeaderFile
                        ? 'border-green-500 bg-green-500/10 text-white'
                        : 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:border-neutral-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 ${isHeaderFile ? 'bg-green-500/20' : 'bg-neutral-700'}`}>
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className="h-5 w-5"
                        >
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                          <path d="M12 11v6" />
                          <path d="M9 14h6" />
                        </svg>
                      </div>
                      <div>
                        <div className="font-semibold text-sm">Header File</div>
                        <div className="text-xs text-neutral-400">.h</div>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Filename Input */}
              <div className="mt-6">
                <label className="block text-sm font-medium text-neutral-200 mb-2">
                  Filename
                </label>
                <input
                  type="text"
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder={isHeaderFile ? 'e.g., utils' : 'e.g., main'}
                  className="w-full rounded-md border border-neutral-800 bg-neutral-950 px-4 py-2.5 font-mono text-sm text-white outline-none transition focus:border-neutral-600 focus:ring-1 focus:ring-neutral-500"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newFileName.trim()) {
                      handleConfirmAddFile();
                    }
                  }}
                />
                {isHeaderFile && newFileName && !newFileName.endsWith('.h') && (
                  <p className="mt-1 text-xs text-amber-400">
                    ".h" extension will be added automatically
                  </p>
                )}
                {!isHeaderFile && newFileName && !newFileName.endsWith('.c') && !newFileName.endsWith('.cpp') && (
                  <p className="mt-1 text-xs text-amber-400">
                    "{defaultLanguage === 'c' ? '.c' : '.cpp'}" extension will be added automatically
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddFileModal(false)}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmAddFile}
                disabled={!newFileName.trim()}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
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
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Success Modal */}
      {submitSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="rounded-full bg-green-500/10 p-2">
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-6 w-6 text-green-400"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <h2 className="text-xl font-semibold">Problem Created!</h2>
            </div>
            <p className="text-sm text-neutral-400">
              Your practical problem has been saved to{' '}
              <span className="font-medium text-neutral-200">
                {submitSuccess.section} → {submitSuccess.lesson}
              </span>
              .
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={handleSuccessAcknowledge}
                className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2 text-sm font-semibold text-black transition hover:bg-white cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticalQuestionCreator;
