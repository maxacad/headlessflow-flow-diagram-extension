import React from 'react';
import { createRoot } from 'react-dom/client';
import { NodeDetailApp } from './App';

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(<NodeDetailApp />);
}
