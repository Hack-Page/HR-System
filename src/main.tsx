import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { ensurePersistentStorage } from './db';

// SKILL §4bis: xin persistent storage ngay khi bootstrap — IndexedDB là source of truth duy nhất
ensurePersistentStorage().then(granted => {
  if (!granted) console.warn('[DB] Persistent storage not granted — user should backup via OneDrive JSON regularly.');
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
