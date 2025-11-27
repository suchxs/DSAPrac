import React, { useState, useEffect, useRef } from 'react';
import { Editor } from '@monaco-editor/react';
import { Play, Send, Save, X, ArrowLeft } from 'lucide-react';
import Terminal from '../components/Terminal';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import '@xterm/xterm/css/xterm.css';

interface CodeFile {
  filename: string;
  content: string;
  isLocked: boolean;
  isAnswerFile: boolean;
  isHidden: boolean;
  language: 'c' | 'cpp';
}

interface TestCase {
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  executionTime?: number;
  memoryUsage?: number;
}

interface PracticalQuestion {
  id: string;
  title: string;
  description: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  section: string;
  lesson: string;
  author?: string;
  isPreviousExam?: boolean;
  examSchoolYear?: string;
  examSemester?: string;
  files: CodeFile[];
  testCases: TestCase[];
  imageDataUrl?: string | null;
  imageDataUrls?: string[];
  initialFiles?: CodeFile[];
}

interface TestResult {
  index: number;
  passed: boolean;
  actualOutput?: string;
  expectedOutput?: string;
  executionTime?: number;
  memoryUsage?: number;
  error?: string;
}

const DEFAULT_ANSWER_CONTENT = '// Put your answer here\n';

const PracticalProblemSolver: React.FC = () => {
  const [question, setQuestion] = useState<PracticalQuestion | null>(null);
  const [files, setFiles] = useState<CodeFile[]>([]); // Visible files for UI
  const [allFiles, setAllFiles] = useState<CodeFile[]>([]); // All files including hidden
  const [initialFiles, setInitialFiles] = useState<CodeFile[]>([]); // Starting state for resets
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [runOutput, setRunOutput] = useState<string>('');
  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const periodicSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const currentFileRef = useRef<string>('');
  const filesContentRef = useRef<Map<string, string>>(new Map()); // Track latest content without re-renders
  const saveCurrentFileRef = useRef<(() => void) | null>(null); // Ref to always have latest save function
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isHeaderFile, setIsHeaderFile] = useState(false);
  const [fileNameError, setFileNameError] = useState<string | null>(null);
  const [showRunModal, setShowRunModal] = useState(false);
  const [isTerminalRunning, setIsTerminalRunning] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [inputBuffer, setInputBuffer] = useState('');
  const inputBufferRef = useRef<string>('');
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);
  const [score, setScore] = useState(0);
  const [maxScore, setMaxScore] = useState(0);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [resetFileTarget, setResetFileTarget] = useState<CodeFile | null>(null);
  
  // Settings state
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [autoSaveInterval, setAutoSaveInterval] = useState(30); // seconds
  const isDiscardingRef = useRef(false); // Flag to prevent saves when discarding
  const isPendingCloseRef = useRef(false); // Flag to prevent saves when close modal is shown

  // Save function defined early for use in effects
  const saveCurrentFile = async () => {
    // Don't save if:
    // - No file selected or no question loaded
    // - Already saving
    // - User is discarding changes
    // - Close modal is showing (pending decision)
    // - No unsaved changes
    if (!selectedFile || !question || isSavingRef.current || isDiscardingRef.current || isPendingCloseRef.current || !hasUnsavedChanges) return;

    // Immediately update UI state for instant feedback (no IPC call blocking)
    isSavingRef.current = true;
    setIsSaving(true);
    setHasUnsavedChanges(false);
    
    // Get the latest file contents from ref
    const filesToSave = files.map((f) => {
      const latestContent = filesContentRef.current.get(f.filename);
      return {
        filename: f.filename,
        content: latestContent !== undefined ? latestContent : f.content,
      };
    });
    
    // Perform actual save in background (fire and forget)
    try {
      await window.api.savePracticalProgress({
        questionId: question.id,
        files: filesToSave,
      });
    } catch (error) {
      console.error('Failed to save progress:', error);
      setHasUnsavedChanges(true);
    } finally {
      setIsSaving(false);
      isSavingRef.current = false;
    }
  };

  // Keep ref updated with latest save function
  saveCurrentFileRef.current = saveCurrentFile;

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const settings = await window.api.getSettings();
        setAutoSaveEnabled(settings.autoSaveEnabled);
        setAutoSaveInterval(settings.autoSaveInterval);
      } catch (error) {
        console.error('Failed to load settings:', error);
      }
    };
    loadSettings();

  }, []);

  useEffect(() => {
    // Load question data when component mounts
    loadQuestion();

    // Set up Ctrl+S keyboard shortcut
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        // Use ref to always call the latest save function
        saveCurrentFileRef.current?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    // Cleanup auto-save timers and listeners on unmount
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
      if (periodicSaveTimerRef.current) {
        clearInterval(periodicSaveTimerRef.current);
      }
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Set up periodic auto-save based on settings
  useEffect(() => {
    // Clear existing timer
    if (periodicSaveTimerRef.current) {
      clearInterval(periodicSaveTimerRef.current);
      periodicSaveTimerRef.current = null;
    }

    // Only set up auto-save if enabled
    if (autoSaveEnabled && autoSaveInterval > 0) {
      periodicSaveTimerRef.current = setInterval(() => {
        // Use ref to call the latest save function and check conditions
        saveCurrentFileRef.current?.();
      }, Math.max(200, Math.min(300000, autoSaveInterval * 1000)));
    }

    return () => {
      if (periodicSaveTimerRef.current) {
        clearInterval(periodicSaveTimerRef.current);
      }
    };
  }, [autoSaveEnabled, autoSaveInterval]);

  // Handle terminal data from backend
  useEffect(() => {
    const unsubscribe = window.api.onTerminalData((data) => {
      console.log('[Frontend] Terminal data received:', data);
      console.log('[Frontend] terminalWrite available?', !!window.terminalWrite);
      
      if (data.sessionId !== terminalSessionId || !terminalSessionId) {
        return;
      }
      
      const writer = window.terminalWrite;

      if (writer) {
        if (data.data) {
          console.log('[Frontend] Writing to terminal:', data.data);
          writer(data.data);
        }
        if (data.error) {
          console.log('[Frontend] Writing error to terminal:', data.error);
          writer(`\x1b[31m${data.error}\x1b[0m`);
        }
        if (data.exit) {
          console.log('[Frontend] Program exited with code:', data.exitCode);
          
          // Display execution metrics
          const executionTime = data.executionTime || 0;
          const memoryUsage = data.memoryUsage || 0;
          const memoryMB = (memoryUsage / 1024).toFixed(2);
          
          writer(`\r\n\r\n\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n`);
          writer(`\x1b[32m✓ Process exited with code ${data.exitCode}\x1b[0m\r\n`);
          writer(`\x1b[36m⏱  Execution Time: ${executionTime}ms\x1b[0m\r\n`);
          writer(`\x1b[36m💾 Memory Usage: ${memoryMB}MB\x1b[0m\r\n`);
          writer(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n`);
          
          setIsTerminalRunning(false);
          setTerminalSessionId(null);
        }
      } else {
        console.error('[Frontend] terminalWrite not available!');
      }
    });

    return () => {
      unsubscribe();
    };
  }, [terminalSessionId]);

  // Clear terminal when opening modal to show fresh output
  useEffect(() => {
    if (showRunModal && window.terminalClear) {
      window.terminalClear();
    }
  }, [showRunModal]);

  // Cleanup terminal session when modal closes
  useEffect(() => {
    if (!showRunModal && terminalSessionId) {
      window.api.stopTerminalExecution(terminalSessionId);
      setTerminalSessionId(null);
      inputBufferRef.current = '';
      setInputBuffer('');
    }
  }, [showRunModal, terminalSessionId]);

  const loadQuestion = async () => {
    try {
      console.log('Loading question...');
      // Get question data from window opener or IPC
      const questionData = await window.api.getCurrentPracticalQuestion();
      console.log('Question data loaded:', questionData);
      
      if (!questionData) {
        console.error('No question data received');
        return;
      }
      
      setQuestion(questionData);
      setScore(0);
      setMaxScore(Array.isArray(questionData.testCases) ? questionData.testCases.length : 0);
      setShowSuccessModal(false);
      
      // Capture the starting state for each file (without student changes)
      const initialFilesFromQuestion = (questionData.initialFiles ?? questionData.files).map((f: CodeFile) => {
        if (f.isAnswerFile) {
          const hasContent = f.content && f.content.trim().length > 0;
          return {
            ...f,
            content: hasContent ? f.content : DEFAULT_ANSWER_CONTENT,
          };
        }
        return { ...f };
      });
      setInitialFiles(initialFilesFromQuestion);
      
      // Initialize ALL files (including hidden)
      // For answer files: use saved content if it exists (backend loads it), 
      // otherwise use default placeholder
      const allFilesWithContent = questionData.files.map((f: CodeFile) => {
        if (f.isAnswerFile) {
          // If the file has meaningful content (not empty or just whitespace), use it
          // This means the backend loaded saved progress
          const hasContent = f.content && f.content.trim().length > 0;
          return {
            ...f,
            content: hasContent ? f.content : DEFAULT_ANSWER_CONTENT,
          };
        }
        return { ...f };
      });
      
      setAllFiles(allFilesWithContent);
      
      // Initialize visible files - filter out hidden files
      const visibleFiles = allFilesWithContent.filter((f: CodeFile) => !f.isHidden);
      
      console.log('Visible files:', visibleFiles);
      console.log('All files (including hidden):', allFilesWithContent);
      setFiles(visibleFiles);
      
      // Select first editable file (answer file)
      const firstAnswerFile = visibleFiles.find((f: CodeFile) => f.isAnswerFile);
      if (firstAnswerFile) {
        setSelectedFile(firstAnswerFile.filename);
        currentFileRef.current = firstAnswerFile.filename;
        setCode(firstAnswerFile.content);
      }
    } catch (error) {
      console.error('Failed to load question:', error);
    }
  };

  const handleFileSelect = (filename: string) => {
    // Save current file before switching
    if (selectedFile && hasUnsavedChanges) {
      saveCurrentFile();
    }

    setSelectedFile(filename);
    currentFileRef.current = filename;
    const file = files.find((f) => f.filename === filename);
    if (file) {
      setCode(file.content);
      setHasUnsavedChanges(false);
    }
  };

  const handleCodeChange = (value: string | undefined) => {
    if (value === undefined) return;
    
    // Don't allow editing locked files
    const currentFile = files.find((f) => f.filename === currentFileRef.current);
    if (currentFile?.isLocked) {
      return;
    }
    
    // Update ref immediately (no re-render, instant)
    filesContentRef.current.set(currentFileRef.current, value);
    
    setCode(value);
    setHasUnsavedChanges(true);

    // Debounce the state updates to reduce re-renders
    // Update file in visible files state
    setFiles((prevFiles) =>
      prevFiles.map((f) =>
        f.filename === currentFileRef.current ? { ...f, content: value } : f
      )
    );
    
    // Also update in all files state (for compilation)
    setAllFiles((prevFiles) =>
      prevFiles.map((f) =>
        f.filename === currentFileRef.current ? { ...f, content: value } : f
      )
    );

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    // Auto-save only if enabled and honor the configured interval (clamped for sanity)
    if (autoSaveEnabled) {
      const debounceMs = Math.max(200, Math.min(300000, autoSaveInterval * 1000));
      autoSaveTimerRef.current = setTimeout(() => {
        saveCurrentFile();
      }, debounceMs);
    }
  };

  const handleSave = async () => {
    await saveCurrentFile();
  };

  const handleRun = async () => {
    if (!question) return;

    setShowRunModal(true);
    // Give the modal a moment to mount the terminal before streaming output
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Ensure latest code is saved to state and disk before running
    await saveCurrentFile();

    const allFilesValid = allFiles.every(f => f.filename.trim() && f.content.trim());
    if (!allFilesValid) {
      alert('All files must have a filename and content before running.');
      return;
    }

    setIsTerminalRunning(true);
    setShowRunModal(true);

    try {
      const result = await window.api.startTerminalExecution({
        files: allFiles.map(f => ({
          filename: f.filename,
          content: f.content,
          isLocked: f.isLocked,
          isAnswerFile: f.isAnswerFile,
          isHidden: f.isHidden,
          language: f.language,
        })),
      });

      if (!result.success) {
        // Show compilation error in terminal
        if (window.terminalWrite) {
          window.terminalWrite(`\r\n\x1b[31mError:\x1b[0m ${result.error}\r\n`);
        }
        setIsTerminalRunning(false);
      } else if (result.sessionId) {
        setTerminalSessionId(result.sessionId);
      }
    } catch (error) {
      console.error('Failed to start terminal:', error);
      if (window.terminalWrite) {
        window.terminalWrite(`\r\n\x1b[31mFailed to start execution\x1b[0m\r\n`);
      }
      setIsTerminalRunning(false);
    }
  };

  const handleTerminalData = React.useCallback((data: string) => {
    // Handle backspace - remove from buffer only, don't send to backend
    if (data === '\x7f' || data === '\b') {
      const currentBuffer = inputBufferRef.current;
      if (currentBuffer.length > 0) {
        const newBuffer = currentBuffer.slice(0, -1);
        inputBufferRef.current = newBuffer;
        setInputBuffer(newBuffer);
        
        // Visual feedback: move cursor back, write space, move cursor back again
        if (window.terminalWrite) {
          window.terminalWrite('\b \b');
        }
      }
      return;
    }

    // Handle Enter - send the buffered line
    if (data === '\r') {
      const lineToSend = inputBufferRef.current + '\n';
      
      // Send to backend
      if (terminalSessionId) {
        window.api.writeToTerminal(terminalSessionId, lineToSend);
      }
      
      // Visual feedback
      if (window.terminalWrite) {
        window.terminalWrite('\r\n');
      }
      
      // Clear buffer for next line
      inputBufferRef.current = '';
      setInputBuffer('');
      return;
    }

    // Regular character - add to buffer and echo
    if (data.charCodeAt(0) >= 32 || data === '\t') {
      const newBuffer = inputBufferRef.current + data;
      inputBufferRef.current = newBuffer;
      setInputBuffer(newBuffer);
      
      if (window.terminalWrite) {
        window.terminalWrite(data);
      }
    }
  }, [terminalSessionId]);

  const handleCloseRunModal = async () => {
    // Stop the terminal session if running
    if (terminalSessionId && isTerminalRunning) {
      await window.api.stopTerminalExecution(terminalSessionId);
    }
    
    setShowRunModal(false);
    setTerminalSessionId(null);
    setIsTerminalRunning(false);
    inputBufferRef.current = ''; // Clear input buffer ref
    setInputBuffer(''); // Clear input buffer
    // No external window now; nothing else to close
    // reset flags
    
    // Clear terminal
    if (window.terminalClear) {
      window.terminalClear();
    }
  };

  const handleSubmit = async () => {
    if (!question) return;

    setIsSubmitting(true);
    setRunOutput('');
    setTestResults([]);
    setShowSuccessModal(false);

    try {
      // Use ALL files including hidden ones for compilation
      const results = await window.api.submitPracticalSolution({
        questionId: question.id,
        files: allFiles.map((f) => ({
          filename: f.filename,
          content: f.content,
          language: f.language,
        })),
        testCases: question.testCases,
      });

      setTestResults(results.testResults || []);

      const totalTests = Array.isArray(results.testResults) ? results.testResults.length : 0;
      const passedCount = (results.testResults || []).filter((r: TestResult) => r.passed).length;
      setScore(passedCount);
      setMaxScore(totalTests);

      await window.api.recordPracticalActivity({
        questionId: question.id,
        passedCount,
        totalCount: totalTests,
        timestamp: new Date().toISOString(),
      });

      if (totalTests > 0 && passedCount === totalTests) {
        await window.api.setPracticalDone(question.id, true, totalTests);
        setShowSuccessModal(true);
      }

      const visibleTests = question.testCases.filter((tc) => !tc.isHidden).length;
      setRunOutput(
        `Submitted! ${passedCount}/${totalTests} test cases passed (${visibleTests} visible) | Score ${passedCount} pts`
      );
    } catch (error: any) {
      setRunOutput(`Submission error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddFile = () => {
    setNewFileName('');
    setIsHeaderFile(false);
    setFileNameError(null);
    setShowAddFileModal(true);
  };

  const handleConfirmAddFile = () => {
    if (!newFileName.trim() || !question) return;
    
    let filename = newFileName.trim();
    const language = question.files[0]?.language || 'c';
    
    if (isHeaderFile) {
      // Ensure it ends with .h
      if (!filename.endsWith('.h')) {
        filename += '.h';
      }
    } else {
      // Auto-add file extension based on language
      const extension = language === 'c' ? '.c' : '.cpp';
      if (!filename.endsWith('.c') && !filename.endsWith('.cpp')) {
        filename += extension;
      }
    }
    
    // Check for duplicate filename
    if (files.some(f => f.filename === filename) || allFiles.some(f => f.filename === filename)) {
      setFileNameError(`File "${filename}" already exists. Please choose a different name.`);
      return;
    }
    
    // Generate content based on file type
    let content = '';
    if (isHeaderFile) {
      // Generate header guard from filename
      const guardName = filename
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '_')
        .replace(/_+/g, '_');
      
      content = `#ifndef ${guardName}\n#define ${guardName}\n\n// Your header declarations here\n\n#endif // ${guardName}\n`;
    } else {
      content = '// Put your code here\n';
    }
    
    const newFile: CodeFile = {
      filename,
      content,
      isLocked: false,
      isAnswerFile: false,
      isHidden: false,
      language,
    };
    
    // Add to both visible and all files
    setFiles((prev) => [...prev, newFile]);
    setAllFiles((prev) => [...prev, newFile]);
    
    // Select the new file
    setSelectedFile(filename);
    currentFileRef.current = filename;
    setCode(newFile.content);
    
    setShowAddFileModal(false);
    setFileNameError(null);
    setHasUnsavedChanges(true);
    setInitialFiles((prev) => [...prev, newFile]);
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      // Set flag to prevent auto-saves while modal is shown
      isPendingCloseRef.current = true;
      // Clear any pending auto-save timers
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      if (periodicSaveTimerRef.current) {
        clearInterval(periodicSaveTimerRef.current);
        periodicSaveTimerRef.current = null;
      }
      setShowUnsavedModal(true);
      return;
    }
    window.close();
  };

  const handleConfirmClose = () => {
    // Set flag to prevent any auto-saves from running
    isDiscardingRef.current = true;
    setShowUnsavedModal(false);
    window.close();
  };

  const handleCancelClose = () => {
    // User wants to keep editing, re-enable auto-save
    isPendingCloseRef.current = false;
    setShowUnsavedModal(false);
  };

  const handleReturnToPractice = () => {
    setShowSuccessModal(false);
    handleClose();
  };

  const handleRetrySubmission = () => {
    setShowSuccessModal(false);
  };

  const handleRequestResetFile = () => {
    const current = files.find((f) => f.filename === selectedFile);
    if (!current || current.isLocked) return;

    const baseFile = initialFiles.find((f) => f.filename === current.filename);
    if (!baseFile) return;

    setResetFileTarget(baseFile);
  };

  const handleConfirmResetFile = () => {
    if (!resetFileTarget) return;

    const baseContent =
      resetFileTarget.isAnswerFile && (!resetFileTarget.content || resetFileTarget.content.trim().length === 0)
        ? DEFAULT_ANSWER_CONTENT
        : resetFileTarget.content;

    setFiles((prev) =>
      prev.map((f) => (f.filename === resetFileTarget.filename ? { ...f, content: baseContent } : f))
    );
    setAllFiles((prev) =>
      prev.map((f) => (f.filename === resetFileTarget.filename ? { ...f, content: baseContent } : f))
    );
    filesContentRef.current.set(resetFileTarget.filename, baseContent);

    if (selectedFile === resetFileTarget.filename) {
      setCode(baseContent);
    }

    setHasUnsavedChanges(true);
    setResetFileTarget(null);

    // Persist the reset as soon as possible
    setTimeout(() => {
      saveCurrentFileRef.current?.();
    }, 0);
  };

  const handleCancelResetFile = () => setResetFileTarget(null);

  const getDifficultyColor = (difficulty: 'Easy' | 'Medium' | 'Hard') => {
    switch (difficulty) {
      case 'Easy':
        return 'text-green-400';
      case 'Medium':
        return 'text-yellow-400';
      case 'Hard':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  if (!question) {
    return (
      <div className="h-screen bg-black text-white flex items-center justify-center">
        <div className="text-lg">Loading problem...</div>
      </div>
    );
  }

  const currentFile = files.find((f) => f.filename === selectedFile);
  const isReadOnly = currentFile?.isLocked || false;
  const displayedMaxScore = maxScore || (question.testCases?.length ?? 0);
  const canResetCurrentFile =
    !!currentFile && !currentFile.isLocked && initialFiles.some((f) => f.filename === currentFile.filename);
  const scorePercentage =
    displayedMaxScore > 0 ? Math.round((score / displayedMaxScore) * 100) : 0;

  return (
    <div className="h-screen bg-black text-white flex flex-col">
      {/* Custom Title Bar */}
      <div className="h-8 bg-zinc-950 border-b border-zinc-800 flex items-center justify-between px-4 drag-region">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold">{question.title}</span>
          <span className={`${getDifficultyColor(question.difficulty)}`}>
            {question.difficulty}
          </span>
          {hasUnsavedChanges && <span className="text-yellow-400">● Unsaved</span>}
        </div>
        <button
          onClick={handleClose}
          className="no-drag hover:bg-red-500/20 p-1 rounded transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>

      {/* Main Content - Three Panels */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Problem Description */}
        <div className="w-1/4 border-r border-zinc-800 overflow-y-auto bg-zinc-950 p-4">
          <button
            onClick={handleClose}
            className="mb-4 inline-flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            Back to Practice
          </button>
          <h2 className="text-xl font-bold mb-1">{question.title}</h2>
          {question.author && (
            <div className="text-xs text-neutral-400 mb-2">
              by {question.author}
            </div>
          )}
          {question.isPreviousExam && (
            <div className="mb-3">
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
                  {(question.examSchoolYear || question.examSemester) && (
                    <span className="text-emerald-500/70 ml-1">
                      ({[question.examSchoolYear, question.examSemester].filter(Boolean).join(' • ')})
                    </span>
                  )}
                </span>
              </div>
            </div>
          )}
          <div className="text-sm opacity-80 mb-4">
            <div>{question.section} / {question.lesson}</div>
          </div>

          <div className="mb-4">
            <h3 className="text-base font-semibold mb-2">Description</h3>
            <div className="prose prose-invert prose-sm max-w-none prose-p:text-neutral-300 prose-code:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-emerald-400 prose-pre:bg-zinc-900 prose-pre:border prose-pre:border-zinc-700 prose-a:text-blue-400 prose-strong:text-neutral-200 prose-ul:text-neutral-300 prose-ol:text-neutral-300 prose-li:text-neutral-300">
              <ReactMarkdown 
                remarkPlugins={[remarkGfm]}
                components={{
                  h1: ({ children }) => <h1 className="text-xl font-bold text-blue-400 mb-3 mt-4">{children}</h1>,
                  h2: ({ children }) => <h2 className="text-lg font-bold text-blue-500 mb-2 mt-3">{children}</h2>,
                  h3: ({ children }) => <h3 className="text-base font-bold text-violet-400 mb-2 mt-3">{children}</h3>,
                  h4: ({ children }) => <h4 className="text-sm font-bold text-violet-500 mb-1 mt-2">{children}</h4>,
                  h5: ({ children }) => <h5 className="text-sm font-bold text-purple-400 mb-1 mt-2">{children}</h5>,
                  h6: ({ children }) => <h6 className="text-xs font-bold text-purple-500 mb-1 mt-2">{children}</h6>,
                }}
              >
                {question.description}
              </ReactMarkdown>
            </div>
          </div>

          {/* Separator between description and reference images */}
          {((question.imageDataUrls && question.imageDataUrls.length > 0) || question.imageDataUrl) && (
            <div className="border-t border-zinc-700/50 my-4"></div>
          )}

          {/* Display multiple images if available, otherwise fall back to single image */}
          {(question.imageDataUrls && question.imageDataUrls.length > 0) ? (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">
                Reference Image{question.imageDataUrls.length > 1 ? 's' : ''}
              </h3>
              <div className="space-y-3">
                {question.imageDataUrls.map((imgUrl, index) => (
                  <img
                    key={index}
                    src={imgUrl}
                    alt={`Problem reference ${index + 1}`}
                    className="w-full rounded border border-zinc-700"
                  />
                ))}
              </div>
            </div>
          ) : question.imageDataUrl && (
            <div className="mb-4">
              <h3 className="text-sm font-semibold mb-2">Reference Image</h3>
              <img
                src={question.imageDataUrl}
                alt="Problem reference"
                className="w-full rounded border border-zinc-700"
              />
            </div>
          )}
        </div>

        {/* Center Panel - Code Editor */}
        <div className="flex-1 flex flex-col bg-black">
          {/* File Tabs */}
          <div className="h-10 bg-zinc-950 border-b border-zinc-800 flex items-center px-2 gap-1 overflow-x-auto">
            {files.map((file) => (
              <button
                key={file.filename}
                onClick={() => handleFileSelect(file.filename)}
                className={`px-3 py-1.5 text-xs rounded transition-colors whitespace-nowrap cursor-pointer ${
                  selectedFile === file.filename
                    ? 'bg-black text-white'
                    : 'bg-transparent text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                {file.filename}
                {file.isLocked && ' 🔒'}
              </button>
            ))}
            <button
              onClick={handleAddFile}
              className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded transition-colors whitespace-nowrap ml-2 cursor-pointer"
              title="Add new file"
            >
              + Add File
            </button>
          </div>

          {/* Monaco Editor */}
          <div className="flex-1">
            <Editor
              height="100%"
              language={currentFile?.language === 'cpp' ? 'cpp' : 'c'}
              value={code}
              onChange={handleCodeChange}
              theme="vs-dark"
              options={{
                readOnly: isReadOnly,
                minimap: { enabled: true },
                fontSize: 14,
                wordWrap: 'on',
                automaticLayout: true,
                scrollBeyondLastLine: false,
                tabSize: 2,
                insertSpaces: true,
              }}
            />
          </div>

          {/* Action Buttons */}
          <div className="h-12 bg-zinc-950 border-t border-zinc-800 flex items-center justify-between px-4">
            <div className="flex items-center gap-2">
              <button
                onClick={handleRequestResetFile}
                disabled={!canResetCurrentFile}
                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-red-900/60 text-red-100 hover:bg-red-800/70 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
              >
                <X size={14} />
                Reset File
              </button>
              <button
                onClick={handleSave}
                disabled={!hasUnsavedChanges || isSaving}
                className="flex items-center gap-2 px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
              >
                <Save size={14} className={isSaving ? 'animate-pulse' : ''} />
                {isSaving ? 'Saving...' : hasUnsavedChanges ? 'Save (Ctrl+S)' : 'Saved'}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRun}
                disabled={isTerminalRunning || isSubmitting}
                className="flex items-center gap-2 px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
              >
                <Play size={14} />
                {isTerminalRunning ? 'Running...' : 'Run Code'}
              </button>
              <button
                onClick={handleSubmit}
                disabled={isTerminalRunning || isSubmitting}
                className="flex items-center gap-2 px-4 py-1.5 text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed rounded transition-colors cursor-pointer"
              >
                <Send size={14} />
                {isSubmitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>

        {/* Right Panel - Test Cases & Output */}
        <div className="w-1/4 border-l border-zinc-800 flex flex-col bg-zinc-950">
          {/* Test Cases */}
          <div className="flex-1 overflow-y-auto p-4">
            <div className="rounded-lg border border-zinc-800 bg-zinc-900/80 p-4 mb-4">
              <div className="text-xs uppercase tracking-wide text-neutral-500">Score</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-white">{score}</span>
                <span className="text-sm text-neutral-500">
                  / {displayedMaxScore}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                {displayedMaxScore > 0
                  ? `${scorePercentage}% - 1 point per passing test case`
                  : 'No test cases available for scoring'}
              </div>
            </div>

            <h3 className="text-sm font-semibold mb-3">Test Cases</h3>
            <div className="space-y-3">
              {question.testCases.map((tc, index) => {
                if (tc.isHidden && testResults.length === 0) {
                  return (
                    <div
                      key={index}
                      className="p-3 bg-zinc-900 rounded border border-zinc-800 text-xs"
                    >
                      <div className="font-semibold mb-1 text-zinc-500">
                        Test Case {index + 1} (Hidden)
                      </div>
                      <div className="text-zinc-600">Hidden test case</div>
                    </div>
                  );
                }

                const result = testResults.find((r) => r.index === index);

                return (
                  <div
                    key={index}
                    className={`p-3 rounded border text-xs ${
                      result
                        ? result.passed
                          ? 'bg-green-950/30 border-green-800'
                          : 'bg-red-950/30 border-red-800'
                        : 'bg-zinc-900 border-zinc-800'
                    }`}
                  >
                    <div className="font-semibold mb-1 flex items-center justify-between">
                      <span>Test Case {index + 1}</span>
                      {result && (
                        <span
                          className={result.passed ? 'text-green-400' : 'text-red-400'}
                        >
                          {result.passed ? '✓ Passed' : '✗ Failed'}
                        </span>
                      )}
                    </div>
                    {!tc.isHidden && (
                      <>
                        <div className="mb-2">
                          <div className="text-zinc-400 mb-0.5">Input:</div>
                          <pre className="bg-black p-2 rounded text-xs overflow-x-auto">
                            {tc.input}
                          </pre>
                        </div>
                        <div className="mb-2">
                          <div className="text-zinc-400 mb-0.5">Expected Output:</div>
                          <pre className="bg-black p-2 rounded text-xs overflow-x-auto">
                            {tc.expectedOutput}
                          </pre>
                        </div>
                      </>
                    )}
                    {result && !result.passed && result.actualOutput && (
                      <div>
                        <div className="text-zinc-400 mb-0.5">Actual Output:</div>
                        <pre className="bg-black p-2 rounded text-xs overflow-x-auto text-red-400">
                          {result.actualOutput}
                        </pre>
                      </div>
                    )}
                    {result?.error && (
                      <div className="text-red-400 text-xs mt-2">{result.error}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Output Console */}
          {runOutput && (
            <div className="h-32 border-t border-zinc-800 p-3 overflow-y-auto">
              <h4 className="text-xs font-semibold mb-2">Output</h4>
              <pre className="text-xs text-green-400 whitespace-pre-wrap">{runOutput}</pre>
            </div>
          )}
        </div>
      </div>

      {/* Run Code Modal with Interactive Terminal */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 px-6">
          <div className="mt-10 w-full max-w-4xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Interactive Terminal</h2>
                <p className="text-xs text-neutral-500">Your program output appears below.</p>
              </div>
              <button
                type="button"
                onClick={handleCloseRunModal}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 cursor-pointer"
              >
                Close
              </button>
            </div>
            <Terminal
              onData={handleTerminalData}
            />
            <div className="text-xs text-neutral-500 flex items-center gap-2 mt-3">
              <div className={`h-2 w-2 rounded-full ${isTerminalRunning ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
              <span>{isTerminalRunning ? 'Program is running...' : 'Program has finished'}</span>
            </div>
          </div>
        </div>
      )}

      {/* Reset File Confirmation */}
      {resetFileTarget && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-gradient-to-br from-zinc-900/95 to-zinc-800/95 border border-red-600/40 rounded-2xl p-8 w-[480px] shadow-2xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-red-500/15 flex items-center justify-center border border-red-500/30">
                <svg className="w-6 h-6 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2 bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
                  Reset {resetFileTarget.filename}?
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  This will restore <span className="text-white font-semibold">{resetFileTarget.filename}</span> to its
                  starting state. Only this file will be reset; other files stay unchanged.
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelResetFile}
                className="px-6 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-600/50 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmResetFile}
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900/30 cursor-pointer"
              >
                Reset File
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add File Modal */}
      {showAddFileModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-lg p-6 w-96">
            <h2 className="text-lg font-semibold mb-4">Add New File</h2>
            
            <div className="mb-4">
              <label className="block text-sm mb-2">File Name</label>
              <input
                type="text"
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmAddFile();
                  }
                }}
                className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded text-sm"
                placeholder="example"
                autoFocus
              />
              {fileNameError && (
                <div className="text-red-400 text-xs mt-1">{fileNameError}</div>
              )}
            </div>

            <div className="mb-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={isHeaderFile}
                  onChange={(e) => setIsHeaderFile(e.target.checked)}
                  className="w-4 h-4"
                />
                Header File (.h)
              </label>
            </div>

            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowAddFileModal(false);
                  setFileNameError(null);
                }}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 rounded text-sm transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAddFile}
                disabled={!newFileName.trim()}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded text-sm transition-colors cursor-pointer"
              >
                Add File
              </button>
            </div>
          </div>
        </div>
      )}

      {showSuccessModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl border border-emerald-600/40 bg-neutral-900/95 p-8 shadow-[0_0_30px_rgba(16,185,129,0.35)]">
            <div className="flex flex-col items-center text-center gap-4">
              <div className="flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40">
                <svg
                  className="w-8 h-8 text-emerald-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div>
                <h2 className="text-2xl font-semibold text-white">Accepted!</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  All {displayedMaxScore} test cases passed. Perfect score achieved.
                </p>
                <p className="mt-2 text-xs uppercase tracking-wide text-emerald-400">
                  100% Score - {displayedMaxScore} pts earned
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={handleRetrySubmission}
                className="px-5 py-2.5 bg-neutral-900 border border-neutral-700 hover:border-neutral-600 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                Keep Coding
              </button>
              <button
                onClick={handleReturnToPractice}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 rounded-lg text-sm font-semibold text-black transition-all hover:scale-105 active:scale-95 shadow-lg shadow-emerald-900/40 cursor-pointer"
              >
                Return to Practice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Unsaved Changes Modal */}
      {showUnsavedModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fadeIn">
          <div className="bg-gradient-to-br from-zinc-900/95 to-zinc-800/95 border border-zinc-700/50 rounded-2xl p-8 w-[480px] shadow-2xl backdrop-blur-xl">
            <div className="flex items-start gap-4 mb-6">
              <div className="flex-shrink-0 w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h2 className="text-xl font-bold mb-2 bg-gradient-to-r from-white to-zinc-300 bg-clip-text text-transparent">
                  Unsaved Changes
                </h2>
                <p className="text-sm text-zinc-400 leading-relaxed">
                  You have unsaved changes in your code. Closing now will discard all your progress.
                </p>
              </div>
            </div>

            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelClose}
                className="px-6 py-2.5 bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-600/50 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 cursor-pointer"
              >
                Keep Editing
              </button>
              <button
                onClick={handleConfirmClose}
                className="px-6 py-2.5 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 rounded-lg text-sm font-medium transition-all hover:scale-105 active:scale-95 shadow-lg shadow-red-900/30 cursor-pointer"
              >
                Discard Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticalProblemSolver;
