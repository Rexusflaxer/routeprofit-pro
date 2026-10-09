import React, { useEffect, useState } from 'react';
import { ArrowUpRight, Check, Loader2, Monitor, UserRound } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { LOQBrand } from '@/components/brand/LOQBrand';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

function DesktopSignInContent() {
  const { user } = useAuth();
  useEffect(() => {
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer';
    document.head.appendChild(meta); return () => meta.remove();
  }, []);
  const [status, setStatus] = useState('ready');
  const [error, setError] = useState('');
  const [callback, setCallback] = useState('');
  const params = new URLSearchParams(window.location.search);
  const state = params.get('state');
  const challenge = params.get('challenge');
  const valid = /^[A-Za-z0-9_-]{43,128}$/.test(state || '') && /^[A-Za-z0-9_-]{43,128}$/.test(challenge || '');
  const approve = async () => {
    setStatus('busy'); setError('');
    try {
      const response = await base44.functions.invoke('desktopAuth', {action: 'approve', state, challenge, redirect_uri: 'loq-desktop://auth-callback'});
      const result = response.data;
      if (!/^[A-Za-z0-9_-]{43,128}$/.test(result?.code || '') || result.state !== state || result.redirect_uri !== 'loq-desktop://auth-callback') throw new Error('De aanmeldreactie kon niet worden gecontroleerd.');
      const target = `loq-desktop://auth-callback?code=${encodeURIComponent(result.code)}&state=${encodeURIComponent(state)}`;
      setCallback(target); setStatus('done'); window.location.assign(target);
    } catch (err) { setError(err?.response?.data?.error || err.message || 'Aanmelden is niet gelukt.'); setStatus('ready'); }
  };
  return <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12 text-foreground">
    <div className="w-full max-w-md">
      <div className="mb-6 flex items-center justify-center gap-3">
        <LOQBrand className="h-7 w-auto" />
        <span aria-hidden="true" className="h-5 w-px bg-border" />
        <span className="text-sm font-medium text-muted-foreground">Desktop</span>
      </div>
      <Card aria-labelledby="desktop-signin-title" className="bg-card">
        <CardHeader className="space-y-3 p-6 pb-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg border border-primary/10 bg-primary/10 text-primary">
            {callback ? <Check className="h-4 w-4" aria-hidden="true" /> : <Monitor className="h-4 w-4" aria-hidden="true" />}
          </span>
          <h1 id="desktop-signin-title" className="text-xl font-semibold tracking-tight">{callback ? 'Verder in de app' : 'Verder in LOQ Desktop'}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{callback ? 'LOQ Desktop wordt geopend. U kunt dit venster daarna sluiten.' : 'Verbind deze Mac met uw LOQ-account om gebouwplattegronden te openen en op te slaan.'}</p>
        </CardHeader>
        <CardContent className="space-y-5 px-6 pb-6">
          {user && <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-3 py-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-card text-muted-foreground"><UserRound className="h-4 w-4" aria-hidden="true" /></span>
            <div className="min-w-0 text-xs leading-relaxed">
              <p className="break-words font-medium text-foreground">{user.full_name || user.email}</p>
              {user.full_name && user.email && <p className="break-all text-muted-foreground">{user.email}</p>}
            </div>
          </div>}
          {!valid ? <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed text-foreground">Deze aanmeldlink is ongeldig. Begin opnieuw in de desktopapp.</p> : callback ? <Button asChild size="lg" className="w-full"><a href={callback}>LOQ Desktop openen<ArrowUpRight aria-hidden="true" /></a></Button> : <Button onClick={approve} disabled={status === 'busy'} aria-busy={status === 'busy'} size="lg" className="w-full">{status === 'busy' ? <><Loader2 className="animate-spin" aria-hidden="true" />Account verbinden…</> : <>Verbind mijn LOQ-account<ArrowUpRight aria-hidden="true" /></>}</Button>}
          {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm leading-relaxed text-foreground">{error}</p>}
        </CardContent>
      </Card>
      <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">Uw objecten, gebouwen en plattegronden in één vertrouwde omgeving.</p>
    </div>
  </main>;
}

export default function DesktopSignIn() {
  return <ThemeProvider attribute="class" defaultTheme="system" enableSystem><DesktopSignInContent /></ThemeProvider>;
}
