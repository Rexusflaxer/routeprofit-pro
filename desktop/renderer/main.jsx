import React from 'react';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';
import { AppearanceProvider, initializeAppearance } from './Appearance';
import App from './App';
initializeAppearance();
createRoot(document.getElementById('root')).render(<AppearanceProvider><App/></AppearanceProvider>);
