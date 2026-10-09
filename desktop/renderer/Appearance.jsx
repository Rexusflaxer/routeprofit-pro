import React, { createContext, useContext, useEffect, useState } from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { Button } from '../../src/components/ui/button';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from '../../src/components/ui/dropdown-menu';

const modes = ['system', 'light', 'dark'];
const AppearanceContext = createContext({theme:'system', setTheme:() => {}});
const readTheme = () => { try { const saved = localStorage.getItem('theme'); return modes.includes(saved) ? saved : 'system'; } catch { return 'system'; } };
function applyTheme(theme) {
  const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light';
}
// No inline bootstrap script: the packaged renderer keeps its restrictive CSP.
export function initializeAppearance() { applyTheme(readTheme()); }
export function AppearanceProvider({children}) {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    applyTheme(theme);
    try { localStorage.setItem('theme', theme); } catch { /* Still works for this session. */ }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const changed = () => { if (theme === 'system') applyTheme(theme); };
    const stored = event => { if (event.key === 'theme') setTheme(readTheme()); };
    media.addEventListener('change', changed); window.addEventListener('storage', stored);
    return () => { media.removeEventListener('change', changed); window.removeEventListener('storage', stored); };
  }, [theme]);
  return <AppearanceContext.Provider value={{theme, setTheme}}>{children}</AppearanceContext.Provider>;
}
export function AppearanceOptions() {
  const {theme, setTheme} = useContext(AppearanceContext);
  return <><DropdownMenuLabel className="text-xs text-muted-foreground">Weergave</DropdownMenuLabel><DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
    <DropdownMenuRadioItem value="system"><Monitor/>Automatisch</DropdownMenuRadioItem>
    <DropdownMenuRadioItem value="light"><Sun/>Licht</DropdownMenuRadioItem>
    <DropdownMenuRadioItem value="dark"><Moon/>Donker</DropdownMenuRadioItem>
  </DropdownMenuRadioGroup></>;
}
export function AppearanceMenu() {
  const {theme} = useContext(AppearanceContext);
  const Icon = theme === 'dark' ? Moon : theme === 'light' ? Sun : Monitor;
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Weergave wijzigen" title="Weergave wijzigen"><Icon/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><AppearanceOptions/></DropdownMenuContent></DropdownMenu>;
}
