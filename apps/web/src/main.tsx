import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import '@fontsource-variable/archivo/wdth.css';
import './styles.css';
import App from './App';
import { LiveProvider } from './lib/api';

createRoot(document.getElementById('root')!).render(
  <StrictMode><BrowserRouter><LiveProvider><App /></LiveProvider></BrowserRouter></StrictMode>,
);
