import React from 'react';
import './brand.css';

// Use the same source artwork as the web navigation; Vite bundles it for offline startup.
const darkLogo = new URL('../../../public/loq-logo-dark.png', import.meta.url).href;
const lightLogo = new URL('../../../public/loq-logo-light.png', import.meta.url).href;

export function LOQBrand({ className = '', variant = 'auto' }) {
  return <span className={`loq-brand loq-brand--${variant} ${className}`} role="img" aria-label="LOQ">
    <img src={darkLogo} alt="" className="loq-brand-on-light" draggable="false" />
    <img src={lightLogo} alt="" className="loq-brand-on-dark" draggable="false" />
  </span>;
}
