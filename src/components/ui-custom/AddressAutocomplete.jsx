import React, { useEffect, useId, useRef, useState } from "react";
import { AlertCircle, LoaderCircle, MapPin } from "lucide-react";
import { base44, base44LatestFunctions, hasPinnedFunctionsVersion } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { addressPartsFromSuggestion, addressSuggestionLabel, formatAddress } from "@/lib/addressFormatting";
import { objectCoordinatePair, safeCoordinateNumber } from "@/lib/coordinates";

const PAGE_SIZE = 20;

function suggestionKey(suggestion) {
  return suggestion.bag_address_id || suggestion.nummeraanduiding_id || suggestion.id || addressSuggestionLabel(suggestion);
}

function mergeSuggestions(previous, incoming) {
  const seen = new Set(previous.map(suggestionKey));
  return [...previous, ...incoming.filter(suggestion => {
    const key = suggestionKey(suggestion);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  })];
}

export default function AddressAutocomplete({ id, value = {}, onAddressSelect, onQueryChange, placeholder, className = "" }) {
  const generatedId = useId();
  const inputId = id || `address-${generatedId}`;
  const listId = `${inputId}-suggestions`;
  const hintId = `${inputId}-help`;
  const formattedAddress = formatAddress(value, { omitDefaultCountry: true });
  const [query, setQuery] = useState(formattedAddress);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [errorOffset, setErrorOffset] = useState(0);
  const [nextOffset, setNextOffset] = useState(null);
  const [total, setTotal] = useState(null);
  const [activeIndex, setActiveIndex] = useState(-1);
  const queryRef = useRef(formattedAddress);
  const requestRef = useRef(0);
  const timeoutRef = useRef(null);
  const blurTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const anchorRef = useRef(null);
  const contentRef = useRef(null);
  const optionRefs = useRef([]);
  const suppressFocusOpenRef = useRef(false);

  useEffect(() => {
    // Parent forms can echo the user's query after normalizing its formatting.
    // Only a genuinely external address change invalidates the in-flight list.
    const normalizedQuery = formatAddress({ address: queryRef.current }, { omitDefaultCountry: true });
    if (formattedAddress !== queryRef.current && formattedAddress !== normalizedQuery) {
      clearTimeout(timeoutRef.current);
      requestRef.current += 1;
      setSuggestions([]);
      setNextOffset(null);
      setTotal(null);
      setError(null);
      setLoading(false);
      setLoadingMore(false);
      setActiveIndex(-1);
      setOpen(false);
    }
    queryRef.current = formattedAddress;
    setQuery(formattedAddress);
  }, [formattedAddress]);
  useEffect(() => {
    if (open && activeIndex >= 0) optionRefs.current[activeIndex]?.scrollIntoView?.({ block: "nearest" });
  }, [activeIndex, open]);
  useEffect(() => () => {
    clearTimeout(timeoutRef.current);
    clearTimeout(blurTimeoutRef.current);
    requestRef.current += 1;
  }, []);

  const close = () => {
    clearTimeout(timeoutRef.current);
    requestRef.current += 1;
    setLoading(false);
    setLoadingMore(false);
    setOpen(false);
    setActiveIndex(-1);
  };

  const fetchPage = async (searchQuery, offset, requestId) => {
    const append = offset > 0;
    setError(null);
    setErrorOffset(offset);
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      // Only this lookup uses the new paginated contract. The latest client
      // retains authentication; failed requests are never silently replayed.
      const client = hasPinnedFunctionsVersion === true && base44LatestFunctions?.functions?.invoke
        ? base44LatestFunctions : base44;
      const response = await client.functions.invoke("lookupService", { action: "search_address", query: searchQuery.trim(), limit: PAGE_SIZE, offset });
      if (requestRef.current !== requestId) return;
      const data = response?.data?.data || response?.data;
      const results = data?.suggestions || data?.results;
      if (data?.error || !Array.isArray(results)) throw new Error("Geen bruikbare adresresultaten ontvangen.");
      setSuggestions(previous => mergeSuggestions(append ? previous : [], results));
      const following = Number(data.next_offset);
      setNextOffset(data.has_more === true && Number.isInteger(following) && following > offset ? following : null);
      const count = Number(data.total);
      setTotal(data.total != null && Number.isFinite(count) && count >= 0 ? count : null);
      if (!append) setActiveIndex(-1);
    } catch {
      if (requestRef.current === requestId) setError("Adressen konden niet worden geladen. Probeer opnieuw of verfijn je zoekopdracht.");
    } finally {
      if (requestRef.current === requestId) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  };

  const search = nextQuery => {
    clearTimeout(timeoutRef.current);
    const requestId = ++requestRef.current;
    setSuggestions([]);
    setNextOffset(null);
    setTotal(null);
    setError(null);
    setActiveIndex(-1);
    setLoadingMore(false);
    const searchable = nextQuery.trim().length >= 3;
    setOpen(searchable);
    setLoading(searchable);
    if (!searchable) return;
    timeoutRef.current = setTimeout(() => fetchPage(nextQuery, 0, requestId), 300);
  };

  const loadMore = () => {
    if (nextOffset === null || loading || loadingMore) return;
    fetchPage(query, nextOffset, ++requestRef.current);
  };

  const selectAddress = suggestion => {
    close();
    const parsedLatitude = safeCoordinateNumber(suggestion.latitude, -90, 90);
    const parsedLongitude = safeCoordinateNumber(suggestion.longitude, -180, 180);
    const coordinates = objectCoordinatePair({ latitude: parsedLatitude, longitude: parsedLongitude });
    const [longitude, latitude] = coordinates || [null, null];
    const address = {
      ...addressPartsFromSuggestion(suggestion, value), latitude, longitude,
      bag_address_id: suggestion.bag_address_id || suggestion.nummeraanduiding_id || null,
      geocoding_status: coordinates ? "verified" : "unverified",
    };
    const selectedLabel = formatAddress(address, { omitDefaultCountry: true });
    queryRef.current = selectedLabel;
    onAddressSelect?.(address, suggestion);
    setQuery(selectedLabel);
    setSuggestions([]);
  };

  const onKeyDown = event => {
    if (event.key === "Escape") {
      if (open) event.preventDefault();
      close();
      return;
    }
    if (event.key === "Tab") { close(); return; }
    if (!open) {
      if (event.key === "ArrowDown" && query.trim().length >= 3) {
        event.preventDefault();
        if (suggestions.length) { setOpen(true); setActiveIndex(0); }
        else search(query);
      }
      return;
    }
    if (event.key === "Enter") {
      // Do not submit a surrounding wizard while the user chooses an address.
      event.preventDefault();
      if (activeIndex >= 0 && suggestions[activeIndex]) selectAddress(suggestions[activeIndex]);
      else if (error) fetchPage(query, errorOffset, ++requestRef.current);
      return;
    }
    if (event.key === "PageDown" && nextOffset !== null) { event.preventDefault(); loadMore(); return; }
    if (!suggestions.length || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setActiveIndex(current => {
      if (event.key === "Home") return 0;
      if (event.key === "End") return suggestions.length - 1;
      if (event.key === "ArrowDown") return Math.min(suggestions.length - 1, current + 1);
      return current < 0 ? suggestions.length - 1 : Math.max(0, current - 1);
    });
  };

  return (
    <Popover modal={false} open={open} onOpenChange={next => { if (!next) close(); }}>
      <PopoverAnchor asChild>
        <div ref={anchorRef} className="relative">
          <Input
            ref={inputRef}
            id={inputId}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={open}
            aria-controls={open ? listId : undefined}
            aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            aria-describedby={open ? hintId : undefined}
            value={query}
            onChange={event => {
              const nextQuery = event.target.value;
              queryRef.current = nextQuery;
              setQuery(nextQuery);
              onQueryChange?.(nextQuery);
              search(nextQuery);
            }}
            onFocus={() => { clearTimeout(blurTimeoutRef.current); if (!suppressFocusOpenRef.current && suggestions.length) setOpen(true); }}
            onBlur={() => {
              clearTimeout(blurTimeoutRef.current);
              blurTimeoutRef.current = setTimeout(() => {
                const focused = document.activeElement;
                if (focused !== inputRef.current && !contentRef.current?.contains(focused)) close();
              }, 0);
            }}
            onKeyDown={onKeyDown}
            placeholder={placeholder || "Zoek op straat, huisnummer, postcode of plaats"}
            className={className}
            autoComplete="off"
          />
          {loading && <LoaderCircle aria-hidden="true" className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
      </PopoverAnchor>
      <PopoverContent
        ref={contentRef}
        align="start"
        className="flex w-[var(--radix-popover-trigger-width)] max-w-[calc(100vw-1rem)] flex-col overflow-hidden p-0"
        style={{ maxHeight: "min(24rem, var(--radix-popover-content-available-height))" }}
        onOpenAutoFocus={event => event.preventDefault()}
        onCloseAutoFocus={event => event.preventDefault()}
        // A modal parent's document-level scroll lock cannot recognize this
        // portal as its own content. Keep native list scrolling local without
        // preventing it; the list's overscroll containment protects the page.
        onWheel={event => event.stopPropagation()}
        onTouchMove={event => event.stopPropagation()}
        onInteractOutside={event => { if (anchorRef.current?.contains(event.target)) event.preventDefault(); }}
        onEscapeKeyDown={event => {
          event.preventDefault();
          suppressFocusOpenRef.current = true;
          inputRef.current?.focus({ preventScroll: true });
          suppressFocusOpenRef.current = false;
          close();
        }}
      >
        <p id={hintId} className="sr-only">{error ? "Druk op Enter om opnieuw te proberen, of kies een eerder geladen adres met de pijltjestoetsen." : "Pijltjestoetsen om een adres te kiezen, Enter om te bevestigen. Page Down om meer adressen te laden."}</p>
        <div id={listId} role="listbox" aria-label="Gevonden adressen" aria-busy={loading || loadingMore} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" style={{ maxHeight: "18rem" }}>
          {suggestions.map((suggestion, index) => (
            <button
              ref={element => { optionRefs.current[index] = element; }}
              key={suggestionKey(suggestion)}
              id={`${listId}-${index}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={activeIndex === index}
              onMouseDown={event => event.preventDefault()}
              onClick={() => selectAddress(suggestion)}
              onMouseEnter={() => setActiveIndex(index)}
              className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent ${activeIndex === index ? "bg-accent" : ""}`}
            >
              <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{addressSuggestionLabel(suggestion)}</span>
            </button>
          ))}
        </div>
        {loading && <p role="status" className="px-3 py-3 text-sm text-muted-foreground">Adressen zoeken…</p>}
        {!loading && !error && !suggestions.length && <p role="status" className="px-3 py-3 text-sm text-muted-foreground">Geen adressen gevonden. Voeg een postcode of plaats toe, of controleer het huisnummer.</p>}
        {error && <div role="alert" className="border-t border-border p-3"><p className="flex items-start gap-2 text-xs text-destructive"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p><Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => fetchPage(query, errorOffset, ++requestRef.current)}>Opnieuw proberen</Button></div>}
        {suggestions.length > 0 && <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-3 py-2"><p role="status" className="text-xs text-muted-foreground">{suggestions.length}{total !== null ? ` van ${total}` : ""} adressen</p>{nextOffset !== null && <Button type="button" variant="ghost" size="sm" disabled={loadingMore} onClick={loadMore}>{loadingMore ? <><LoaderCircle className="h-4 w-4 animate-spin" />Laden…</> : "Meer adressen"}</Button>}</div>}
      </PopoverContent>
    </Popover>
  );
}
