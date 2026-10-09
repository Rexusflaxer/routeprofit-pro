import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DesktopSignIn from '../../../src/pages/DesktopSignIn';

const { invoke, user } = vi.hoisted(() => ({
  invoke: vi.fn(),
  user: { full_name: 'Voorbeeldbeheerder', email: 'voorbeeld@example.test' },
}));
vi.mock('@/api/base44Client', () => ({ base44: { functions: { invoke } } }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user }) }));

const state = 's'.repeat(43);
const challenge = 'c'.repeat(43);
const setLink = (query = `state=${state}&challenge=${challenge}`) => window.history.replaceState(null, '', `/DesktopSignIn?${query}`);

beforeEach(() => {
  setLink();
  invoke.mockReset();
});
afterEach(() => {
  cleanup();
  window.history.replaceState(null, '', '/');
});

describe('LOQ Desktop browser approval', () => {
  it('identifies the current account and preserves no-referrer protection', () => {
    const { unmount } = render(<DesktopSignIn />);
    expect(screen.getByRole('heading', { name: 'Verder in LOQ Desktop' })).toBeVisible();
    expect(screen.getByText(user.full_name)).toBeVisible();
    expect(screen.getByText(user.email)).toBeVisible();
    expect(document.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
    unmount();
    expect(document.querySelector('meta[name="referrer"]')).toBeNull();
  });

  it('shows a recovery instruction and no approval control for an invalid link', () => {
    setLink('state=wrong&challenge=wrong');
    render(<DesktopSignIn />);
    expect(screen.getByRole('alert')).toHaveTextContent('Begin opnieuw in de desktopapp');
    expect(screen.queryByRole('button', { name: /Verbind mijn/ })).not.toBeInTheDocument();
    expect(invoke).not.toHaveBeenCalled();
  });

  it('keeps the proof-bound request intact, prevents duplicate clicks, and exposes an accessible retry', async () => {
    let rejectRequest;
    invoke.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRequest = reject; }));
    render(<DesktopSignIn />);
    fireEvent.click(screen.getByRole('button', { name: 'Verbind mijn LOQ-account' }));
    const busy = screen.getByRole('button', { name: 'Account verbinden…' });
    expect(busy).toBeDisabled();
    expect(busy).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(busy);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenCalledWith('desktopAuth', {
      action: 'approve', state, challenge, redirect_uri: 'loq-desktop://auth-callback',
    });
    rejectRequest(new Error('Geen verbinding. Probeer opnieuw.'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Geen verbinding. Probeer opnieuw.'));
    expect(screen.getByRole('button', { name: 'Verbind mijn LOQ-account' })).toBeEnabled();
  });

  it('never offers an app callback when the server response does not match the attempt', async () => {
    invoke.mockResolvedValueOnce({ data: { code: 'a'.repeat(43), state: 'wrong-state', redirect_uri: 'loq-desktop://auth-callback' } });
    render(<DesktopSignIn />);
    fireEvent.click(screen.getByRole('button', { name: 'Verbind mijn LOQ-account' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('De aanmeldreactie kon niet worden gecontroleerd.'));
    expect(screen.queryByRole('link', { name: 'LOQ Desktop openen' })).not.toBeInTheDocument();
  });
});
