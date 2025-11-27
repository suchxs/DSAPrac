import React, { useEffect, useMemo, useRef, useState } from 'react';

type EntryLevel = 'log' | 'warn' | 'error' | 'system' | 'command';

interface ConsoleEntry {
  id: number;
  level: EntryLevel;
  message: string;
  timestamp: number;
}

interface DeveloperConsoleProps {
  enabled: boolean;
  hotkey: string;
}

const MAX_ENTRIES = 400;

const levelColors: Record<EntryLevel, string> = {
  log: 'text-neutral-100',
  warn: 'text-amber-300',
  error: 'text-red-400',
  system: 'text-sky-300',
  command: 'text-emerald-300',
};

const formatMessage = (args: any[]): string => {
  return args
    .map((arg) => {
      if (typeof arg === 'string') return arg;
      try {
        return JSON.stringify(arg, null, 2);
      } catch {
        return String(arg);
      }
    })
    .join(' ');
};

const DeveloperConsole: React.FC<DeveloperConsoleProps> = ({ enabled, hotkey }) => {
  const [visible, setVisible] = useState(false);
  const [entries, setEntries] = useState<ConsoleEntry[]>([]);
  const [input, setInput] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const normalizedHotkey = useMemo(() => (hotkey || '`').toLowerCase(), [hotkey]);

  // Attach console interceptors
  useEffect(() => {
    const originalLog = console.log;
    const originalWarn = console.warn;
    const originalError = console.error;

    const push = (level: EntryLevel, args: any[]) => {
      const message = formatMessage(args);
      setEntries((prev) => {
        const next = [...prev, { id: Date.now() + Math.random(), level, message, timestamp: Date.now() }];
        return next.slice(-MAX_ENTRIES);
      });
    };

    console.log = (...args: any[]) => {
      push('log', args);
      originalLog(...args);
    };
    console.warn = (...args: any[]) => {
      push('warn', args);
      originalWarn(...args);
    };
    console.error = (...args: any[]) => {
      push('error', args);
      originalError(...args);
    };

    return () => {
      console.log = originalLog;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  // Scroll to bottom when new entries arrive
  useEffect(() => {
    if (!visible) return;
    const node = scrollRef.current;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [entries, visible]);

  useEffect(() => {
    if (visible && inputRef.current) {
      inputRef.current.focus();
    }
  }, [visible]);

  // Toggle console with hotkey
  useEffect(() => {
    if (!enabled) {
      setVisible(false);
      return;
    }

    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.getAttribute('contenteditable') === 'true';
      if (isTyping) return;

      if (e.key.toLowerCase() === normalizedHotkey) {
        e.preventDefault();
        setVisible((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, normalizedHotkey]);

  const pushEntry = (level: EntryLevel, message: string) => {
    setEntries((prev) => {
      const next = [...prev, { id: Date.now() + Math.random(), level, message, timestamp: Date.now() }];
      return next.slice(-MAX_ENTRIES);
    });
  };

  // Listen for console events forwarded from all BrowserWindows via IPC
  useEffect(() => {
    const unsubscribe = window.api.onDevConsoleLog?.((entry) => {
      const level: EntryLevel =
        entry.level === 'warn' || entry.level === 'error' || entry.level === 'system'
          ? entry.level
          : 'log';
      const sourcePrefix = entry.source ? `[${entry.source}] ` : '';
      pushEntry(level, `${sourcePrefix}${entry.message}`);
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const closeConsole = () => setVisible(false);

  const handleSubmit = async () => {
    const command = input.trim();
    if (!command) return;

    pushEntry('command', `> ${command}`);
    setHistory((prev) => [...prev, command].slice(-50));
    setHistoryIndex(-1);
    setInput('');

    if (command.toLowerCase() === 'clear') {
      setEntries([]);
      return;
    }

    try {
      const result = await window.api.runDevConsoleCommand(command);
      if (result.action === 'clear') {
        setEntries([]);
        return;
      }
      if (result.output?.length) {
        result.output.forEach((line) => pushEntry(result.ok ? 'system' : 'error', line));
      }
    } catch (error: any) {
      pushEntry('error', `Command failed: ${error?.message || 'Unknown error'}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeConsole();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHistoryIndex((prev) => {
        const nextIndex = prev < 0 ? history.length - 1 : Math.max(0, prev - 1);
        const nextValue = history[nextIndex] ?? '';
        setInput(nextValue);
        return nextIndex;
      });
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHistoryIndex((prev) => {
        if (prev < 0) return -1;
        const nextIndex = prev + 1;
        const nextValue = history[nextIndex] ?? '';
        setInput(nextValue);
        return nextIndex >= history.length ? -1 : nextIndex;
      });
    }
  };

  if (!enabled) return null;

  return (
    <div
      className={`fixed inset-0 z-50 pointer-events-none transition-opacity duration-150 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <div className={`absolute inset-0 bg-black/60 backdrop-blur-sm ${visible ? 'pointer-events-auto' : 'pointer-events-none'}`}>
        <div className="absolute left-1/2 top-12 w-[92%] max-w-5xl -translate-x-1/2 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950/95 shadow-2xl">
          <div className="border-b border-neutral-800 bg-gradient-to-r from-neutral-900 to-neutral-800 px-6 py-4 flex items-start gap-4">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-[0.15em] text-neutral-400">
                DSAPrac Made by suchxs and koeyori 愛を込めて作られました&lt;3
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <div className="font-semibold text-white">Developer Console:</div>
                <div className="text-neutral-500 text-xs">
                  Hotkey: <span className="text-neutral-200 font-mono">{normalizedHotkey || '`'}</span>
                </div>
              </div>
            </div>
            <button
              onClick={closeConsole}
              className="mt-1 inline-flex h-8 w-8 items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900 text-neutral-300 hover:bg-neutral-800 hover:text-white transition-colors cursor-pointer"
              aria-label="Close console"
            >
              ✕
            </button>
          </div>

          <div className="max-h-[55vh] overflow-y-auto px-6 py-4 space-y-2 font-mono text-[13px]" ref={scrollRef}>
            {entries.length === 0 && (
              <div className="text-neutral-500">Console ready. Type "help" for commands.</div>
            )}
            {entries.map((entry) => (
              <div key={entry.id} className="flex items-start gap-3">
                <span className="text-neutral-500 text-[11px] w-20">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className={`flex-1 whitespace-pre-wrap ${levelColors[entry.level]}`}>
                  {entry.message}
                </span>
              </div>
            ))}
          </div>

          <div className="border-t border-neutral-800 bg-neutral-900/70 px-6 py-4">
            <div className="flex items-center gap-3">
              <span className="text-neutral-500 text-sm font-mono">{'>'}</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder='Type a command (e.g., "help")'
                className="flex-1 rounded-lg border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:border-blue-500"
              />
              <button
                onClick={handleSubmit}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors cursor-pointer"
              >
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeveloperConsole;
