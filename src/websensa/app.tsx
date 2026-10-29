import React from 'react';
import { createRoot } from 'react-dom/client';
import WebSensa from './WebSensa.tsx';
import '../web/styles.css';
import './styles.css';

const root = document.getElementById('app-root');
if (!root) throw new Error('Missing WebSensa root element.');
createRoot(root).render(<WebSensa />);
