import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

interface TerminalProps {
  onData: (data: string) => void;
  onResize?: (cols: number, rows: number) => void;
  onReady?: (api: { write: (data: string) => void; clear: () => void }) => void;
}

export const Terminal: React.FC<TerminalProps> = ({ onData, onResize, onReady }) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  
  // Use refs to avoid recreating terminal when callbacks change
  const onDataRef = useRef(onData);
  const onResizeRef = useRef(onResize);
  
  // Update refs when props change
  useEffect(() => {
    onDataRef.current = onData;
    onResizeRef.current = onResize;
  }, [onData, onResize]);

  useEffect(() => {
    if (!terminalRef.current) return;

    // Create terminal instance
    const xterm = new XTerm({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: 'Consolas, "Courier New", monospace',
      theme: {
        background: '#0a0a0a',
        foreground: '#e5e5e5',
        cursor: '#22c55e',
        cursorAccent: '#0a0a0a',
        selectionBackground: '#374151',
        black: '#171717',
        red: '#f87171',
        green: '#4ade80',
        yellow: '#fbbf24',
        blue: '#60a5fa',
        magenta: '#c084fc',
        cyan: '#22d3ee',
        white: '#e5e5e5',
        brightBlack: '#525252',
        brightRed: '#fca5a5',
        brightGreen: '#86efac',
        brightYellow: '#fcd34d',
        brightBlue: '#93c5fd',
        brightMagenta: '#d8b4fe',
        brightCyan: '#67e8f9',
        brightWhite: '#fafafa',
      },
      cols: 80,
      rows: 24,
    });

    // Create fit addon
    const fitAddon = new FitAddon();
    xterm.loadAddon(fitAddon);

    // Open terminal
    xterm.open(terminalRef.current);
    
    // Use setTimeout to ensure terminal is fully initialized before fitting
    setTimeout(() => {
      try {
        fitAddon.fit();
      } catch (error) {
        console.error('[Terminal Component] Error fitting terminal:', error);
      }
    }, 0);

    // Handle user input
    xterm.onData((data) => {
      onDataRef.current(data);
    });

    // Handle resize
    xterm.onResize(({ cols, rows }) => {
      if (onResizeRef.current) {
        onResizeRef.current(cols, rows);
      }
    });

    // Store refs
    xtermRef.current = xterm;
    fitAddonRef.current = fitAddon;

    // Expose write and clear methods on window immediately
    const write = (data: string) => {
      console.log('[Terminal Component] Writing data:', data);
      xterm.write(data);
    };
    const clear = () => {
      xterm.clear();
    };

    (window as any).terminalWrite = write;
    (window as any).terminalClear = clear;

    if (onReady) {
      onReady({ write, clear });
    }
    
    console.log('[Terminal Component] Terminal initialized, write function exposed');

    // Fit on window resize
    const handleResize = () => {
      fitAddon.fit();
    };
    window.addEventListener('resize', handleResize);

    // Cleanup
    return () => {
      window.removeEventListener('resize', handleResize);
      xterm.dispose();
      delete (window as any).terminalWrite;
      delete (window as any).terminalClear;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty deps - only initialize once, use refs for dynamic values

  return (
    <div
      ref={terminalRef}
      className="w-full h-full rounded-md border border-neutral-800 overflow-hidden"
      style={{ height: '400px' }}
    />
  );
};

export default Terminal;
