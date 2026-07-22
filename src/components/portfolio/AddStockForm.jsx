import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { fetchQuote } from "@/api/stockSearch";
import TickerSearch from "./TickerSearch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, CheckCircle2, Plus, Trash2, Info } from "lucide-react";

const schema = z.object({
  symbol:         z.string().min(1, "Symbol is required"),
  name:           z.string().optional(),
  market:         z.string().optional(),
  shares:         z.coerce.number().positive("Must be positive"),
  avg_cost:       z.coerce.number().positive("Must be positive"),
  purchase_date:  z.string().optional(),
  current_price:  z.coerce.number().optional(),
  sector:         z.string().optional(),
  account_type:   z.string().optional(),
  currency:       z.string().default("USD"),
  dividend_yield: z.coerce.number().min(0).optional(),
  annual_dividend: z.coerce.number().optional(),
});

const SECTORS = [
  "Technology","Healthcare","Financials","Consumer Discretionary","Consumer Staples",
  "Energy","Industrials","Materials","Real Estate","Utilities","Communication Services","ETF / Index","Other"
];
const BUILTIN_ACCOUNTS = ["RRSP","TFSA","FHSA","Cash","Margin","USD Cash"];
const ACCOUNTS_KEY = "custom_account_types";
function loadCustomAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "[]"); } catch { return []; }
}
function saveCustomAccounts(list) {
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(list));
}

