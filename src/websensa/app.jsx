import React from 'react';
import { createRoot } from 'react-dom/client';
import WebSensa from './WebSensa.jsx';
import '../web/styles.css';
import './styles.css';

createRoot(document.getElementById('app-root')).render(<WebSensa />);
