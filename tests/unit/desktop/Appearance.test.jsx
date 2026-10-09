import React from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppearanceMenu, AppearanceProvider, initializeAppearance } from '../../../desktop/renderer/Appearance';

let systemDark;
let mediaListeners;

function changeSystem(dark) {
  systemDark = dark;
  act(() => mediaListeners.forEach(listener => listener({ matches: dark })));
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  systemDark = false;
  mediaListeners = new Set();
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return systemDark; },
    addEventListener: (_type, listener) => mediaListeners.add(listener),
    removeEventListener: (_type, listener) => mediaListeners.delete(listener),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
});

describe('LOQ Desktop appearance preference', () => {
  it('uses the Mac appearance on startup and follows changes until unmounted', () => {
    systemDark = true;
    initializeAppearance();
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    const view = render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    expect(localStorage.getItem('theme')).toBe('system');
    changeSystem(false);
    expect(document.documentElement).not.toHaveClass('dark');
    expect(document.documentElement.style.colorScheme).toBe('light');
    view.unmount();
    expect(mediaListeners.size).toBe(0);
  });

  it('lets the user choose a persistent explicit appearance that ignores system changes', () => {
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    fireEvent.keyDown(screen.getByRole('button', { name: 'Weergave wijzigen' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Donker' }));
    expect(localStorage.getItem('theme')).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');
    changeSystem(false);
    expect(document.documentElement).toHaveClass('dark');
    cleanup();
    document.documentElement.classList.remove('dark');
    initializeAppearance();
    expect(document.documentElement).toHaveClass('dark');
  });

  it('reflects a preference changed in another window and falls back for an unknown preference', () => {
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    localStorage.setItem('theme', 'dark');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'dark' })));
    expect(document.documentElement).toHaveClass('dark');
    localStorage.setItem('theme', 'unsupported');
    act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: 'unsupported' })));
    expect(document.documentElement).not.toHaveClass('dark');
    expect(localStorage.getItem('theme')).toBe('system');
  });

  it('can still render and follow system appearance if preference storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Unavailable'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Unavailable'); });
    initializeAppearance();
    render(<AppearanceProvider><AppearanceMenu /></AppearanceProvider>);
    changeSystem(true);
    expect(screen.getByRole('button', { name: 'Weergave wijzigen' })).toBeVisible();
    expect(document.documentElement).toHaveClass('dark');
  });
});