export default function AddStockForm({ open, onOpenChange, onSubmit, editStock }) {
  const [quoteLoading, setQuoteLoading]   = useState(false);
  const [quoteFetched, setQuoteFetched]   = useState(false);
  const [divFetching, setDivFetching]     = useState(false);
  const [newAccount, setNewAccount]       = useState("");
  const [customAccounts, setCustomAccounts] = useState(loadCustomAccounts);
  const [selectedAccountType, setSelectedAccountType] = useState("");
  const [selectedSector, setSelectedSector]           = useState("");
  const [selectedMarket, setSelectedMarket]           = useState("US");

  const allAccounts = [...BUILTIN_ACCOUNTS, ...customAccounts].filter((v,i,a) => a.indexOf(v) === i);

  const { register, handleSubmit, setValue, watch, reset, formState: { errors, isSubmitting } } = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      currency: "USD",
      market: "US",
      purchase_date: new Date().toISOString().slice(0,10),
    }
  });

  // KEY FIX: whenever editStock changes (or dialog opens), reset the form with its values
  useEffect(() => {
    if (open) {
      if (editStock) {
        reset({
          symbol:          editStock.symbol        || "",
          name:            editStock.name          || "",
          market:          editStock.market        || "US",
          shares:          editStock.shares        || "",
          avg_cost:        editStock.avg_cost      || "",
          purchase_date:   editStock.purchase_date || new Date().toISOString().slice(0,10),
          current_price:   editStock.current_price || "",
          sector:          editStock.sector        || "",
          account_type:    editStock.account_type  || "",
          currency:        editStock.currency      || "USD",
          dividend_yield:  editStock.dividend_yield  || "",
          annual_dividend: editStock.annual_dividend || "",
        });
        setSelectedAccountType(editStock.account_type || "");
        setSelectedSector(editStock.sector || "");
        setSelectedMarket(editStock.market || "US");
      } else {
        reset({
          currency: "USD",
          market: "US",
          purchase_date: new Date().toISOString().slice(0,10),
        });
        setSelectedAccountType("");
        setSelectedSector("");
        setSelectedMarket("US");
        setQuoteFetched(false);
      }
    }
  }, [open, editStock]);

  const symbol   = watch("symbol");
  const currency = watch("currency") || "USD";

  // Auto-fetch dividend data from Yahoo Finance for any symbol
  const fetchDividendData = async (sym) => {
    if (!sym) return;
    setDivFetching(true);
    try {
      // Use the v8 chart which returns dividendYield in meta
      const PROXIES = ["https://corsproxy.io/?", "https://api.allorigins.win/raw?url="];
      for (const proxy of PROXIES) {
        try {
          const url = `https://query2.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`;
          const res = await fetch(`${proxy}${encodeURIComponent(url)}`);
          if (!res.ok) continue;
          const data = await res.json();
          const meta = data?.chart?.result?.[0]?.meta;
          if (!meta) continue;

          // dividendYield from meta (decimal, e.g. 0.0035 = 0.35%)
          const yieldRaw = meta.dividendYield ?? meta.trailingAnnualDividendYield ?? null;
          if (yieldRaw && yieldRaw > 0) {
            const yieldPct = parseFloat((yieldRaw * 100).toFixed(3));
            setValue("dividend_yield", yieldPct);

            // Estimate annual dividend: yield% × current price
            const price = meta.regularMarketPrice;
            if (price) {
              const annualPerShare = price * yieldRaw;
              const shares = parseFloat(watch("shares")) || 0;
              if (shares > 0) {
                setValue("annual_dividend", parseFloat((annualPerShare * shares).toFixed(2)));
              }
            }
          }

          // Also get sector if available
          if (meta.sector && !selectedSector) {
            setSelectedSector(meta.sector);
            setValue("sector", meta.sector);
          }
          break;
        } catch { /* try next */ }
      }
    } finally { setDivFetching(false); }
  };

  const handleTickerSelect = async (sym, meta) => {
    setValue("symbol", sym, { shouldValidate: true });
    if (meta.name) setValue("name", meta.name);
    const isCrypto = meta.market === "CRYPTO" || /^(BTC|ETH|SOL|XRP|DOGE|ADA|DOT|AVAX)/.test(sym);
    const isCA = !isCrypto && (meta.market === "CA" || sym.endsWith(".TO") || sym.endsWith(".V"));
    const mkt = isCrypto ? "CRYPTO" : isCA ? "CA" : "US";
    setSelectedMarket(mkt);
    setValue("market", mkt);
    // Crypto: CAD if symbol ends in -CAD, otherwise USD
    const cur = isCrypto ? (sym.endsWith("-CAD") ? "CAD" : "USD") : isCA ? "CAD" : "USD";
    setValue("currency", cur);
    if (isCrypto) {
      setValue("sector", "Crypto");
      setSelectedSector("Crypto");
    }
    if (!sym) return;

    setQuoteLoading(true);
    setQuoteFetched(false);
    try {
      const quote = await fetchQuote(sym);
      if (quote?.price) {
        setValue("avg_cost", parseFloat(quote.price.toFixed(2)));
        setValue("current_price", parseFloat(quote.price.toFixed(2)));
        if (quote.currency) setValue("currency", quote.currency);
        if (quote.name && !meta.name) setValue("name", quote.name);
        setQuoteFetched(true);

        // Pre-fill dividend yield from quote if available
        if (quote.divYield && quote.divYield > 0) {
          const yieldPct = parseFloat((quote.divYield * 100).toFixed(3));
          setValue("dividend_yield", yieldPct);
        }
      }
    } catch { /* ignore */ }
    finally { setQuoteLoading(false); }

    // Fetch dividend data separately (gets more details)
    fetchDividendData(sym);
  };

  // When shares change, recalculate annual dividend
  const sharesVal = watch("shares");
  const divYieldVal = watch("dividend_yield");
  const currentPriceVal = watch("current_price") || watch("avg_cost");
  useEffect(() => {
    if (sharesVal && divYieldVal && currentPriceVal) {
      const annual = (divYieldVal / 100) * currentPriceVal * sharesVal;
      if (annual > 0) setValue("annual_dividend", parseFloat(annual.toFixed(2)));
    }
  }, [sharesVal, divYieldVal]);

  const handleAddAccount = () => {
    const val = newAccount.trim();
    if (val && !allAccounts.includes(val)) {
      const updated = [...customAccounts, val];
      setCustomAccounts(updated);
      saveCustomAccounts(updated);
      setNewAccount("");
      setSelectedAccountType(val);
      setValue("account_type", val);
    }
  };

  const handleDeleteCustomAccount = (acct) => {
    const updated = customAccounts.filter(a => a !== acct);
    setCustomAccounts(updated);
    saveCustomAccounts(updated);
    if (selectedAccountType === acct) {
      setSelectedAccountType("");
      setValue("account_type", "");
    }
  };

  const onFormSubmit = async (data) => {
    await onSubmit({
      ...data,
      name:         data.name || data.symbol,  // auto-fill name from symbol if blank
      account_type: selectedAccountType || data.account_type || "",
      sector:       selectedSector      || data.sector       || "",
      market:       selectedMarket      || data.market       || "US",
    });
    onOpenChange(false);
  };

  const handleClose = () => {
    setQuoteFetched(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <DialogContent className="max-w-lg max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editStock ? `Edit — ${editStock.symbol}` : "Add New Stock"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onFormSubmit)} className="space-y-4">

          {/* Symbol + Market */}
          <div className="grid grid-cols-[1fr_160px] gap-3 items-start">
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Symbol *</Label>
              <TickerSearch
                value={symbol || ""}
                onChange={handleTickerSelect}
                placeholder="e.g., TD.TO or AAPL"
              />
              {quoteLoading && (
                <p className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Fetching live price...
                </p>
              )}
              {quoteFetched && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" /> Price & dividend data loaded
                </p>
              )}
              {errors.symbol && <p className="text-xs text-red-500">{errors.symbol.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Market *</Label>
              <Select value={selectedMarket} onValueChange={v => {
                setSelectedMarket(v);
                setValue("market", v);
                setValue("currency", v === "CA" ? "CAD" : "USD");
              }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="CA">🍁 Canadian (TSX)</SelectItem>
                  <SelectItem value="US">🇺🇸 US (NYSE/NASDAQ)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Company Name */}
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">Company Name *</Label>
            <Input {...register("name")} placeholder="e.g., Apple Inc." className="bg-white border-gray-300 text-gray-900" />
            {errors.name && <p className="text-xs text-red-500">{errors.name.message}</p>}
          </div>

          {/* Account Type */}
          <div className="space-y-1.5">
            <Label className="text-gray-700 font-medium">Account Type</Label>
            <Select value={selectedAccountType || "none_selected"} onValueChange={v => {
              setSelectedAccountType(v === "none_selected" ? "" : v);
              setValue("account_type", v === "none_selected" ? "" : v);
            }}>
              <SelectTrigger><SelectValue placeholder="Select account (RRSP, TFSA...)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none_selected">— None —</SelectItem>
                {BUILTIN_ACCOUNTS.map(a => <SelectItem key={a} value={a}>{a}</SelectItem>)}
                {customAccounts.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-xs text-gray-400 font-semibold uppercase tracking-wide">Custom</div>
                    {customAccounts.map(a => (
                      <div key={a} className="relative flex items-center group">
                        <SelectItem value={a} className="flex-1 pr-8">{a}</SelectItem>
                        <button type="button"
                          onClick={e => { e.preventDefault(); e.stopPropagation(); handleDeleteCustomAccount(a); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-100 text-red-500 transition-opacity z-10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <div className="flex gap-2 mt-1">
              <Input value={newAccount} onChange={e => setNewAccount(e.target.value)}
                placeholder="Add custom account type..."
                className="bg-white border-gray-300 text-gray-900 text-sm h-8"
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddAccount(); } }} />
              <Button type="button" size="sm" variant="outline" className="h-8 px-2" onClick={handleAddAccount}>
                <Plus className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {/* Shares + Avg Cost + Date */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Shares *</Label>
              <Input type="number" step="0.000001" {...register("shares")} placeholder="100"
                className="bg-white border-gray-300 text-gray-900" />
              {errors.shares && <p className="text-xs text-red-500">{errors.shares.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Avg Cost ({currency}) *</Label>
              <Input type="number" step="0.000001" {...register("avg_cost")} placeholder="0.00"
                className="bg-white border-gray-300 text-gray-900" />
              {errors.avg_cost && <p className="text-xs text-red-500">{errors.avg_cost.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Purchase Date</Label>
              <Input type="date" {...register("purchase_date")} className="bg-white border-gray-300 text-gray-900" />
            </div>
          </div>

          {/* Current Price + Sector */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Current Price ({currency})</Label>
              <Input type="number" step="0.000001" {...register("current_price")} placeholder="Auto-fetched"
                className="bg-white border-gray-300 text-gray-900" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-gray-700 font-medium">Sector</Label>
              <Select value={selectedSector || "none_sector"} onValueChange={v => {
                setSelectedSector(v === "none_sector" ? "" : v);
                setValue("sector", v === "none_sector" ? "" : v);
              }}>
                <SelectTrigger><SelectValue placeholder="Select sector" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none_sector">— None —</SelectItem>
                  {SECTORS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Dividend fields — auto-fetched */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Label className="text-gray-700 font-medium">Dividend Info</Label>
              {divFetching && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Auto-fetching...
                </span>
              )}
              {!divFetching && (
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Info className="h-3 w-3" /> Auto-filled from Yahoo Finance. Edit if needed.
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Dividend Yield (%)</Label>
                <Input type="number" step="0.000001" {...register("dividend_yield")} placeholder="Auto-fetched"
                  className="bg-white border-gray-300 text-gray-900" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-gray-500">Annual Dividend Total ({currency})</Label>
                <Input type="number" step="0.01" {...register("annual_dividend")} placeholder="Auto-calculated"
                  className="bg-white border-gray-300 text-gray-900" />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Works for dividend stocks, covered call ETFs (JEPI, XYLD, XIU.TO), and income funds.
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button type="button" variant="outline" className="flex-1" onClick={handleClose}>Cancel</Button>
            <Button type="submit" className="flex-1" disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : editStock ? "Save Changes" : "Add Stock"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
