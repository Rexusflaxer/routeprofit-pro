import React, { useEffect, useRef, useState } from "react";
import { LoaderCircle, MapPin } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { Input } from "@/components/ui/input";
import {
  addressPartsFromSuggestion,
  addressSuggestionLabel,
  formatAddress,
} from "@/lib/addressFormatting";

export default function AddressAutocomplete({ value = {}, onAddressSelect, placeholder, className = "" }) {
  const formattedAddress = formatAddress(value, { omitDefaultCountry: true });
  const [query, setQuery] = useState(formattedAddress);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestRef = useRef(0);
  const timeoutRef = useRef(null);

  useEffect(() => {
    setQuery(formattedAddress);
  }, [formattedAddress]);

  useEffect(() => () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    requestRef.current += 1;
  }, []);

  const search = (nextQuery) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (nextQuery.trim().length < 3) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      return;
    }

    timeoutRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await base44.functions.invoke("lookupService", { action: "search_address", query: nextQuery.trim() });
        if (requestRef.current !== requestId) return;
        const results = data?.suggestions || data?.results || [];
        setSuggestions(results.slice(0, 8));
        setOpen(results.length > 0);
      } catch {
        if (requestRef.current === requestId) {
          setSuggestions([]);
          setOpen(false);
        }
      } finally {
        if (requestRef.current === requestId) setLoading(false);
      }
    }, 300);
  };

  const selectAddress = (suggestion) => {
    const address = addressPartsFromSuggestion(suggestion, value);
    onAddressSelect?.(address);
    setQuery(formatAddress(address, { omitDefaultCountry: true }));
    setSuggestions([]);
    setOpen(false);
  };

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={event => {
          const nextQuery = event.target.value;
          setQuery(nextQuery);
          search(nextQuery);
        }}
        onFocus={() => suggestions.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder || "Zoek op straat, huisnummer, postcode of plaats"}
        className={className}
        autoComplete="off"
      />
      {loading && (
        <LoaderCircle className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
      )}
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border border-border bg-popover shadow-lg">
          {suggestions.map((suggestion, index) => (
            <button
              key={`${addressSuggestionLabel(suggestion)}-${index}`}
              type="button"
              onMouseDown={() => selectAddress(suggestion)}
              className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent"
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <span>{addressSuggestionLabel(suggestion)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
