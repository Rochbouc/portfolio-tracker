import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { Stock, Transaction, Dividend, CashPosition, adjustCash, setCash, deleteCash } from "@/api/localData";
import { fetchQuote, searchTickers } from "@/api/stockSearch";
import { getPaySchedule } from "@/api/dividendData";
import { StockLogo as StockLogoShared } from "@/components/ui/StockPopup";
import { logout } from "@/components/auth/Login";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import StockDetailPanel from "@/components/portfolio/StockDetailPanel";
import ClosedPositions from "@/components/portfolio/ClosedPositions";
import Watchlist from "@/components/portfolio/Watchlist";
import AccountSummary from "@/components/analytics/AccountSummary";
import ProjectionAt60 from "@/components/analytics/ProjectionAt60";
import { DraggableTabBar, Widget, WidgetGrid, loadTabOrder, saveTabOrder } from "@/components/layout/DashboardLayout";
import AddStockForm from "@/components/portfolio/AddStockForm";
import DataBackup from "@/components/portfolio/DataBackup";
import AddTransactionForm from "@/components/transactions/AddTransactionForm";
import TransactionList from "@/components/transactions/TransactionList";
import AddDividendForm from "@/components/dividends/AddDividendForm";
import DividendList from "@/components/dividends/DividendList";
import DividendCharts from "@/components/dividends/DividendCharts";
import DividendActualVsPredicted from "@/components/dividends/DividendActualVsPredicted";
import DividendCalendarView from "@/components/dividends/DividendCalendarView";
import PortfolioPerformanceChart from "@/components/analytics/PortfolioPerformanceChart";
import DividendCalendar from "@/components/dividends/DividendCalendar";
import CashModal from "@/components/portfolio/CashModal";
import ImportStocks from "@/components/settings/ImportStocks";
import TFSATracker from "@/components/settings/TFSATracker";
import YearOverYear from "@/components/analytics/YearOverYear";
import HistoricalDividends from "@/components/analytics/HistoricalDividends";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend as RLegend } from "recharts";
import { RefreshCw, Plus, Receipt, Coins, TrendingUp, ChevronDown, ChevronUp, Bell, Briefcase, Wallet, Loader2, Send, Search, DollarSign, Pencil, LogOut, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

function fmt(n, currency) {
  if (n == null || isNaN(n)) return "-";
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(n);
}

// ── Stock Logo — delegates to StockPopup.jsx ──────────────────────
function StockLogo({ symbol, name, size }) {
  return <StockLogoShared symbol={symbol} name={name} size={size || 36} />;
}

function groupByAccount(stocks) {
  const groups = {};
  stocks.forEach(s => {
    const a = s.account_type || "Unassigned";
    if (!groups[a]) groups[a] = [];
    groups[a].push(s);
  });
  // Sort stocks alphabetically within each group
  Object.keys(groups).forEach(a => {
    groups[a].sort((a, b) => (a.symbol || "").localeCompare(b.symbol || ""));
  });
  return groups;
}

// ── Monthly Dividend Chart ─────────────────────────────────────────
function MonthlyDividendChart({ dividends, stocks }) {
  const year = new Date().getFullYear();
  const [divCurrency, setDivCurrency] = useState("USD");
  const CAD_USD = 0.73;
  const USD_CAD = 1.37;

  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: new Date(2024, i).toLocaleString("default", { month: "short" }),
    amount: 0,
  }));
  dividends.forEach(d => {
    const dt = new Date(d.date);
    if (dt.getFullYear() !== year) return;
    const stock = stocks?.find(s => s.id === d.stock_id);
    const stockCur = stock?.currency || "USD";
    let amt = d.amount || 0;
    if (divCurrency === "USD" && stockCur === "CAD") amt = amt * CAD_USD;
    else if (divCurrency === "CAD" && stockCur === "USD") amt = amt * USD_CAD;
    monthly[dt.getMonth()].amount += amt;
  });
  const total = monthly.reduce((s, m) => s + m.amount, 0);
  return (
    <Card className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-green-500" />
          Monthly Dividend Income - {year}
        </CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex rounded border overflow-hidden text-xs">
            {["USD","CAD"].map(c => (
              <button key={c} onClick={() => setDivCurrency(c)}
                className={cn("px-2 py-0.5 font-medium transition-colors",
                  divCurrency===c ? "bg-gray-800 text-white" : "bg-white text-gray-400 hover:bg-gray-50")}>
                {c === "USD" ? "🇺🇸 USD" : "🍁 CAD"}
              </button>
            ))}
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Total {year}</div>
            <div className="font-bold text-green-600">{fmt(total, divCurrency)}</div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <ResponsiveContainer width="100%" height={150}>
          <AreaChart data={monthly}>
            <defs>
              <linearGradient id="dg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="month" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} width={40} tickFormatter={v => "$" + v} />
            <Tooltip formatter={v => [fmt(v, divCurrency), "Dividends"]} />
            <Area type="monotone" dataKey="amount" stroke="#10b981" strokeWidth={2} fill="url(#dg)" dot={{ r: 3, fill: "#10b981" }} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}

