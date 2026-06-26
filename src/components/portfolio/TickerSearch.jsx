import { useState, useEffect, useRef, useCallback } from "react";
import { searchTickers } from "@/api/stockSearch";
import { Search, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * TickerSearch
 * Props:
 *   value        - current symbol string
 *   onChange     - called with (symbol, { name, exchange, market })
 *   placeholder  - input placeholder text
 *   className    - extra classes for wrapper
 */
export default function TickerSearch({ value, onChange, placeholder = "Search symbol or company name...", className }) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef(null);
  const dropdownRef = useRef(null);
  const debounceRef = useRef(null);

  // Sync external value changes
  useEffect(() => {
    if (value !== query) setQuery(value || "");
  }, [value]);

  const doSearch = useCallback(async (q) => {
    if (!q || q.trim().length < 1) {
      setResults([]);
      setOpen(false);
      return;
    }
    setLoading(true);
    try {
      const found = await searchTickers(q);
      setResults(found);
      setOpen(found.length > 0);
      setHighlighted(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleInput = (e) => {
    const q = e.target.value;
    setQuery(q);
    // If user cleared the field, notify parent
    if (!q) {
      onChange("", {});
      setResults([]);
      setOpen(false);
      return;
    }
    // Debounce the search
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(q), 300);
  };

  const selectResult = (result) => {
    setQuery(result.symbol);
    setOpen(false);
    setResults([]);
    onChange(result.symbol, {
      name: result.name,
      exchange: result.exchange,
      market: result.market,
    });
  };

  const handleKeyDown = (e) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted(h => Math.min(h + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted(h => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (results[highlighted]) selectResult(results[highlighted]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        inputRef.current && !inputRef.current.contains(e.target)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          autoComplete="off"
          spellCheck={false}
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground animate-spin" />
        )}
      </div>

      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg max-h-72 overflow-y-auto"
        >
          {results.map((r, i) => (
            <button
              key={r.symbol}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); selectResult(r); }}
              onMouseEnter={() => setHighlighted(i)}
              className={cn(
                "w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left hover:bg-accent transition-colors",
                i === highlighted && "bg-accent"
              )}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex-shrink-0 w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                  <TrendingUp className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-foreground">{r.symbol}</div>
                  <div className="text-xs text-muted-foreground truncate max-w-48">{r.name}</div>
                </div>
              </div>
              <div className="flex-shrink-0 text-right">
                <span className={cn(
                  "inline-block text-xs px-1.5 py-0.5 rounded font-medium",
                  r.market === "CA"
                    ? "bg-red-100 text-red-700"
                    : "bg-blue-100 text-blue-700"
                )}>
                  {r.market === "CA" ? "🍁 CA" : "🇺🇸 US"}
                </span>
                <div className="text-xs text-muted-foreground mt-0.5">{r.exchange}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {open && results.length === 0 && !loading && query.length > 1 && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-border rounded-md shadow-lg px-3 py-3 text-sm text-muted-foreground">
          No results found for "{query}"
        </div>
      )}
    </div>
  );
}
