import React, { FormEvent, useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { SECTION_OPTIONS } from '../constants/theorySections';
import Editor from '@monaco-editor/react';
import Terminal from '../components/Terminal';

interface CodeFile {
  id: string;
  filename: string;
  content: string;
  isLocked: boolean;
  isAnswerFile: boolean;
  isHidden: boolean;
  language: 'c' | 'cpp';
}

interface TestCase {
  id: string;
  input: string;
  expectedOutput: string;
  isHidden: boolean;
  executionTime?: number; // in milliseconds
  memoryUsage?: number; // in KB
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
    isHidden: false,
    language,
  };
};

const PracticalQuestionCreator: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  
  // Check if we're in edit mode
  const editMode = location.state?.editMode || false;
  const editData = location.state?.editData || null;
  
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
  
  // Modal states
  const [showLanguageModal, setShowLanguageModal] = useState(true);
  const [showAddFileModal, setShowAddFileModal] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isHeaderFile, setIsHeaderFile] = useState(false);
  const [fileNameError, setFileNameError] = useState<string | null>(null);
  
  // Save tracking
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Run code modal with interactive terminal
  const [showRunModal, setShowRunModal] = useState(false);
  const [terminalSessionId, setTerminalSessionId] = useState<string | null>(null);
  const [isTerminalRunning, setIsTerminalRunning] = useState(false);
  
  // Record test case modal with interactive terminal
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordSessionId, setRecordSessionId] = useState<string | null>(null);
  const [isRecordRunning, setIsRecordRunning] = useState(false);
  const [recordedInput, setRecordedInput] = useState(''); // Full stdin content
  const [recordedOutput, setRecordedOutput] = useState('');
  const [showSaveTestCaseModal, setShowSaveTestCaseModal] = useState(false);
  const [recordedExecutionTime, setRecordedExecutionTime] = useState<number>(0);
  const [recordedMemoryUsage, setRecordedMemoryUsage] = useState<number>(0);
  const [inputBuffer, setInputBuffer] = useState(''); // Current line being typed (for Run Code)
  const [recordBuffer, setRecordBuffer] = useState(''); // Current line being typed (for Record)
  
  // Use refs for immediate buffer access (avoid stale closure issues)
  const inputBufferRef = useRef<string>('');
  const recordBufferRef = useRef<string>('');

  // Prefill data when in edit mode
  useEffect(() => {
    if (editMode && editData) {
      setTitle(editData.title || '');
      setDescription(editData.description || '');
      setDifficulty(editData.difficulty || 'Easy');
      setSection(editData.sectionKey || '');
      setLesson(editData.lesson || '');
      
      // Set files with proper structure
      if (editData.files && editData.files.length > 0) {
        const language = editData.files[0].language || 'c';
        setDefaultLanguage(language);
        setFiles(editData.files.map((file: any) => ({
          ...file,
          id: file.id || `file-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        })));
        setActiveFileId(editData.files[0].id);
        setShowLanguageModal(false); // Skip language selection
      }
      
      // Set test cases
      if (editData.testCases && editData.testCases.length > 0) {
        setTestCases(editData.testCases.map((tc: any) => ({
          ...tc,
          id: tc.id || `test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`
        })));
      }
      
      // Set image preview if exists
      if (editData.imageDataUrl) {
        setImagePreview(editData.imageDataUrl);
      }
    }
  }, [editMode, editData]);

  // Set initial active file
  React.useEffect(() => {
    if (files.length > 0 && !activeFileId) {
      setActiveFileId(files[0].id);
    }
  }, [files, activeFileId]);

  // Ctrl+S handler
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleManualSave();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Autosave cleanup
  React.useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, []);

  // Trigger autosave when content changes
  React.useEffect(() => {
    if (files.length > 0 || title || description) {
      triggerAutosave();
    }
  }, [files, title, description, testCases]);

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
    setFileNameError(null);
    setShowAddFileModal(true);
  };

  const handleConfirmAddFile = () => {
    if (!newFileName.trim() || !defaultLanguage) return;
    
    let filename = newFileName.trim();
    
    if (isHeaderFile) {
      // Ensure it ends with .h
      if (!filename.endsWith('.h')) {
        filename += '.h';
      }
    } else {
      // Auto-add file extension based on language
      const extension = defaultLanguage === 'c' ? '.c' : '.cpp';
      if (!filename.endsWith('.c') && !filename.endsWith('.cpp')) {
        filename += extension;
      }
    }
    
    // Check for duplicate filename
    if (files.some(f => f.filename === filename)) {
      setFileNameError(`File "${filename}" already exists. Please choose a different name.`);
      return;
    }
    
    let newFile: CodeFile;
    newFile = createCodeFile(files.length, defaultLanguage, filename, isHeaderFile);
    newFile.language = defaultLanguage; // Set language based on selection
    setFiles((prev) => [...prev, newFile]);
    setActiveFileId(newFile.id);
    setShowAddFileModal(false);
    setFileNameError(null);
    
    // Mark as unsaved when adding a file
    triggerAutosave();
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

  const handleRemoveTestCase = (id: string) => {
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
  };

  // Save functions
  const triggerAutosave = () => {
    setLastSaved(new Date());
    // Reset autosave timer
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }
    autoSaveTimerRef.current = setTimeout(() => {
      setLastSaved(new Date());
    }, 5 * 60 * 1000); // 5 minutes
  };

  const handleManualSave = () => {
    setIsSaving(true);
    setLastSaved(new Date());
    // Simulate save operation
    setTimeout(() => {
      setIsSaving(false);
    }, 300);
  };

  // Run code with interactive terminal
  const handleRunCode = async () => {
    if (files.length === 0) {
      alert('Please add at least one code file before running.');
      return;
    }

    const allFilesValid = files.every(f => f.filename.trim() && f.content.trim());
    if (!allFilesValid) {
      alert('All files must have a filename and content before running.');
      return;
    }

    setIsTerminalRunning(true);
    setShowRunModal(true);

    try {
      const result = await window.api.startTerminalExecution({
        files: files.map(f => ({
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
        window.terminalWrite(`\r\n\x1b[31mFailed to start terminal:\x1b[0m ${error instanceof Error ? error.message : 'Unknown error'}\r\n`);
      }
      setIsTerminalRunning(false);
    }
  };

  // Handle terminal data from backend
  React.useEffect(() => {
    const unsubscribe = window.api.onTerminalData((data) => {
      console.log('[Frontend] Terminal data received:', data);
      console.log('[Frontend] terminalWrite available?', !!window.terminalWrite);
      
      // Only handle if this is for the run code session
      if (data.sessionId !== terminalSessionId || !terminalSessionId) {
        return;
      }
      
      if (window.terminalWrite) {
        if (data.data) {
          console.log('[Frontend] Writing to terminal:', data.data);
          window.terminalWrite(data.data);
        }
        if (data.error) {
          console.log('[Frontend] Writing error to terminal:', data.error);
          window.terminalWrite(`\x1b[31m${data.error}\x1b[0m`);
        }
        if (data.exit) {
          console.log('[Frontend] Program exited with code:', data.exitCode);
          
          // Display execution metrics
          const executionTime = data.executionTime || 0;
          const memoryUsage = data.memoryUsage || 0;
          const memoryMB = (memoryUsage / 1024).toFixed(2);
          
          window.terminalWrite(`\r\n\r\n\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n`);
          window.terminalWrite(`\x1b[32m✓ Process exited with code ${data.exitCode}\x1b[0m\r\n`);
          window.terminalWrite(`\x1b[36m⏱  Execution Time: ${executionTime}ms\x1b[0m\r\n`);
          window.terminalWrite(`\x1b[36m💾 Memory Usage: ${memoryMB}MB\x1b[0m\r\n`);
          window.terminalWrite(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n`);
          
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

  // Listen for recording terminal data
  React.useEffect(() => {
    const unsubscribe = window.api.onTerminalData((data) => {
      // Only handle if this is for the recording session
      if (data.sessionId !== recordSessionId || !recordSessionId) {
        return;
      }

      if (window.terminalWrite) {
        if (data.data) {
          // Capture output
          setRecordedOutput(prev => prev + data.data);
          window.terminalWrite(data.data);
        }
        if (data.error) {
          window.terminalWrite(`\x1b[31m${data.error}\x1b[0m`);
        }
        if (data.exit) {
          // Store execution metrics
          setRecordedExecutionTime(data.executionTime || 0);
          setRecordedMemoryUsage(data.memoryUsage || 0);
          
          // Display execution metrics
          const executionTime = data.executionTime || 0;
          const memoryUsage = data.memoryUsage || 0;
          const memoryMB = (memoryUsage / 1024).toFixed(2);
          
          window.terminalWrite(`\r\n\r\n\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n`);
          window.terminalWrite(`\x1b[32m✓ Recording complete\x1b[0m\r\n`);
          window.terminalWrite(`\x1b[36m⏱  Execution Time: ${executionTime}ms\x1b[0m\r\n`);
          window.terminalWrite(`\x1b[36m💾 Memory Usage: ${memoryMB}MB\x1b[0m\r\n`);
          window.terminalWrite(`\x1b[90m━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\x1b[0m\r\n`);
          
          setIsRecordRunning(false);
          // Show the save modal
          setShowSaveTestCaseModal(true);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [recordSessionId]);

  // Handle terminal input - wrapped in useCallback to prevent Terminal component remounting
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
    
    // Clear terminal
    if (window.terminalClear) {
      window.terminalClear();
    }
  };

  // Record test case handlers
  const handleRecordTestCase = async () => {
    if (files.length === 0) {
      alert('Please add at least one code file before recording a test case.');
      return;
    }

    const allFilesValid = files.every(f => f.filename.trim() && f.content.trim());
    if (!allFilesValid) {
      alert('All files must have a filename and content before recording.');
      return;
    }

    // Reset recording state
    setRecordedInput('');
    setRecordedOutput('');
    setShowRecordModal(true);
    setIsRecordRunning(true);

    // Start terminal execution
    try {
      const result = await window.api.startTerminalExecution({ files });
      setRecordSessionId(result.sessionId || null);
    } catch (error) {
      console.error('[Record] Failed to start execution:', error);
      if (window.terminalWrite) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        window.terminalWrite(`\x1b[31mError: ${errorMsg}\x1b[0m\r\n`);
      }
      setIsRecordRunning(false);
    }
  };

  const handleRecordTerminalData = React.useCallback((data: string) => {
    // Handle backspace - remove from buffer only, don't send to backend
    if (data === '\x7f' || data === '\b') {
      const currentBuffer = recordBufferRef.current;
      if (currentBuffer.length > 0) {
        const newBuffer = currentBuffer.slice(0, -1);
        recordBufferRef.current = newBuffer;
        setRecordBuffer(newBuffer);
        
        // Remove last character from recorded output too
        setRecordedOutput(prev => prev.slice(0, -1));
        
        // Visual feedback: move cursor back, write space, move cursor back again
        if (window.terminalWrite) {
          window.terminalWrite('\b \b');
        }
      }
      return;
    }

    // Handle Enter - send the buffered line
    if (data === '\r') {
      const lineToSend = recordBufferRef.current + '\n';
      
      // Track the input that was sent
      setRecordedInput(prev => prev + lineToSend);
      
      // Add newline to recorded output (user typed characters were already added)
      setRecordedOutput(prev => prev + '\n');
      
      // Send to backend
      if (recordSessionId) {
        window.api.writeToTerminal(recordSessionId, lineToSend);
      }
      
      // Visual feedback - newline
      if (window.terminalWrite) {
        window.terminalWrite('\r\n');
      }
      
      // Clear buffer for next line
      recordBufferRef.current = '';
      setRecordBuffer('');
      return;
    }

    // Regular character - add to buffer and echo
    if (data.charCodeAt(0) >= 32 || data === '\t') {
      const newBuffer = recordBufferRef.current + data;
      recordBufferRef.current = newBuffer;
      setRecordBuffer(newBuffer);
      
      // Add character to recorded output (as user types)
      setRecordedOutput(prev => prev + data);
      
      // Echo the character to terminal
      if (window.terminalWrite) {
        window.terminalWrite(data);
      }
    }
  }, [recordSessionId]);

  const handleCloseRecordModal = async () => {
    if (recordSessionId && isRecordRunning) {
      await window.api.stopTerminalExecution(recordSessionId);
    }
    
    setShowRecordModal(false);
    setRecordSessionId(null);
    setIsRecordRunning(false);
    setRecordedInput('');
    setRecordedOutput('');
    recordBufferRef.current = ''; // Clear record buffer ref
    setRecordBuffer(''); // Clear record buffer
    setRecordedExecutionTime(0);
    setRecordedMemoryUsage(0);
    
    if (window.terminalClear) {
      window.terminalClear();
    }
  };

  const handleSaveTestCase = (isHidden: boolean) => {
    const newTestCase: TestCase = {
      id: `tc-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      input: recordedInput,
      expectedOutput: recordedOutput,
      isHidden,
      executionTime: recordedExecutionTime,
      memoryUsage: recordedMemoryUsage,
    };
    
    setTestCases(prev => [...prev, newTestCase]);
    setShowSaveTestCaseModal(false);
    handleCloseRecordModal();
  };

  const handleTryAgain = () => {
    setShowSaveTestCaseModal(false);
    setRecordedInput('');
    setRecordedOutput('');
    setRecordedExecutionTime(0);
    setRecordedMemoryUsage(0);
    
    if (window.terminalClear) {
      window.terminalClear();
    }
    
    // Restart the execution
    handleRecordTestCase();
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

  // Run all test cases and collect execution metrics
  const runAllTestCasesForMetrics = async (): Promise<TestCase[]> => {
    try {
      console.log('[Metrics] Starting test case validation...');
      const startTime = performance.now();
      
      // Find answer file (code to execute)
      const answerFile = files.find(f => f.isAnswerFile);
      if (!answerFile) {
        throw new Error('No answer file found');
      }

      console.log('[Metrics] Answer file:', answerFile.filename, 'Language:', answerFile.language);

      // Prepare problem for judge
      const problem = {
        id: 'temp-validation',
        title: title.trim(),
        description: description.trim(),
        difficulty,
        time_limit: 5000, // 5 seconds
        memory_limit: 256, // 256 MB
        test_cases: testCases.map((tc) => ({
          input: tc.input.trim(),
          expected_output: tc.expectedOutput.trim(),
          is_hidden: tc.isHidden,
        })),
        tags: [],
      };

      console.log('[Metrics] Running judge with', testCases.length, 'test cases...');
      console.log('[Metrics] Total files:', files.length);
      
      // For now, concatenate all files since judge backend doesn't support multi-file yet
      // TODO: Update Rust backend judge to accept files array like execute does
      const allCode = files.map(f => `// File: ${f.filename}\n${f.content}`).join('\n\n');
      console.log('[Metrics] Combined code length:', allCode.length, 'characters');
      
      // Run through judge with timeout
      const judgeRequest = {
        code: allCode,
        problem,
        language: answerFile.language,
        normalization: {
          normalize_crlf: true,
          ignore_extra_whitespace: true,
        },
      };

      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Judge request timeout (10s)')), 10000);
      });

      const judgePromise = window.api.runJudge(judgeRequest);
      const judgeResponse = await Promise.race([judgePromise, timeoutPromise]) as any;
      
      const judgeTime = performance.now() - startTime;
      console.log('[Metrics] Judge completed in', judgeTime.toFixed(2), 'ms');
      console.log('[Metrics] Judge response:', judgeResponse);

      if (!judgeResponse.success || !judgeResponse.result) {
        console.warn('Judge failed, metrics will not be available:', judgeResponse.error);
        return testCases; // Return original test cases without metrics
      }

      // Update test cases with execution metrics
      const updatedTestCases = testCases.map((tc, index) => {
        const testResult = judgeResponse.result?.test_case_results?.[index];
        if (testResult) {
          console.log(`[Metrics] Test case ${index}:`, {
            executionTime: testResult.execution_result?.execution_time,
            memoryUsage: testResult.execution_result?.memory_usage,
          });
          return {
            ...tc,
            executionTime: testResult.execution_result?.execution_time,
            memoryUsage: testResult.execution_result?.memory_usage,
          };
        }
        return tc;
      });

      console.log('[Metrics] Total time:', (performance.now() - startTime).toFixed(2), 'ms');
      return updatedTestCases;
    } catch (error) {
      console.error('Error running test cases for metrics:', error);
      return testCases; // Return original test cases without metrics on error
    }
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!isFormValid || isSubmitting) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      // Try to run all test cases through the judge to get execution metrics
      // If this fails or times out, we'll proceed without metrics
      let testCasesWithMetrics = testCases;
      try {
        testCasesWithMetrics = await runAllTestCasesForMetrics();
        console.log('[Metrics] Successfully collected metrics');
      } catch (metricsError) {
        console.warn('[Metrics] Failed to collect metrics, proceeding without them:', metricsError);
        // Continue with original test cases without metrics
      }

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
          isHidden: f.isHidden,
          language: f.language,
        })),
        testCases: testCasesWithMetrics.map((tc) => ({
          input: tc.input.trim(),
          expectedOutput: tc.expectedOutput.trim(),
          isHidden: tc.isHidden,
          executionTime: tc.executionTime,
          memoryUsage: tc.memoryUsage,
        })),
        image: imagePreview
          ? {
              name: imageFile?.name ?? 'embedded-image',
              dataUrl: imagePreview,
            }
          : null,
      };

      let result;
      if (editMode && editData) {
        // Update existing question
        const updatePayload = {
          ...payload,
          id: editData.id,
          filePath: editData.filePath,
          sectionKey: section, // Add sectionKey for update
        };
        result = await window.api.updatePracticalQuestion(updatePayload);
        // Navigate back to library after successful update
        navigate('/question-maker/practical/library');
        return;
      } else {
        // Create new question
        result = await window.api.createPracticalQuestion(payload);
      }
      
      setSubmitSuccess({
        section: result.section,
        lesson: result.lesson,
        id: result.id,
      });
      setSubmitError(null);
    } catch (error) {
      console.error(`Failed to ${editMode ? 'update' : 'create'} practical question:`, error);
      const message =
        error instanceof Error
          ? error.message
          : `Failed to ${editMode ? 'update' : 'save'} the question. Please try again.`;
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
            {editMode ? 'Edit Practical Problem' : 'New Practical Problem'}
          </h1>
          {/* Save Indicator */}
          <div className="ml-4 flex items-center gap-2 text-xs text-neutral-400">
            {isSaving ? (
              <>
                <svg className="h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Saving...</span>
              </>
            ) : lastSaved ? (
              <>
                <svg className="h-3 w-3 text-green-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                </svg>
                <span>
                  Saved {new Date().getTime() - lastSaved.getTime() < 60000
                    ? 'just now'
                    : `${Math.floor((new Date().getTime() - lastSaved.getTime()) / 60000)}m ago`}
                </span>
              </>
            ) : (
              <span>Unsaved</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Run Code Button */}
          <button
            type="button"
            onClick={handleRunCode}
            disabled={files.length === 0}
            className="inline-flex items-center gap-2 rounded-md border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            Run Code
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!isFormValid || isSubmitting}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-6 py-2 text-sm font-semibold text-black transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 cursor-pointer"
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
              {editMode ? 'Save Changes' : 'Create Problem'}
            </>
          )}
          </button>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Panel - Problem Description */}
        <div className="w-1/2 border-r border-neutral-800 overflow-y-auto">
          <div className="p-8 space-y-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-10 lg:mt-12">
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

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 mt-6">
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

            <div className="mt-6">
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
            <div className="mt-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold text-white">Test Cases</h3>
                <button
                  type="button"
                  onClick={handleRecordTestCase}
                  className="inline-flex items-center gap-2 rounded-md border border-blue-500/50 bg-blue-500/10 px-4 py-2 text-sm font-medium text-blue-300 transition hover:border-blue-500 hover:bg-blue-500/20 cursor-pointer"
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
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  Record Test Case
                </button>
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
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-neutral-400">
                              Test Case #{index + 1}
                            </span>
                            {tc.executionTime !== undefined && tc.memoryUsage !== undefined && (
                              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                                <span className="flex items-center gap-1">
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {tc.executionTime}ms
                                </span>
                                <span className="flex items-center gap-1">
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                  </svg>
                                  {(tc.memoryUsage / 1024).toFixed(2)}MB
                                </span>
                              </div>
                            )}
                          </div>
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
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-medium text-neutral-400">
                              Hidden Test Case #{index + 1}
                            </span>
                            {tc.executionTime !== undefined && tc.memoryUsage !== undefined && (
                              <div className="flex items-center gap-2 text-[10px] text-neutral-500">
                                <span className="flex items-center gap-1">
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {tc.executionTime}ms
                                </span>
                                <span className="flex items-center gap-1">
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z" />
                                  </svg>
                                  {(tc.memoryUsage / 1024).toFixed(2)}MB
                                </span>
                              </div>
                            )}
                          </div>
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
                  No test cases yet. Click "Record Test Case" to add one.
                </p>
              )}
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
                    title="Locked (read-only)"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                )}
                {file.isHidden && (
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3 w-3 text-purple-400"
                    title="Hidden (not shown to students)"
                  >
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
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
            <div className="border-b border-neutral-800 bg-neutral-900/30 shrink-0">
              {/* Top row: Filename and Language */}
              <div className="h-12 flex items-center gap-4 px-4 border-b border-neutral-800/50">
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
              {/* Bottom row: File Options */}
              <div className="h-10 flex items-center gap-6 px-4">
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={activeFile.isHidden}
                    onChange={(e) => handleFileChange(activeFile.id, 'isHidden', e.target.checked)}
                    className="rounded border-neutral-700 bg-neutral-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-neutral-950"
                  />
                  <span className="text-xs font-medium text-neutral-400">
                    Hidden file (not shown to students)
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
                  parameterHints: { enabled: true, cycle: true },
                  suggestSelection: 'first',
                  acceptSuggestionOnCommitCharacter: true,
                  acceptSuggestionOnEnter: 'on',
                  wordBasedSuggestions: 'allDocuments',
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
                onMount={(_editor, monaco) => {
                  // Register C/C++ completion provider for standard library functions
                  monaco.languages.registerCompletionItemProvider('c', {
                    provideCompletionItems: (model, position) => {
                      const word = model.getWordUntilPosition(position);
                      const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn,
                      };

                      const suggestions = [
                        // stdio.h functions
                        {
                          label: 'printf',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'printf("${1:format}", ${2:args});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Print formatted output to stdout',
                          detail: 'int printf(const char *format, ...)',
                          range,
                        },
                        {
                          label: 'scanf',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'scanf("${1:format}", ${2:args});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Read formatted input from stdin',
                          detail: 'int scanf(const char *format, ...)',
                          range,
                        },
                        {
                          label: 'fflush',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'fflush(${1:stdout});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Flush output stream',
                          detail: 'int fflush(FILE *stream)',
                          range,
                        },
                        {
                          label: 'fprintf',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'fprintf(${1:stream}, "${2:format}", ${3:args});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Print formatted output to stream',
                          detail: 'int fprintf(FILE *stream, const char *format, ...)',
                          range,
                        },
                        {
                          label: 'fgets',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'fgets(${1:str}, ${2:size}, ${3:stdin});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Read a line from stream',
                          detail: 'char *fgets(char *str, int size, FILE *stream)',
                          range,
                        },
                        {
                          label: 'fputs',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'fputs(${1:str}, ${2:stdout});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Write a string to stream',
                          detail: 'int fputs(const char *str, FILE *stream)',
                          range,
                        },
                        // stdlib.h functions
                        {
                          label: 'malloc',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'malloc(${1:size});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Allocate memory',
                          detail: 'void *malloc(size_t size)',
                          range,
                        },
                        {
                          label: 'free',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'free(${1:ptr});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Free allocated memory',
                          detail: 'void free(void *ptr)',
                          range,
                        },
                        {
                          label: 'calloc',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'calloc(${1:count}, ${2:size});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Allocate and zero-initialize memory',
                          detail: 'void *calloc(size_t count, size_t size)',
                          range,
                        },
                        {
                          label: 'realloc',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'realloc(${1:ptr}, ${2:size});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Reallocate memory',
                          detail: 'void *realloc(void *ptr, size_t size)',
                          range,
                        },
                        // string.h functions
                        {
                          label: 'strlen',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'strlen(${1:str});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Get string length',
                          detail: 'size_t strlen(const char *str)',
                          range,
                        },
                        {
                          label: 'strcpy',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'strcpy(${1:dest}, ${2:src});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Copy string',
                          detail: 'char *strcpy(char *dest, const char *src)',
                          range,
                        },
                        {
                          label: 'strcmp',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'strcmp(${1:str1}, ${2:str2});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Compare strings',
                          detail: 'int strcmp(const char *str1, const char *str2)',
                          range,
                        },
                        {
                          label: 'strcat',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'strcat(${1:dest}, ${2:src});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Concatenate strings',
                          detail: 'char *strcat(char *dest, const char *src)',
                          range,
                        },
                      ];
                      return { suggestions };
                    },
                  });

                  // Same for C++
                  monaco.languages.registerCompletionItemProvider('cpp', {
                    provideCompletionItems: (model, position) => {
                      const word = model.getWordUntilPosition(position);
                      const range = {
                        startLineNumber: position.lineNumber,
                        endLineNumber: position.lineNumber,
                        startColumn: word.startColumn,
                        endColumn: word.endColumn,
                      };

                      const suggestions = [
                        // C++ iostream
                        {
                          label: 'cout',
                          kind: monaco.languages.CompletionItemKind.Variable,
                          insertText: 'std::cout << ${1:value} << std::endl;',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Output to console',
                          detail: 'std::ostream cout',
                          range,
                        },
                        {
                          label: 'cin',
                          kind: monaco.languages.CompletionItemKind.Variable,
                          insertText: 'std::cin >> ${1:variable};',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Read from console',
                          detail: 'std::istream cin',
                          range,
                        },
                        // Also include C functions for compatibility
                        {
                          label: 'printf',
                          kind: monaco.languages.CompletionItemKind.Function,
                          insertText: 'printf("${1:format}", ${2:args});',
                          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                          documentation: 'Print formatted output to stdout',
                          detail: 'int printf(const char *format, ...)',
                          range,
                        },
                      ];
                      return { suggestions };
                    },
                  });
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
                {fileNameError && (
                  <p className="mt-2 text-xs text-rose-400">
                    {fileNameError}
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

      {/* Run Code Modal with Interactive Terminal */}
      {showRunModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Interactive Terminal</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Your program is running. Type input and press Enter when prompted.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseRunModal}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800"
              >
                Close
              </button>
            </div>
            
            <Terminal key="run-terminal" onData={handleTerminalData} />
            
            {isTerminalRunning && (
              <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                <span>Program is running...</span>
              </div>
            )}
            {!isTerminalRunning && terminalSessionId === null && (
              <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
                <div className="h-2 w-2 rounded-full bg-gray-500"></div>
                <span>Program has finished</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Record Test Case Modal with Interactive Terminal */}
      {showRecordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-4xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold">Record Test Case</h2>
                <p className="mt-1 text-sm text-neutral-400">
                  Run your program and interact with it. All inputs and outputs will be recorded.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseRecordModal}
                className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 cursor-pointer"
              >
                Cancel
              </button>
            </div>
            
            <Terminal key="record-terminal" onData={handleRecordTerminalData} />
            
            {isRecordRunning && (
              <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
                <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse"></div>
                <span>Recording... Type your inputs and interact with the program.</span>
              </div>
            )}
            {!isRecordRunning && recordSessionId === null && (
              <div className="mt-3 flex items-center gap-2 text-xs text-neutral-500">
                <div className="h-2 w-2 rounded-full bg-gray-500"></div>
                <span>Program has finished</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Save Test Case Modal */}
      {showSaveTestCaseModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl border border-neutral-800 bg-neutral-900 p-6 text-neutral-100 shadow-xl">
            <h2 className="text-xl font-semibold mb-4">Save Test Case</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-2">
                  Recorded Input
                </label>
                <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 max-h-32 overflow-y-auto">
                  <pre className="font-mono text-xs text-neutral-300 whitespace-pre-wrap">
                    {recordedInput || '(no input)'}
                  </pre>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-neutral-200 mb-2">
                  Recorded Output
                </label>
                <div className="rounded-md border border-neutral-800 bg-neutral-950 px-3 py-2 max-h-48 overflow-y-auto">
                  <pre className="font-mono text-xs text-neutral-300 whitespace-pre-wrap">
                    {recordedOutput || '(no output)'}
                  </pre>
                </div>
              </div>
            </div>

            <p className="text-sm text-neutral-400 mb-6">
              Choose whether to save this as a visible or hidden test case, or try again to record a different interaction.
            </p>
            
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => handleSaveTestCase(false)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-green-500/50 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-300 transition hover:border-green-500 hover:bg-green-500/20 cursor-pointer"
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
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                Save as Visible
              </button>
              
              <button
                type="button"
                onClick={() => handleSaveTestCase(true)}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-purple-500/50 bg-purple-500/10 px-4 py-3 text-sm font-medium text-purple-300 transition hover:border-purple-500 hover:bg-purple-500/20 cursor-pointer"
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
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
                Save as Hidden
              </button>
              
              <button
                type="button"
                onClick={handleTryAgain}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
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
                  <polyline points="1 4 1 10 7 10" />
                  <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                </svg>
                Try Again
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticalQuestionCreator;