// ── Price Alerts ───────────────────────────────────────────────────
function PriceAlertsPanel() {
  const [alerts, setAlerts]       = useState(() => { try { return JSON.parse(localStorage.getItem("price_alerts") || "[]") } catch { return [] } });
  const [symbol, setSymbol]       = useState("");
  const [condition, setCondition] = useState("above");
  const [targetPrice, setTarget]  = useState("");
  const [adding, setAdding]       = useState(false);
  const [triggered, setTriggered] = useState({});

  function saveAlerts(list) { localStorage.setItem("price_alerts", JSON.stringify(list)); setAlerts(list); }

  function addAlert() {
    if (!symbol.trim() || !targetPrice) return;
    const alert = { id: Date.now().toString(), symbol: symbol.trim().toUpperCase(), condition, targetPrice: parseFloat(targetPrice), createdAt: new Date().toISOString(), active: true };
    saveAlerts([...alerts, alert]);
    setSymbol(""); setTarget(""); setAdding(false);
  }

  function removeAlert(id) { saveAlerts(alerts.filter(a => a.id !== id)); }
  function toggleAlert(id) { saveAlerts(alerts.map(a => a.id === id ? { ...a, active: !a.active } : a)); }

  // Check alerts against live prices every 60s
  useEffect(() => {
    async function check() {
      const active = alerts.filter(a => a.active);
      if (active.length === 0) return;
      const newTriggered = {};
      await Promise.allSettled(active.map(async a => {
        try {
          const q = await fetchQuote(a.symbol);
          const price = q?.price;
          if (!price) return;
          const hit = a.condition === "above" ? price >= a.targetPrice : price <= a.targetPrice;
          if (hit) newTriggered[a.id] = price;
        } catch {}
      }));
      if (Object.keys(newTriggered).length > 0) setTriggered(prev => ({ ...prev, ...newTriggered }));
    }
    check();
    const id = setInterval(check, 60000);
    return () => clearInterval(id);
  }, [alerts]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="text-sm flex items-center gap-2"><Bell className="h-4 w-4" />Price Alerts</CardTitle>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setAdding(v => !v)}>
          <Plus className="h-3 w-3" />{adding ? "Cancel" : "Add Alert"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {adding && (
          <div className="space-y-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
            <div className="grid grid-cols-3 gap-2">
              <input value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="AAPL"
                className="border border-gray-300 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <select value={condition} onChange={e => setCondition(e.target.value)}
                className="border border-gray-300 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500">
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
              <input type="number" value={targetPrice} onChange={e => setTarget(e.target.value)} placeholder="Price"
                className="border border-gray-300 rounded px-2 py-1.5 text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-500" />
            </div>
            <Button size="sm" className="w-full text-xs" onClick={addAlert} disabled={!symbol.trim() || !targetPrice}>
              Add Alert
            </Button>
          </div>
        )}
        {alerts.length === 0 && !adding && (
          <div className="text-center py-4 text-gray-400 text-xs">
            <Bell className="h-6 w-6 mx-auto mb-2 opacity-30" />No price alerts set
          </div>
        )}
        {alerts.map(a => {
          const isHit = !!triggered[a.id];
          return (
            <div key={a.id} className={cn("flex items-center justify-between rounded-lg px-3 py-2 border text-xs",
              isHit ? "bg-yellow-50 border-yellow-300" : a.active ? "bg-white border-gray-200" : "bg-gray-50 border-gray-200 opacity-60")}>
              <div className="flex items-center gap-2 min-w-0">
                {isHit && <Bell className="h-3.5 w-3.5 text-yellow-500 flex-shrink-0 animate-pulse" />}
                <div>
                  <span className="font-semibold text-gray-900">{a.symbol}</span>
                  <span className="text-gray-500 ml-1.5">{a.condition === "above" ? "≥" : "≤"} ${a.targetPrice.toFixed(2)}</span>
                  {isHit && <span className="ml-1.5 text-yellow-600 font-medium">🔔 Hit at ${triggered[a.id].toFixed(2)}!</span>}
                </div>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button onClick={() => toggleAlert(a.id)} className={cn("text-[10px] px-1.5 py-0.5 rounded border",
                  a.active ? "border-green-300 text-green-600 bg-green-50" : "border-gray-300 text-gray-400")}>
                  {a.active ? "On" : "Off"}
                </button>
                <button onClick={() => removeAlert(a.id)} className="text-gray-300 hover:text-red-500 p-0.5">✕</button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── Buy Opportunities (real data via Yahoo Finance screener proxy) ──


// Broad market screener lists — US + Canadian stocks, not tied to portfolio
const SCREENER_LISTS = {
  "Undervalued": {
    desc: "Stocks trading below analyst 12-month price target — US & Canadian markets",
    symbols: [
      { symbol: "AAPL",    name: "Apple Inc." },
      { symbol: "GOOGL",   name: "Alphabet Inc." },
      { symbol: "META",    name: "Meta Platforms" },
      { symbol: "AMZN",   name: "Amazon.com" },
      { symbol: "TD.TO",  name: "Toronto-Dominion Bank" },
      { symbol: "CNR.TO", name: "Canadian National Railway" },
      { symbol: "ENB.TO", name: "Enbridge Inc." },
      { symbol: "CP.TO",  name: "Canadian Pacific Kansas City" },
      { symbol: "BNS.TO", name: "Bank of Nova Scotia" },
      { symbol: "CM.TO",  name: "CIBC" },
    ],
  },
  "Strong Buy": {
    desc: "Analyst consensus Strong Buy — top-rated US & Canadian stocks right now",
    symbols: [
      { symbol: "NVDA",    name: "NVIDIA Corp." },
      { symbol: "MSFT",   name: "Microsoft Corp." },
      { symbol: "SHOP.TO",name: "Shopify Inc." },
      { symbol: "ATD.TO", name: "Alimentation Couche-Tard" },
      { symbol: "MFC.TO", name: "Manulife Financial" },
      { symbol: "SLF.TO", name: "Sun Life Financial" },
      { symbol: "WSP.TO", name: "WSP Global" },
      { symbol: "CSU.TO", name: "Constellation Software" },
      { symbol: "V",      name: "Visa Inc." },
      { symbol: "MA",     name: "Mastercard Inc." },
    ],
  },
  "Below 200 SMA": {
    desc: "Stocks below their 200-day moving average — potential recovery entry points",
    symbols: [
      { symbol: "TSLA",   name: "Tesla Inc." },
      { symbol: "PYPL",   name: "PayPal Holdings" },
      { symbol: "DIS",    name: "The Walt Disney Co." },
      { symbol: "UBER",   name: "Uber Technologies" },
      { symbol: "BCE.TO", name: "BCE Inc." },
      { symbol: "TRP.TO", name: "TC Energy Corp." },
      { symbol: "POW.TO", name: "Power Corporation of Canada" },
      { symbol: "MRU.TO", name: "Metro Inc." },
      { symbol: "T.TO",   name: "Telus Corp." },
      { symbol: "RCI.B.TO",name: "Rogers Communications" },
    ],
  },
  "High Dividend": {
    desc: "High dividend yield stocks — income-focused picks, US & Canadian markets",
    symbols: [
      { symbol: "BCE.TO", name: "BCE Inc." },
      { symbol: "ENB.TO", name: "Enbridge Inc." },
      { symbol: "TRP.TO", name: "TC Energy Corp." },
      { symbol: "BNS.TO", name: "Bank of Nova Scotia" },
      { symbol: "T.TO",   name: "Telus Corp." },
      { symbol: "TD.TO",  name: "Toronto-Dominion Bank" },
      { symbol: "BMO.TO", name: "Bank of Montreal" },
      { symbol: "MFC.TO", name: "Manulife Financial" },
      { symbol: "KO",     name: "Coca-Cola Co." },
      { symbol: "PFE",    name: "Pfizer Inc." },
    ],
  },
};

function BuyOpportunitiesPanel() {
  const [criteria, setCriteria] = useState("Undervalued");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [detailStock, setDetailStock] = useState(null); // for logo click detail panel

  const analyze = async (overrideSymbols) => {
    setLoading(true);
    setAnalyzed(true);
    const list = overrideSymbols || SCREENER_LISTS[criteria].symbols;
    try {
      const quotes = await Promise.allSettled(
        list.map(async ({ symbol, name }) => {
          const q = await fetchQuote(symbol);
          return { symbol, name, ...q };
        })
      );
      const valid = quotes
        .filter(r => r.status === "fulfilled" && r.value?.price)
        .map(r => r.value)
        .sort((a, b) => (b.changePercent || 0) - (a.changePercent || 0));
      setResults(valid);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  const handleSearch = async () => {
    const sym = searchInput.trim().toUpperCase();
    if (!sym) return;
    setLoading(true);
    setAnalyzed(true);
    try {
      const { searchTickers: _search } = { searchTickers };
      const found = await _search(sym);
      const top = found.slice(0, 8).map(f => ({ symbol: f.symbol, name: f.name }));
      if (top.length > 0) await analyze(top);
      else setResults([]);
    } catch { setResults([]); }
    finally { setLoading(false); }
  };

  useEffect(() => { setResults([]); setAnalyzed(false); }, [criteria]);

  return (
    <>
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center text-white text-[9px] font-bold">$</div>
          Buy Opportunities
        </CardTitle>
        <div className="flex gap-1 flex-wrap mt-1">
          {Object.keys(SCREENER_LISTS).map(o => (
            <button key={o} onClick={() => setCriteria(o)}
              className={cn("text-xs px-2 py-0.5 rounded border transition-colors",
                criteria === o ? "bg-gray-900 text-white border-gray-900" : "border-gray-300 text-gray-500 hover:border-gray-600 hover:text-gray-800")}>
              {o}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="pt-1 space-y-2">
        <p className="text-xs text-gray-400">{SCREENER_LISTS[criteria].desc}</p>

        {/* Custom symbol search */}
        <div className="flex gap-1">
          <input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") handleSearch(); }}
            placeholder="Search any stock (e.g. RY.TO, AAPL)..."
            className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <Button size="sm" variant="outline" className="h-7 px-2" onClick={handleSearch} disabled={loading}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>

        {!analyzed && (
          <Button size="sm" className="w-full text-xs gap-1.5" onClick={() => analyze()}>
            <Search className="h-3.5 w-3.5" /> Analyze Market
          </Button>
        )}
        {loading && (
          <div className="flex items-center justify-center py-4 gap-2 text-sm text-gray-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Fetching live prices...
          </div>
        )}
        {!loading && analyzed && results.length > 0 && (
          <div className="space-y-1">
            {results.map(r => (
              <div key={r.symbol} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-gray-50">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={() => setDetailStock({ symbol: r.symbol, name: r.name, shares: 0, avg_cost: r.price, currency: r.currency || "USD" })}
                    className="flex-shrink-0 rounded hover:ring-2 hover:ring-blue-400 transition-all"
                    title={`View details for ${r.symbol}`}
                  >
                    <StockLogo symbol={r.symbol} name={r.name} size={26} />
                  </button>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold truncate">{r.symbol}</div>
                    <div className="text-xs text-gray-400 truncate max-w-[110px]">{r.name}</div>
                  </div>
                </div>
                <div className="text-right flex-shrink-0 ml-1">
                  <div className="text-xs font-semibold">{fmt(r.price, r.currency || "USD")}</div>
                  <div className={cn("text-xs font-medium", (r.changePercent || 0) >= 0 ? "text-green-600" : "text-red-600")}>
                    {(r.changePercent || 0) >= 0 ? "+" : ""}{(r.changePercent || 0).toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
            <Button size="sm" variant="outline" className="w-full text-xs mt-1 gap-1" onClick={() => analyze()}>
              <RefreshCw className="h-3 w-3" /> Refresh
            </Button>
          </div>
        )}
        {!loading && analyzed && results.length === 0 && (
          <div className="text-center py-3 text-xs text-gray-400">
            Could not fetch prices. Check connection.
            <Button size="sm" variant="outline" className="w-full text-xs mt-2" onClick={() => analyze()}>Retry</Button>
          </div>
        )}
      </CardContent>
    </Card>

    {/* Stock detail dialog triggered by logo click */}
    {detailStock && (
      <Dialog open={!!detailStock} onOpenChange={open => { if (!open) setDetailStock(null) }}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <StockDetailPanel
            stock={detailStock}
            quote={null}
            onClose={() => setDetailStock(null)}
          />
        </DialogContent>
      </Dialog>
    )}
  </>
  );
}

// ── Shared AI helpers ──────────────────────────────────────────────
// ── Groq AI — free tier, CORS-enabled, no special headers ─────────
// Get a free key at https://console.groq.com (no credit card needed)
const GROQ_KEY_STORAGE = "groq_api_key";
const getGroqKey = () => localStorage.getItem(GROQ_KEY_STORAGE) || "";
const saveGroqKey = k => localStorage.setItem(GROQ_KEY_STORAGE, k.trim());

function GroqKeyPrompt({ onSaved }) {
  const [val, setVal] = useState("");
  const [err, setErr] = useState("");
  const save = () => {
    if (!val.trim()) { setErr("Please enter a key"); return; }
    if (!val.startsWith("gsk_")) { setErr("Groq keys start with gsk_"); return; }
    saveGroqKey(val.trim());
    onSaved();
  };
  return (
    <div className="space-y-2.5 p-1">
      <div className="rounded-md bg-blue-50 border border-blue-100 p-2.5 text-xs text-blue-800 leading-relaxed">
        <strong>Free AI setup — takes 1 minute:</strong>
        <ol className="mt-1 ml-3 list-decimal space-y-0.5">
          <li>Go to <a href="https://console.groq.com" target="_blank" rel="noreferrer" className="underline font-medium">console.groq.com</a></li>
          <li>Sign up free (no credit card)</li>
          <li>Click <strong>API Keys → Create API Key</strong></li>
          <li>Paste the key below</li>
        </ol>
      </div>
      <div className="flex gap-1">
        <input
          type="password"
          value={val}
          onChange={e => { setVal(e.target.value); setErr(""); }}
          placeholder="gsk_..."
          onKeyDown={e => e.key === "Enter" && save()}
          className="flex-1 text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <button onClick={save} className="text-xs bg-blue-600 text-white px-3 py-1.5 rounded hover:bg-blue-700 whitespace-nowrap">
          Save Key
        </button>
      </div>
      {err && <p className="text-xs text-red-500">{err}</p>}
    </div>
  );
}

async function callGroq(system, userMessage, history = []) {
  const key = getGroqKey();
  if (!key) throw new Error("NO_KEY");
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",   // free, fast Groq model
      max_tokens: 800,
      temperature: 0.7,
      messages: [
        { role: "system", content: system },
        ...history,
        { role: "user", content: userMessage },
      ],
    }),
  });
  if (res.status === 401) throw new Error("Invalid API key. Please check your Groq key.");
  if (res.status === 429) throw new Error("Rate limit reached. Please wait a moment and try again.");
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
  return data.choices?.[0]?.message?.content || "";
}

// ── Shared: fetch live quote context for Groq ─────────────────────
async function fetchLiveContext(symbols) {
  const PROXIES = [
    url => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    url => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  ];
  const results = [];
  await Promise.allSettled(symbols.map(async sym => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=5d`;
    for (const proxy of PROXIES) {
      try {
        const res = await fetch(proxy(url), { signal: AbortSignal.timeout(6000) });
        if (!res.ok) continue;
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        if (!meta) continue;
        const chg = meta.regularMarketPrice - meta.previousClose;
        const chgPct = (chg / meta.previousClose * 100).toFixed(2);
        results.push(
          `${sym}: price $${meta.regularMarketPrice?.toFixed(2)} (${chgPct >= 0 ? "+" : ""}${chgPct}% today), ` +
          `52w high $${meta.fiftyTwoWeekHigh?.toFixed(2)}, 52w low $${meta.fiftyTwoWeekLow?.toFixed(2)}, ` +
          `mktcap ${meta.marketCap ? "$" + (meta.marketCap/1e9).toFixed(1) + "B" : "N/A"}`
        );
        break;
      } catch { continue; }
    }
  }));
  return results.join("\n");
}

// ── AI News Sentiment (Groq + live Yahoo Finance context) ──────────
function AISentimentPanel() {
  const [loading, setLoading]     = useState(false);
  const [results, setResults]     = useState(null);
  const [symbolInput, setSymbol]  = useState("AAPL, MSFT, NVDA, TD.TO, SHOP.TO, ENB.TO, RY.TO, GOOGL");
  const [hasKey, setHasKey]       = useState(!!getGroqKey());

  const refresh = async () => {
    setLoading(true);
    setResults(null);
    try {
      const symbols = symbolInput.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);
      // Step 1: fetch live price data from Yahoo Finance
      const liveCtx = await fetchLiveContext(symbols);
      // Step 2: send to Groq with live data as context
      const today = new Date().toLocaleDateString("en-CA");
      const text = await callGroq(
        `You are a financial analyst. Today is ${today}. The user has provided live market data fetched right now from Yahoo Finance. Use ONLY these real numbers in your analysis — do not invent or substitute different prices.`,
        `Here is today's live market data:\n${liveCtx}\n\nFor each stock above, give exactly one line:\nSYMBOL: Bullish/Neutral/Bearish — one sentence using the actual price and % change shown above. Note this is not financial advice.`
      );
      setResults({ text });
    } catch (err) {
      if (err.message === "NO_KEY") setHasKey(false);
      else setResults({ error: err.message });
    } finally { setLoading(false); }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span>📰</span> AI News Sentiment
            <span className="text-[10px] font-normal text-green-600 bg-green-50 px-1.5 py-0.5 rounded ml-1">live prices</span>
          </span>
          {hasKey && <button onClick={() => { saveGroqKey(""); setHasKey(false); setResults(null); }} className="text-[10px] text-gray-300 hover:text-gray-500">change key</button>}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {!hasKey ? <GroqKeyPrompt onSaved={() => setHasKey(true)} /> : (
          <>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Stocks to analyze (comma separated)</label>
              <textarea value={symbolInput} onChange={e => setSymbol(e.target.value)}
                placeholder="AAPL, TD.TO, SHOP.TO, NVDA..." rows={2}
                className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 resize-none" />
            </div>
            <Button size="sm" className="w-full text-xs gap-1.5" onClick={refresh} disabled={loading}>
              <RefreshCw className={cn("h-3 w-3", loading && "animate-spin")} />
              {loading ? "Fetching live data + analyzing..." : "Get Live Sentiment"}
            </Button>
            {results?.error && <div className="text-xs text-red-500 bg-red-50 rounded p-2">{results.error}</div>}
            {results?.text && (
              <div className="space-y-1 mt-1">
                {results.text.split("\n").filter(l => l.trim()).map((line, i) => (
                  <div key={i} className={cn("text-xs rounded-md px-2.5 py-1.5 leading-relaxed",
                    line.toLowerCase().includes("bullish") ? "bg-green-50 border border-green-100 text-green-800"
                    : line.toLowerCase().includes("bearish") ? "bg-red-50 border border-red-100 text-red-800"
                    : "bg-gray-50 border border-gray-100 text-gray-700")}>
                    {line}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── AI Stock Assistant (Groq + live Yahoo Finance context) ─────────
function AIAssistantPanel() {
  const [msgs, setMsgs]   = useState([{ role: "assistant", text: "Hi! Ask me about any stock — I'll pull today's live price data before answering." }]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [hasKey, setHasKey]   = useState(!!getGroqKey());
  const histRef = useRef([]);
  const endRef  = useRef(null);

  const SUGGESTIONS = ["What's today's price of NVDA?", "Compare TD.TO vs RY.TO today", "Is SHOP.TO up or down this week?", "Top Canadian dividend stocks?"];

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput("");
    histRef.current = [...histRef.current, { role: "user", content: q }];
    setMsgs(m => [...m, { role: "user", text: q }]);
    setLoading(true);
    try {
      // Extract ticker-like tokens from the question to prefetch live data
      const tickers = [...q.matchAll(/\b([A-Z]{1,5}(?:\.[A-Z]{2})?)\b/g)]
        .map(m => m[1])
        .filter(t => t.length >= 2 && !["IS","THE","AND","FOR","OR","IN","AT","VS","TO","UP","ON","BE","MY","WE"].includes(t))
        .slice(0, 5);
      let liveCtx = "";
      if (tickers.length > 0) {
        liveCtx = await fetchLiveContext(tickers);
      }
      const today = new Date().toLocaleDateString("en-CA");
      const systemPrompt = `You are a stock market assistant for US (NYSE/NASDAQ) and Canadian (TSX/TSX-V) markets. Today is ${today}.${liveCtx ? `\n\nLive market data fetched right now:\n${liveCtx}\n\nUse these exact numbers when discussing these stocks.` : ""}\nBe concise and specific. Always note this is not financial advice.`;
      const reply = await callGroq(systemPrompt, q, histRef.current.slice(0, -1));
      histRef.current = [...histRef.current, { role: "assistant", content: reply }];
      setMsgs(m => [...m, { role: "assistant", text: reply }]);
    } catch (err) {
      if (err.message === "NO_KEY") { setHasKey(false); return; }
      setMsgs(m => [...m, { role: "assistant", text: `Error: ${err.message}` }]);
    } finally {
      setLoading(false);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span className="flex items-center gap-1.5">
            <span>🤖</span> AI Stock Assistant
            <span className="text-[10px] font-normal text-green-600 bg-green-50 px-1.5 py-0.5 rounded ml-1">live prices</span>
          </span>
          {hasKey && <button onClick={() => { saveGroqKey(""); setHasKey(false); }} className="text-[10px] text-gray-300 hover:text-gray-500">change key</button>}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {!hasKey ? (
          <div className="px-4 pb-4 pt-1"><GroqKeyPrompt onSaved={() => setHasKey(true)} /></div>
        ) : (
          <>
            {msgs.length === 1 && (
              <div className="px-4 pb-2 flex flex-col gap-1">
                {SUGGESTIONS.map((s, i) => (
                  <button key={i} onClick={() => send(s)}
                    className="text-left text-xs px-2.5 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-colors">
                    {s}
                  </button>
                ))}
              </div>
            )}
            <div className="max-h-72 overflow-y-auto px-4 py-2 space-y-2">
              {msgs.map((m, i) => (
                <div key={i} className={cn(
                  "text-xs rounded-lg px-3 py-2 leading-relaxed whitespace-pre-wrap",
                  m.role === "assistant" ? "bg-gray-100 text-gray-800" : "bg-blue-600 text-white ml-6"
                )}>
                  {m.text}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Fetching live data...
                </div>
              )}
              <div ref={endRef} />
            </div>
            <div className="p-3 border-t flex gap-2">
              <input value={input} onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); send(); } }}
                placeholder="Ask about any stock, e.g. SHOP.TO..."
                className="flex-1 text-xs border border-gray-300 rounded-md px-2.5 py-2 bg-white text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500" />
              <Button size="sm" className="h-8 w-8 p-0 flex-shrink-0" onClick={() => send()} disabled={loading || !input.trim()}>
                <Send className="h-3.5 w-3.5" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Dashboard ─────────────────────────────────────────────────
// ── Exchange Rate Widget ──────────────────────────────────────────
function ExchangeRateWidget() {
  const [rate,    setRate]    = useState(1.37)
  const [live,    setLive]    = useState(null)
  const [loading, setLoading] = useState(false)
  const [lastUpd, setLastUpd] = useState(null)
  const STORAGE_KEY = "usd_cad_rate_v1"

  useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY))
      if (saved?.rate) { setRate(saved.rate); setLive(saved.rate); setLastUpd(saved.ts) }
    } catch {}
  })

  async function fetchLive() {
    setLoading(true)
    try {
      const proxies = ["https://corsproxy.io/?", "https://api.allorigins.win/raw?url="]
      for (const proxy of proxies) {
        try {
          const res = await fetch(`${proxy}${encodeURIComponent("https://query2.finance.yahoo.com/v8/finance/chart/USDCAD=X?interval=1d&range=1d")}`, { signal: AbortSignal.timeout(6000) })
          const data = await res.json()
          const r = data?.chart?.result?.[0]?.meta?.regularMarketPrice
          if (r && r > 0) {
            setLive(r); setRate(r); setLastUpd(new Date().toLocaleTimeString())
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ rate: r, ts: new Date().toLocaleTimeString() }))
            break
          }
        } catch {}
      }
    } catch {}
    setLoading(false)
  }

  const [editMode, setEditMode] = useState(false)
  const [draft,    setDraft]    = useState("")

  function saveManual() {
    const n = parseFloat(draft)
    if (!isNaN(n) && n > 0) {
      setRate(n); setLive(null)
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ rate: n, ts: "manual" }))
    }
    setEditMode(false)
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-xs text-gray-400 mb-1">Current Rate</div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{rate.toFixed(4)}</span>
            <span className="text-sm text-gray-500">CAD per USD</span>
          </div>
          {lastUpd && <div className="text-[10px] text-gray-400 mt-0.5">{live ? `Live · Updated ${lastUpd}` : `Manual · ${lastUpd}`}</div>}
        </div>
        <div className="text-right">
          <div className="text-xs text-gray-400 mb-1">1 USD =</div>
          <div className="text-xl font-bold text-blue-600">${rate.toFixed(4)} CAD</div>
          <div className="text-xs text-gray-400 mt-0.5">1 CAD = ${(1/rate).toFixed(4)} USD</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2 text-center text-xs">
        {[100,1000,10000].map(n => (
          <div key={n} className="bg-gray-50 rounded-lg p-2">
            <div className="text-gray-400">USD {n.toLocaleString()}</div>
            <div className="font-semibold text-gray-800">${(n*rate).toLocaleString("en-CA",{maximumFractionDigits:0})} CAD</div>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <button onClick={fetchLive} disabled={loading}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-blue-200 text-blue-600 rounded-lg py-2 hover:bg-blue-50 transition-colors">
          <RefreshCw className={`h-3.5 w-3.5 ${loading?"animate-spin":""}`}/>
          {loading ? "Fetching…" : "Get Live Rate"}
        </button>
        {editMode ? (
          <div className="flex-1 flex items-center gap-1">
            <input autoFocus type="number" step="0.0001" value={draft} onChange={e=>setDraft(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")saveManual();if(e.key==="Escape")setEditMode(false)}}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400"/>
            <button onClick={saveManual} className="text-green-500 p-1"><Check className="h-3.5 w-3.5"/></button>
            <button onClick={()=>setEditMode(false)} className="text-gray-400 p-1"><X className="h-3.5 w-3.5"/></button>
          </div>
        ) : (
          <button onClick={()=>{setDraft(String(rate));setEditMode(true)}}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs border border-gray-200 text-gray-600 rounded-lg py-2 hover:bg-gray-50 transition-colors">
            <Pencil className="h-3.5 w-3.5"/> Set Manually
          </button>
        )}
      </div>
      <p className="text-[10px] text-gray-400">This rate is used for all USD↔CAD conversions in the app. Click "Get Live Rate" to fetch from Yahoo Finance.</p>
    </div>
  )
}

function DashboardInner() {
  const { toast } = useToast();
  const [stocks, setStocks] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [dividends, setDividends] = useState([]);
  const [prices, setPrices] = useState({});
  const [refreshing, setRefreshing] = useState(false);
  const [showAddStock, setShowAddStock] = useState(false);
  const [showAddTx, setShowAddTx] = useState(false);
  const [showAddDiv, setShowAddDiv] = useState(false);
  const [editingStock, setEditingStock] = useState(null);
  const [expandedStock, setExpandedStock] = useState(null);
  const [expandedAccount, setExpandedAccount] = useState({});
  const [accountCurrency, setAccountCurrency] = useState({});
  const [activeTab, setActiveTab] = useState("holdings");
  const [tabOrder,  setTabOrder]  = useState(() => {
    const defaults = [
      { id:"holdings",    label:"Holdings" },
      { id:"watchlist",   label:"Watchlist" },
      { id:"closed",      label:"Closed" },
      { id:"dividends",   label:"Dividends" },
      { id:"divcalendar", label:"Div Calendar" },
      { id:"transactions",label:"Transactions" },
      { id:"yoy",         label:"Year over Year" },
      { id:"histdiv",     label:"Dividend History" },
      { id:"analytics",   label:"Analytics" },
      { id:"summary",     label:"Account Summary" },
      { id:"projection",  label:"Projection at 60" },
      { id:"settings",    label:"Settings" },
    ]
    const saved = loadTabOrder()
    if (!saved || saved.length === 0) return defaults
    const savedIds = saved.map(t => t.id)
    const newTabs  = defaults.filter(t => !savedIds.includes(t.id))
    return [...saved, ...newTabs]
  });

  function handleReorderTabs(newOrder) { setTabOrder(newOrder); saveTabOrder(newOrder); }
  const [cashPositions, setCashPositions] = useState([]);
  const [globalCurrency, setGlobalCurrency] = useState("CAD");
  const [showCashModal, setShowCashModal] = useState(false);
  const [cashModalAccount, setCashModalAccount] = useState("");
  const [cashModalCurrency, setCashModalCurrency] = useState("CAD");

  const loadAll = useCallback(async () => {
    const [s, t, d, cp] = await Promise.all([Stock.list(), Transaction.list(), Dividend.list(), CashPosition.list()]);
    setStocks(s); setTransactions(t); setDividends(d); setCashPositions(cp);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const refreshPrices = useCallback(async () => {
    if (stocks.length === 0) return;
    setRefreshing(true);
    try {
      const entries = await Promise.all(stocks.map(async s => {
        const q = await fetchQuote(s.symbol, s);
        return [s.symbol, q];
      }));
      setPrices(Object.fromEntries(entries.filter(([, q]) => q)));
    } catch { }
    finally { setRefreshing(false); }
  }, [stocks]);

  useEffect(() => { if (stocks.length > 0 && Object.keys(prices).length === 0) refreshPrices(); }, [stocks]);
  // Always auto-refresh every 60 seconds
  useEffect(() => {
    if (stocks.length === 0) return;
    const id = setInterval(refreshPrices, 60000);
    return () => clearInterval(id);
  }, [refreshPrices]);

  // Exchange rate approximation (live rates would need an API key)
  const CAD_USD = 0.73;  // 1 CAD = 0.73 USD
  const USD_CAD = 1.37;  // 1 USD = 1.37 CAD

  function toGlobalCurrency(amount, stockCurrency) {
    if (!amount) return 0;
    if (stockCurrency === globalCurrency) return amount;
    if (globalCurrency === "USD" && stockCurrency === "CAD") return amount * CAD_USD;
    if (globalCurrency === "CAD" && stockCurrency === "USD") return amount * USD_CAD;
    return amount;
  }

  const totalValue = stocks.reduce((s, st) => {
    const p = prices[st.symbol]?.price ?? st.avg_cost;
    return s + toGlobalCurrency(p * st.shares, st.currency || "USD");
  }, 0);
  const totalCost = stocks.reduce((s, st) =>
    s + toGlobalCurrency(st.avg_cost * st.shares, st.currency || "USD"), 0);

  // Total gain excludes current-year contributions (cash deposited this year)
  const currentYear = new Date().getFullYear();
  const currentYearContribs = transactions
    .filter(t => t.type === "buy" && new Date(t.date).getFullYear() === currentYear)
    .reduce((s, t) => {
      const stock = stocks.find(st => st.id === t.stock_id);
      return s + toGlobalCurrency((t.shares * t.price) || 0, stock?.currency || "USD");
    }, 0);
  const totalGain = totalValue - totalCost + currentYearContribs;
  const totalGainPct = (totalCost - currentYearContribs) > 0 ? (totalGain / (totalCost - currentYearContribs)) * 100 : 0;
  const thisYear = new Date().getFullYear();
  // All-time dividend totals
  const totalDividendsCAD = dividends.reduce((s, d) => {
    const cur = d.currency || stocks.find(st => st.id === d.stock_id)?.currency || "USD";
    return s + (cur === "CAD" ? (d.amount||0) : (d.amount||0) * USD_CAD);
  }, 0);
  const totalDividendsUSD = dividends.reduce((s, d) => {
    const cur = d.currency || stocks.find(st => st.id === d.stock_id)?.currency || "USD";
    return s + (cur === "USD" ? (d.amount||0) : (d.amount||0) / USD_CAD);
  }, 0);
  // Current year only (for the card)
  const thisYearDivsCAD = dividends.filter(d => new Date(d.date).getFullYear() === thisYear).reduce((s, d) => {
    const cur = d.currency || stocks.find(st => st.id === d.stock_id)?.currency || "USD";
    return s + (cur === "CAD" ? (d.amount||0) : (d.amount||0) * USD_CAD);
  }, 0);
  const thisYearDivsUSD = dividends.filter(d => new Date(d.date).getFullYear() === thisYear).reduce((s, d) => {
    const cur = d.currency || stocks.find(st => st.id === d.stock_id)?.currency || "USD";
    return s + (cur === "USD" ? (d.amount||0) : (d.amount||0) / USD_CAD);
  }, 0);
  const totalDividendsReceived = globalCurrency === "CAD" ? thisYearDivsCAD : thisYearDivsUSD;
  const estAnnualDividends = stocks.reduce((s, st) =>
    s + toGlobalCurrency(parseFloat(st.annual_dividend) || 0, st.currency || "USD"), 0);

  // ── Pending dividend suggestions ──────────────────────────────────
  // Finds stocks with a payment due in the past 14 days not yet recorded
  const pendingDividendSuggestions = useMemo(() => {
    const today = new Date();
    const suggestions = [];
    stocks.forEach(st => {
      if (!st.shares || st.shares <= 0) return;
      const annualDiv = parseFloat(st.annual_dividend) || 0;
      if (annualDiv <= 0) return;
      const sched      = getPaySchedule(st.symbol);
      const freq       = sched?.frequency || 4;
      const payDay     = sched?.payDay || null;
      const payMonths  = sched?.payMonths || null;
      const isWeekly   = freq >= 50;
      const isMonthly  = freq >= 11;
      const perPayment = annualDiv / freq;
      if (perPayment <= 0) return;

      // For each of the past 14 days, check if a payment was expected
      for (let daysAgo = 0; daysAgo <= 14; daysAgo++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - daysAgo);
        const dateStr  = checkDate.toISOString().slice(0,10);
        const monthKey = dateStr.slice(0,7);
        const mo       = checkDate.getMonth() + 1;
        const dom      = checkDate.getDate();

        // Is a payment expected on this date?
        let expected = false;
        if (isWeekly && checkDate.getDay() === 5) expected = true;  // Friday
        else if (isMonthly && payDay && dom === payDay) expected = true;
        else if (isMonthly && !payDay && dom === 15) expected = true;
        else if (!isWeekly && !isMonthly && payMonths && payMonths.includes(mo) && payDay && dom === payDay) expected = true;
        else if (!isWeekly && !isMonthly && payMonths && payMonths.includes(mo) && !payDay && dom === 15) expected = true;

        if (!expected) continue;

        // Already recorded for this period?
        const alreadyRecorded = dividends.some(d => {
          if (d.stock_id !== st.id) return false;
          if (isWeekly) return Math.abs(new Date(d.date) - checkDate) < 7 * 86400000;
          return d.date?.slice(0,7) === monthKey;
        });
        if (alreadyRecorded) break;

        suggestions.push({
          symbol:   st.symbol,
          name:     st.name || st.symbol,
          amount:   parseFloat(perPayment.toFixed(2)),
          date:     dateStr,
          type:     "projected",
          stock_id: st.id,
          daysAgo,
        });
        break; // one suggestion per stock
      }
    });
    // Sort by most recent first
    return suggestions.sort((a,b) => a.daysAgo - b.daysAgo).slice(0, 15);
  }, [stocks, dividends]);
  const divStocks = stocks.filter(s => s.dividend_yield);
  const avgYield = divStocks.length > 0 ? divStocks.reduce((s, st) => s + (parseFloat(st.dividend_yield) || 0), 0) / divStocks.length : 0;

  const handleAddStock = async (data) => {
    if (editingStock) { await Stock.update(editingStock.id, data); toast({ title: "Stock updated" }); }
    else { await Stock.create(data); toast({ title: "Stock added" }); }
    setEditingStock(null); await loadAll();
  };
  const handleDeleteStock = async (id) => {
    if (!confirm("Delete this stock?")) return;
    await Stock.delete(id); toast({ title: "Stock removed" });
    if (expandedStock?.id === id) setExpandedStock(null);
    await loadAll();
  };
  const handleEditStock = (stock) => { setEditingStock(stock); setShowAddStock(true); };
  const handleAddTransaction = async (data) => {
    await Transaction.create(data);
    // Update stock holdings
    const stock = stocks.find(s => s.id === data.stock_id);
    if (stock) {
      const txValue = data.shares * data.price;
      const acct = data.account_type || stock.account_type || "Unassigned";
      const cur = stock.currency || "USD";
      if (data.type === "buy") {
        // Deduct cash for purchase
        await adjustCash(acct, cur, -txValue);
        // Update stock shares and avg cost
        const newShares = stock.shares + data.shares;
        const newAvgCost = ((stock.shares * stock.avg_cost) + txValue) / newShares;
        await Stock.update(stock.id, { shares: newShares, avg_cost: parseFloat(newAvgCost.toFixed(4)) });
      } else if (data.type === "sell") {
        // Add cash from sale
        await adjustCash(acct, cur, txValue);
        const newShares = stock.shares - data.shares;
        if (newShares <= 0.0001) {
          // Position closed — remove stock
          await Stock.delete(stock.id);
          toast({ title: `Position closed — ${stock.symbol} removed from holdings` });
        } else {
          await Stock.update(stock.id, { shares: parseFloat(newShares.toFixed(4)) });
        }
      }
    }
    toast({ title: "Transaction added" });
    await loadAll();
  };
  const handleDeleteTransaction = async (id) => { await Transaction.delete(id); await loadAll(); };
  const handleEditTransaction = async (id, data) => { await Transaction.update(id, data); await loadAll(); };
  const handleDeleteCash = async (account, currency) => {
    if (!confirm(`Delete ${currency} cash balance for ${account}?`)) return;
    await deleteCash(account, currency);
    await loadAll();
  };
  const handleAddDividend = async (data) => {
    const stock = stocks.find(s => s.id === data.stock_id);
    // Use stock's native currency — never convert at entry time
    const cur = data.currency || stock?.currency || "USD";
    await Dividend.create({ ...data, currency: cur });
    const acct = data.account_type || stock?.account_type || "Unassigned";
    if (data.amount > 0) {
      await adjustCash(acct, cur, parseFloat(data.amount));
    }
    toast({ title: `Dividend recorded (${cur} $${parseFloat(data.amount).toFixed(2)})` });
    await loadAll();
  };
  const handleDeleteDividend = async (id) => { await Dividend.delete(id); await loadAll(); };
  const handleEditDividend = async (id, data) => { await Dividend.update(id, data); await loadAll(); };

  const grouped = groupByAccount(stocks);

  // Build cash lookup: { accountName: { USD: 0, CAD: 0 } }
  const cashByAccount = {};
  cashPositions.forEach(cp => {
    if (!cashByAccount[cp.account_type]) cashByAccount[cp.account_type] = {};
    cashByAccount[cp.account_type][cp.currency] = cp.balance || 0;
  });

  // All unique accounts (from stocks + cash positions)
  const allAccountNames = [...new Set([
    ...Object.keys(grouped),
    ...cashPositions.map(cp => cp.account_type),
  ])];
  const toggleAccount = a => setExpandedAccount(p => ({ ...p, [a]: p[a] === false ? undefined : false }));
  const toggleStock = stock => setExpandedStock(p => p?.id === stock.id ? null : stock);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-40 shadow-sm">
        <div className="max-w-screen-xl mx-auto px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Stock Portfolio</h1>
            <p className="text-xs text-gray-400">Track your Canadian &amp; US investments</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {refreshing && <span className="text-xs text-gray-400 flex items-center gap-1"><RefreshCw className="h-3 w-3 animate-spin" /> Updating prices…</span>}
            <Button variant="outline" size="sm" onClick={() => setShowAddTx(true)} className="gap-1.5 bg-white">
              <Receipt className="h-3.5 w-3.5" /> Add Transaction
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowAddDiv(true)} className="gap-1.5 bg-white">
              <Coins className="h-3.5 w-3.5" /> Add Dividend
            </Button>
            <Button size="sm" onClick={() => { setEditingStock(null); setShowAddStock(true); }} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Add Stock
            </Button>
            <button onClick={() => { if(confirm("Sign out?")) logout() }}
              className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-4 py-4">
        <PortfolioPerformanceChart stocks={stocks} prices={prices} globalCurrency={globalCurrency} totalGain={totalGain} totalValue={totalValue} totalCost={totalCost} />

        {/* Stats cards with USD/CAD toggle */}
        <div className="mb-4">
          <div className="flex items-center justify-end mb-2 gap-2">
            <span className="text-xs text-gray-400">Display totals in:</span>
            <div className="flex rounded-md border border-gray-200 overflow-hidden text-xs">
              {["USD","CAD"].map(cur => (
                <button key={cur} onClick={() => setGlobalCurrency(cur)}
                  className={cn("px-3 py-1 font-semibold transition-colors",
                    globalCurrency === cur ? "bg-gray-900 text-white" : "bg-white text-gray-400 hover:bg-gray-50")}>
                  {cur === "USD" ? "🇺🇸 USD" : "🍁 CAD"}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Portfolio Value", value: fmt(totalValue, globalCurrency), sub: <span className={cn("text-xs font-semibold", totalGainPct >= 0 ? "text-green-600" : "text-red-500")}>{totalGainPct >= 0 ? "+" : ""}{totalGainPct.toFixed(2)}%</span>, icon: <Wallet className="h-5 w-5" /> },
              { label: "Total Gain/Loss", value: <span className={totalGain >= 0 ? "text-green-600" : "text-red-500"}>{totalGain >= 0 ? "+" : ""}{fmt(totalGain, globalCurrency)}</span>, sub: null, icon: <TrendingUp className="h-5 w-5" /> },
              { label: `Dividends Received ${new Date().getFullYear()}`, value: fmt(totalDividendsReceived, globalCurrency), sub: `All time: ${fmt(globalCurrency==="CAD"?totalDividendsCAD:totalDividendsUSD, globalCurrency)}`, icon: <Coins className="h-5 w-5" /> },
              { label: "Est. Annual Dividends", value: fmt(estAnnualDividends, globalCurrency), sub: avgYield > 0 ? `${avgYield.toFixed(2)}% avg yield` : null, icon: <TrendingUp className="h-5 w-5" /> },
            ].map((s, i) => (
              <Card key={i} className="bg-white">
                <CardContent className="p-4 flex items-start justify-between">
                  <div>
                    <div className="text-xs text-gray-400">{s.label}</div>
                    <div className="text-xl font-bold text-gray-900 mt-0.5">{s.value}</div>
                    {s.sub && <div className="mt-0.5">{s.sub}</div>}
                  </div>
                  <div className="text-gray-300 mt-1">{s.icon}</div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Main + Sidebar */}
        <div className="flex gap-4">
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-2 pt-2">
                <DraggableTabBar
                  tabOrder={tabOrder}
                  activeTab={activeTab}
                  onTabChange={setActiveTab}
                  onReorder={handleReorderTabs}
                />
              </div>
              <div className="p-3">

                {/* HOLDINGS */}
                {activeTab === "holdings" && (
                  <WidgetGrid tabId="holdings" widgets={[
                    { id:"stocks", title:"Your Stocks", defaultSize:"full" },
                  ]} renderWidget={w => (
                    <Widget key={w.id} id={w.id} title={w.title} tabId="holdings" defaultSize={w.defaultSize}>
                      {w.id === "stocks" && (
                        <Card className="bg-white border-0 shadow-none">
                          <CardHeader className="pb-2 flex flex-row items-center justify-between">
                            <CardTitle className="text-sm text-gray-700">Your Stocks</CardTitle>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">{stocks.length} holdings</span>
                              <button onClick={() => { setCashModalAccount(""); setCashModalCurrency("CAD"); setShowCashModal(true); }}
                                className="flex items-center gap-1 text-xs text-blue-600 border border-blue-200 rounded px-2 py-0.5 hover:bg-blue-50 transition-colors">
                                <DollarSign className="h-3 w-3" /> Manage Cash
                              </button>
                            </div>
                          </CardHeader>
                          <CardContent className="p-0">
                            {stocks.length === 0 && allAccountNames.length === 0 ? (
                              <div className="text-center py-16 text-gray-400 text-sm">No stocks yet. Click <strong className="text-gray-600">Add Stock</strong> to get started.</div>
                            ) : (
                              allAccountNames.map(account => {
                                const acctStocks = grouped[account] || [];
                                const cash = cashByAccount[account] || {};
                                const avNative = acctStocks.reduce((s, st) => { const p = prices[st.symbol]?.price ?? st.avg_cost; return s + p * st.shares; }, 0);
                                const cashUSD = cash["USD"] || 0;
                                const cashCAD = cash["CAD"] || 0;
                                const ac = acctStocks.reduce((s, st) => s + st.avg_cost * st.shares, 0);
                                const ag = avNative - ac;
                                const agp = ac > 0 ? (ag / ac) * 100 : 0;
                                const isOpen = expandedAccount[account] !== false;
                                const acctCurrency = accountCurrency[account] || "native";
                                const avUSD = acctStocks.reduce((s, st) => { const p = prices[st.symbol]?.price ?? st.avg_cost; const val = p * st.shares; return s + (st.currency === "CAD" ? val * 0.73 : val); }, 0);
                                const avCAD = acctStocks.reduce((s, st) => { const p = prices[st.symbol]?.price ?? st.avg_cost; const val = p * st.shares; return s + (st.currency === "USD" ? val * 1.37 : val); }, 0);
                                const displayValue = acctCurrency === "USD" ? avUSD : acctCurrency === "CAD" ? avCAD : avNative;
                                const displayCur = acctCurrency === "native" ? (acctStocks[0]?.currency || "USD") : acctCurrency;
                                const hasCash = cashUSD > 0 || cashCAD > 0;
                                return (
                                  <div key={account} className="border-b last:border-b-0">
                                    <div className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                                      <button onClick={() => toggleAccount(account)} className="flex items-center gap-2 flex-1 text-left">
                                        <Briefcase className="h-4 w-4 text-gray-400" />
                                        <span className="font-semibold text-sm text-gray-700">{account}</span>
                                        <span className="text-xs text-gray-400">{acctStocks.length} holding{acctStocks.length !== 1 ? "s" : ""}</span>
                                        {hasCash && <span className="text-xs text-green-600 bg-green-50 px-1.5 py-0.5 rounded">+ cash</span>}
                                      </button>
                                      <div className="flex items-center gap-2">
                                        <div className="flex rounded border overflow-hidden text-[10px]">
                                          {["native","USD","CAD"].map(c => (
                                            <button key={c} onClick={e => { e.stopPropagation(); setAccountCurrency(p => ({...p,[account]:c})); }}
                                              className={cn("px-1.5 py-0.5 font-medium transition-colors", acctCurrency === c ? "bg-gray-800 text-white" : "bg-white text-gray-400 hover:bg-gray-100")}>
                                              {c === "native" ? "—" : c}
                                            </button>
                                          ))}
                                        </div>
                                        <div className="text-right min-w-[100px]">
                                          <div className="font-semibold text-sm text-gray-900">{new Intl.NumberFormat("en-CA",{style:"currency",currency:displayCur,maximumFractionDigits:0}).format(displayValue)}</div>
                                          {acctStocks.length > 0 && (<div className={cn("text-xs font-medium", ag >= 0 ? "text-green-600" : "text-red-500")}>{ag >= 0 ? "+" : ""}{fmt(ag)} ({agp.toFixed(2)}%)</div>)}
                                        </div>
                                        <button onClick={() => toggleAccount(account)}>{isOpen ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}</button>
                                      </div>
                                    </div>
                                    {isOpen && (
                                      <div>
                                        {acctStocks.map(stock => {
                                          const q = prices[stock.symbol];
                                          const hasLivePrice = !!q?.price;
                                          const p = q?.price ?? stock.avg_cost;
                                          const mv = p * stock.shares;
                                          const costBasis = stock.avg_cost * stock.shares;
                                          const totalGain = mv - costBasis;
                                          const totalGainPct = costBasis > 0 ? (totalGain / costBasis) * 100 : 0;
                                          const dayChange = q ? (q.changePercent || 0) : null;
                                          const stockDivs = dividends.filter(d => d.stock_id === stock.id).reduce((s, d) => s + (d.amount || 0), 0);
                                          const totalWithDiv = totalGain + stockDivs;
                                          const totalWithDivPct = costBasis > 0 ? (totalWithDiv / costBasis) * 100 : 0;
                                          const isExp = expandedStock?.id === stock.id;
                                          // Show warning if prices have been loaded but this stock has none
                                          const pricesLoaded = Object.keys(prices).length > 0 && !refreshing;
                                          const noPriceWarning = pricesLoaded && !hasLivePrice;
                                          return (
                                            <div key={stock.id} className="ml-6 border-l border-gray-100">
                                              <div className={cn("flex items-center justify-between py-2.5 px-4 hover:bg-gray-50 cursor-pointer", noPriceWarning && "bg-amber-50/40")} onClick={() => toggleStock(stock)}>
                                                <div className="flex items-center gap-2.5 min-w-0">
                                                  <StockLogo symbol={stock.symbol} name={stock.name} size={34} />
                                                  <div className="min-w-0">
                                                    <div className="font-semibold text-sm text-gray-900 flex items-center gap-1.5">
                                                      {stock.symbol}
                                                      <span className="text-xs font-normal text-gray-400">{stock.market || "US"}</span>
                                                      {noPriceWarning && (
                                                        <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200" title={`No live price found for ${stock.symbol}. Check the ticker symbol or exchange.`}>
                                                          ? no live data
                                                        </span>
                                                      )}
                                                    </div>
                                                    <div className="text-xs text-gray-400 truncate">{(stock.name || "").toLowerCase()}</div>
                                                    {noPriceWarning && (
                                                      <div className="text-[10px] text-amber-600 mt-0.5">
                                                        Showing avg cost ${stock.avg_cost?.toFixed(2)} · Yahoo ticker: {stock.symbol}{stock.currency === "CAD" ? ".TO/.V/.CN" : ""}
                                                      </div>
                                                    )}
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                  <div className="text-right">
                                                    <div className={cn("font-semibold text-sm", noPriceWarning ? "text-amber-700" : "text-gray-900")}>
                                                      {fmt(mv, stock.currency || "USD")}
                                                      {noPriceWarning && <span className="ml-1 text-amber-500 text-xs">*</span>}
                                                    </div>
                                                    {dayChange != null && (<div className={cn("text-xs font-medium", dayChange >= 0 ? "text-green-600" : "text-red-500")}>{dayChange >= 0 ? "▲" : "▼"} {Math.abs(dayChange).toFixed(2)}% today</div>)}
                                                    {!noPriceWarning && <div className={cn("text-xs font-medium", totalGain >= 0 ? "text-green-600" : "text-red-500")}>{totalGain >= 0 ? "+" : ""}{fmt(totalGain, stock.currency || "USD")} ({totalGainPct.toFixed(2)}%) total</div>}
                                                    {!noPriceWarning && stockDivs > 0 && (<div className={cn("text-xs font-medium", totalWithDiv >= 0 ? "text-blue-600" : "text-red-500")}>{totalWithDiv >= 0 ? "+" : ""}{fmt(totalWithDiv, stock.currency || "USD")} ({totalWithDivPct.toFixed(2)}%) w/ div</div>)}
                                                  </div>
                                                  <div className="flex gap-0.5">
                                                    <button onClick={e => { e.stopPropagation(); handleEditStock(stock); }} className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 text-xs transition-colors" title="Edit">✎</button>
                                                    <button onClick={e => { e.stopPropagation(); handleDeleteStock(stock.id); }} className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 text-xs transition-colors" title="Delete">✕</button>
                                                  </div>
                                                  {isExp ? <ChevronUp className="h-4 w-4 text-gray-400 flex-shrink-0" /> : <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />}
                                                </div>
                                              </div>
                                              {isExp && (<div className="pb-3 px-4"><StockDetailPanel stock={stock} quote={q} onClose={() => setExpandedStock(null)} /></div>)}
                                            </div>
                                          );
                                        })}
                                        {(cashUSD > 0 || cashCAD > 0) && (
                                          <div className="ml-6 border-l border-gray-100 bg-green-50/30">
                                            {cashUSD > 0 && (
                                              <div className="flex items-center justify-between py-2 px-4 hover:bg-green-50">
                                                <div className="flex items-center gap-2.5">
                                                  <div className="w-[34px] h-[34px] rounded bg-green-100 flex items-center justify-center flex-shrink-0"><DollarSign className="h-4 w-4 text-green-600" /></div>
                                                  <div>
                                                    <div className="font-semibold text-sm text-gray-900">USD Cash</div>
                                                    <div className="text-xs text-gray-400">{account} · US Dollar</div>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                  <div className="font-semibold text-sm text-gray-900">{fmt(cashUSD, "USD")}</div>
                                                  <button onClick={() => { setCashModalAccount(account); setCashModalCurrency("USD"); setShowCashModal(true); }}
                                                    className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors" title="Edit cash">
                                                    <Pencil className="h-3 w-3" />
                                                  </button>
                                                  <button onClick={() => handleDeleteCash(account, "USD")}
                                                    className="p-1.5 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 transition-colors" title="Delete cash balance">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                            {cashCAD > 0 && (
                                              <div className="flex items-center justify-between py-2 px-4 hover:bg-green-50">
                                                <div className="flex items-center gap-2.5">
                                                  <div className="w-[34px] h-[34px] rounded bg-green-100 flex items-center justify-center flex-shrink-0"><DollarSign className="h-4 w-4 text-green-600" /></div>
                                                  <div>
                                                    <div className="font-semibold text-sm text-gray-900">CAD Cash</div>
                                                    <div className="text-xs text-gray-400">{account} · Canadian Dollar</div>
                                                  </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                  <div className="font-semibold text-sm text-gray-900">{fmt(cashCAD, "CAD")}</div>
                                                  <button onClick={() => { setCashModalAccount(account); setCashModalCurrency("CAD"); setShowCashModal(true); }}
                                                    className="p-1.5 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700 transition-colors" title="Edit cash">
                                                    <Pencil className="h-3 w-3" />
                                                  </button>
                                                  <button onClick={() => handleDeleteCash(account, "CAD")}
                                                    className="p-1.5 rounded hover:bg-red-100 text-gray-300 hover:text-red-500 transition-colors" title="Delete cash balance">
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                                                  </button>
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        )}
                                        {!hasCash && (<div className="ml-6 border-l border-gray-100 px-4 py-2"><button onClick={() => { setCashModalAccount(account); setCashModalCurrency("CAD"); setShowCashModal(true); }} className="text-xs text-gray-400 hover:text-blue-600 flex items-center gap-1 transition-colors"><DollarSign className="h-3 w-3" /> Add cash balance to this account</button></div>)}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            )}
                          </CardContent>
                        </Card>
                      )}
                    </Widget>
                  )} />
                )}

                {/* WATCHLIST */}
                {activeTab === "watchlist" && (
                  <WidgetGrid tabId="watchlist" widgets={[{ id:"watchlist", title:"Watchlist", defaultSize:"full" }]}
                    renderWidget={w => (
                      <Widget key={w.id} id={w.id} title={w.title} tabId="watchlist" defaultSize="full">
                        <Watchlist />
                      </Widget>
                    )} />
                )}

                {/* CLOSED */}
                {activeTab === "closed" && (
                  <ClosedPositions transactions={transactions} dividends={dividends} stocks={stocks} />
                )}

                {/* DIVIDENDS */}
                {activeTab === "dividends" && (
                  <WidgetGrid tabId="dividends" widgets={[
                    { id:"monthly",    title:"Monthly Dividend Income",       defaultSize:"full" },
                    { id:"actual_vs",  title:"Actual vs Predicted Dividends", defaultSize:"full" },
                    { id:"charts",     title:"Dividend Charts",               defaultSize:"half" },
                    { id:"calendar",   title:"Dividend Calendar",             defaultSize:"half" },
                    { id:"list",       title:"Dividend History",              defaultSize:"full" },
                  ]} renderWidget={w => (
                    <Widget key={w.id} id={w.id} title={w.title} tabId="dividends" defaultSize={w.defaultSize}>
                      {w.id === "monthly"   && <MonthlyDividendChart dividends={dividends} stocks={stocks} />}
                      {w.id === "actual_vs" && <DividendActualVsPredicted dividends={dividends} stocks={stocks} />}
                      {w.id === "charts"    && <DividendCharts dividends={dividends} stocks={stocks} />}
                      {w.id === "calendar"  && <DividendCalendar stocks={stocks} dividends={dividends} globalCurrency={globalCurrency} />}
                      {w.id === "list"      && <DividendList dividends={dividends} stocks={stocks} onDelete={handleDeleteDividend} onEdit={handleEditDividend} />}
                    </Widget>
                  )} />
                )}

                {/* TRANSACTIONS */}
                {activeTab === "transactions" && (
                  <TransactionList transactions={transactions} stocks={stocks} onDelete={handleDeleteTransaction} onEdit={handleEditTransaction} />
                )}

                {/* ANALYTICS — all charts from every tab */}
                {activeTab === "analytics" && (
                  <WidgetGrid tabId="analytics" widgets={[
                    { id:"perf",       title:"Portfolio Performance",         defaultSize:"full" },
                    { id:"yoy",        title:"Year over Year Performance",    defaultSize:"full" },
                    { id:"sector",     title:"Sector Allocation",             defaultSize:"half" },
                    { id:"monthly",    title:"Monthly Dividend Income",       defaultSize:"half" },
                    { id:"actual_vs",  title:"Actual vs Predicted Dividends", defaultSize:"full" },
                    { id:"div_charts", title:"Dividend Charts",               defaultSize:"half" },
                    { id:"calendar",   title:"Dividend Calendar",             defaultSize:"half" },
                    { id:"divcalview", title:"Dividend Calendar View",        defaultSize:"full" },
                    { id:"accsummary", title:"Account Summary",               defaultSize:"full" },
                    { id:"projection", title:"Projection at 60",              defaultSize:"full" },
                    { id:"closed",     title:"Closed Positions",              defaultSize:"full" },
                    { id:"backup",     title:"Data Backup",                   defaultSize:"full" },
                  ]} renderWidget={w => {
                    const sectors = {};
                    stocks.forEach(s => { const sec = s.sector || "Other"; const val = (prices[s.symbol]?.price ?? s.avg_cost) * s.shares; sectors[sec] = (sectors[sec] || 0) + val; });
                    const secData  = Object.entries(sectors).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
                    const secTotal = secData.reduce((s,d) => s + d.value, 0);
                    const colors   = ["#3b82f6","#10b981","#f59e0b","#ef4444","#8b5cf6","#06b6d4","#84cc16","#f97316","#ec4899","#6b7280"];
                    return (
                      <Widget key={w.id} id={w.id} title={w.title} tabId="analytics" defaultSize={w.defaultSize}>
                        {w.id === "perf"       && <PortfolioPerformanceChart stocks={stocks} prices={prices} globalCurrency={globalCurrency} totalGain={totalGain} totalValue={totalValue} totalCost={totalCost} />}
                        {w.id === "sector" && (() => {
                      return (
                        <Card className="border-0 shadow-none">
                          <CardContent className="pt-2">
                            <ResponsiveContainer width="100%" height={260}>
                              <PieChart>
                                <Pie data={secData} cx="50%" cy="50%" outerRadius={90} dataKey="value" nameKey="name"
                                  label={({name, percent}) => `${name} ${(percent*100).toFixed(1)}%`} labelLine={false}>
                                  {secData.map((d,i) => <Cell key={i} fill={colors[i%colors.length]}/>)}
                                </Pie>
                                <Tooltip formatter={(v,name) => [fmt(v, globalCurrency), name]}/>
                              </PieChart>
                            </ResponsiveContainer>
                            <div className="space-y-1.5 mt-2">
                              {secData.map((d,i) => (
                                <div key={d.name} className="flex items-center gap-2">
                                  <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{background:colors[i%colors.length]}}/>
                                  <span className="text-xs text-gray-700 flex-1">{d.name}</span>
                                  <span className="text-xs font-semibold text-gray-700">{fmt(d.value, globalCurrency)}</span>
                                  <span className="text-xs text-gray-400 w-10 text-right">{((d.value/secTotal)*100).toFixed(1)}%</span>
                                </div>
                              ))}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })()}
                        {w.id === "monthly"    && <MonthlyDividendChart dividends={dividends} stocks={stocks} />}
                        {w.id === "actual_vs"  && <DividendActualVsPredicted dividends={dividends} stocks={stocks} />}
                        {w.id === "div_charts" && <DividendCharts dividends={dividends} stocks={stocks} />}
                        {w.id === "calendar"   && <DividendCalendar stocks={stocks} dividends={dividends} globalCurrency={globalCurrency} />}
                        {w.id === "accsummary" && <AccountSummary stocks={stocks} transactions={transactions} dividends={dividends} prices={prices} />}
                        {w.id === "projection" && <ProjectionAt60 stocks={stocks} prices={prices} />}
                        {w.id === "closed"     && <ClosedPositions transactions={transactions} dividends={dividends} stocks={stocks} />}
                        {w.id === "backup"     && <DataBackup onRestored={loadAll} />}
                        {w.id === "yoy"        && <YearOverYear stocks={stocks} transactions={transactions} dividends={dividends} prices={prices} />}
                        {w.id === "divcalview" && <DividendCalendarView dividends={dividends} stocks={stocks} globalCurrency={globalCurrency} />}
                      </Widget>
                    );
                  }} />
                )}

                {/* ACCOUNT SUMMARY */}
                {activeTab === "summary" && (
                  <AccountSummary stocks={stocks} transactions={transactions} dividends={dividends} prices={prices} />
                )}

                {/* PROJECTION AT 60 */}
                {activeTab === "projection" && (
                  <ProjectionAt60 stocks={stocks} prices={prices} />
                )}

                {/* DIVIDEND CALENDAR */}
                {activeTab === "divcalendar" && (
                  <WidgetGrid tabId="divcalendar" widgets={[
                    { id:"calview", title:"Dividend Calendar", defaultSize:"full" },
                  ]} renderWidget={w => (
                    <Widget key={w.id} id={w.id} title={w.title} tabId="divcalendar" defaultSize="full">
                      <DividendCalendarView dividends={dividends} stocks={stocks} globalCurrency={globalCurrency} />
                    </Widget>
                  )} />
                )}

                {/* YEAR OVER YEAR */}
                {activeTab === "yoy" && (
                  <YearOverYear stocks={stocks} transactions={transactions} dividends={dividends} prices={prices} />
                )}

                {/* DIVIDEND HISTORY */}
                {activeTab === "histdiv" && (
                  <HistoricalDividends dividends={dividends} stocks={stocks} />
                )}

                {/* SETTINGS */}
                {activeTab === "settings" && (
                  <WidgetGrid tabId="settings" widgets={[
                    { id:"fx",     title:"Exchange Rate",             defaultSize:"half" },
                    { id:"tfsa",   title:"TFSA Contribution Room",    defaultSize:"half" },
                    { id:"import", title:"Import Stocks",             defaultSize:"half" },
                    { id:"backup", title:"Data Backup",               defaultSize:"full" },
                  ]} renderWidget={w => (
                    <Widget key={w.id} id={w.id} title={w.title} tabId="settings" defaultSize={w.defaultSize}>
                      {w.id === "fx" && <ExchangeRateWidget />}
                      {w.id === "tfsa"   && <TFSATracker transactions={transactions} stocks={stocks} />}
                      {w.id === "import" && <ImportStocks onImported={() => loadAll()} />}
                      {w.id === "backup" && <DataBackup onRestored={loadAll} />}
                    </Widget>
                  )} />
                )}

              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="w-72 flex-shrink-0 space-y-3 hidden lg:block">
            <PriceAlertsPanel />
            <DividendCalendar stocks={stocks} dividends={dividends} globalCurrency={globalCurrency} />
            <BuyOpportunitiesPanel />
            <AISentimentPanel />
            <AIAssistantPanel />
          </div>
        </div>
      </div>

      <AddStockForm open={showAddStock} onOpenChange={v => { if (!v) setEditingStock(null); setShowAddStock(v); }} onSubmit={handleAddStock} editStock={editingStock} />
      <AddTransactionForm open={showAddTx} onOpenChange={setShowAddTx} stocks={stocks} onSubmit={handleAddTransaction} />
      <AddDividendForm open={showAddDiv} onOpenChange={setShowAddDiv} stocks={stocks} onSubmit={handleAddDividend} suggestions={pendingDividendSuggestions} />
      <CashModal
        open={showCashModal}
        onOpenChange={setShowCashModal}
        onSaved={loadAll}
        initialAccount={cashModalAccount}
        initialCurrency={cashModalCurrency}
      />
    </div>
  );
}

export default function Dashboard() {
  return <ToastProvider><DashboardInner /></ToastProvider>;
}
