import React from 'react';
import { createRoot } from 'react-dom/client';

function App() {
  return (
    <div style={{ padding: 16 }}>
      <h1>DSAPrac</h1>
      <p>Electron + React + TypeScript initialized.</p>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);
