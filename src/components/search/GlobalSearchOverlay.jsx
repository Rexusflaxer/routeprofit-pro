import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { useNavigate } from "react-router-dom";
import GlobalSearchResults from "./GlobalSearchResults";
import useGlobalSearch from "./useGlobalSearch";

export default function GlobalSearchOverlay({ open, onClose, initialQuery = "" }) {
  const [query, setQuery] = useState(""); const inputRef = useRef(null); const navigate = useNavigate();
  const search = useGlobalSearch(open, query);
  useEffect(() => { if (!open) return; setQuery(initialQuery); requestAnimationFrame(() => inputRef.current?.focus()); }, [initialQuery, open]);
  useEffect(() => { const close = event => event.key === "Escape" && onClose(); window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close); }, [onClose]);
  const select = href => { onClose(); navigate(href); };
  return <AnimatePresence>{open && <motion.div onClick={onClose} className="fixed inset-0 z-[100] overflow-hidden bg-background/35 px-4 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
    <motion.div onClick={event => event.stopPropagation()} className="mx-auto w-full max-w-3xl" initial={{ marginTop: "36vh", scale: .98 }} animate={{ marginTop: query ? "3.5rem" : "36vh", scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 28 }}>
      <div className="flex h-14 items-center gap-3 rounded-2xl border border-border/70 bg-card/50 px-4 shadow-2xl backdrop-blur-xl"><Search className="h-5 w-5 shrink-0 text-muted-foreground" /><input ref={inputRef} value={query} onChange={event => setQuery(event.target.value)} placeholder="Waar wilt u naar zoeken?" aria-label="Globaal zoeken" className="h-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground" />{query && <button type="button" onClick={() => setQuery("")} aria-label="Zoekterm wissen" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>}</div>
      <AnimatePresence>{query && <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}><GlobalSearchResults query={query} results={search.results} loading={search.isLoading} onSelect={select} /></motion.div>}</AnimatePresence>
    </motion.div>
  </motion.div>}</AnimatePresence>;
}