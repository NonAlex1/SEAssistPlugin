import * as React from 'react';
import * as ReactDOM from 'react-dom/client';
import { App } from './components/App';
import './taskpane.css';

Office.onReady(() => {
  const container = document.getElementById('root');
  if (!container) return;
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
});
