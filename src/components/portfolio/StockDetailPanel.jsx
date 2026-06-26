import { useState, useEffect } from "react";
import { fetchChartData, fetchKeyStats } from "@/api/stockSearch";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils";

const RANGES = ["1D","1W","1M","3M","1Y","5Y"];

const GROQ_KEY = "groq_api_key";
const getGroqKey = () => localStorage.getItem(GROQ_KEY) || "";

function fmtC(n, cur) {
  if (n == null || isNaN(n)) return "—";
  return new Intl.NumberFormat("en-CA",{style:"currency",currency:cur||"USD",maximumFractionDigits:2}).format(n);
}
function fmtBig(n) {
  if (n == null) return "—";
  if (n >= 1e12) return "$"+(n/1e12).toFixed(2)+"T";
  if (n >= 1e9)  return "$"+(n/1e9).toFixed(2)+"B";
  if (n >= 1e6)  return "$"+(n/1e6).toFixed(2)+"M";
  return "$"+n.toLocaleString();
}
function fmtVol(n) {
  if (n == null) return "—";
  if (n >= 1e6) return (n/1e6).toFixed(1)+"M";
  if (n >= 1e3) return (n/1e3).toFixed(1)+"K";
  return n.toLocaleString();
}

function StatItem({ label, value }) {
  return (
    <div>
      <div className="text-xs text-blue-500 font-medium mb-0.5">{label}</div>
      <div className="text-sm font-semibold text-gray-900">{value ?? "—"}</div>
    </div>
  );
}

// Ask Groq for analyst estimates — uses existing Groq key if set
async function fetchGroqAnalystEstimate(symbol, name, price, week52Low, week52High, sma200, currency) {
  const key = getGroqKey();
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization":`Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 200,
        temperature: 0.3,
        messages: [{
          role: "system",
          content: "You are a financial analyst. Respond ONLY with a valid JSON object, no markdown, no explanation."
        },{
          role: "user",
          content: `Give analyst estimates for ${symbol} (${name}).
Current price: ${price} ${currency}
52W Range: ${week52Low} - ${week52High} ${currency}
200-day SMA: ${sma200 ? sma200.toFixed(2) : "unknown"} ${currency}

Respond with ONLY this JSON (no code blocks):
{"targetLow": number, "targetAvg": number, "targetHigh": number, "recommendation": "Strong Buy|Buy|Hold|Sell|Strong Sell", "analysts": number, "peRatio": number, "sector": "string"}`
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    // Extract JSON - handle both raw JSON and potential markdown
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed;
  } catch { return null; }
}

export default function StockDetailPanel({ stock, quote, onClose }) {
  const [range, setRange]             = useState("1M");
  const [chartData, setChartData]     = useState([]);
  const [stats, setStats]             = useState(null);
  const [analyst, setAnalyst]         = useState(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [analystLoading, setAnalystLoading] = useState(false);

  const currency  = stock.currency || "USD";
  const livePrice = quote?.price ?? stock.avg_cost;
  const change    = quote?.change ?? 0;
  const changePct = quote?.changePercent ?? 0;
  const isUp      = change >= 0;

  // Load chart on range change
  useEffect(() => {
    setChartLoading(true);
    fetchChartData(stock.symbol, range)
      .then(d => { setChartData(d); setChartLoading(false); })
      .catch(() => setChartLoading(false));
  }, [stock.symbol, range]);

  // Load key stats once per symbol, then fetch analyst estimates via Groq
  useEffect(() => {
    setStats(null);
    setAnalyst(null);
    setStatsLoading(true);
    setAnalystLoading(false);
    fetchKeyStats(stock.symbol).then(s => {
      setStats(s);
      setStatsLoading(false);
      // If Groq key is set, also fetch analyst estimates
      if (getGroqKey() && s) {
        setAnalystLoading(true);
        fetchGroqAnalystEstimate(
          stock.symbol, stock.name,
          s.price ?? livePrice,
          s.week52Low, s.week52High, s.sma200,
          currency
        ).then(a => { setAnalyst(a); setAnalystLoading(false); })
         .catch(() => setAnalystLoading(false));
      }
    }).catch(() => setStatsLoading(false));
  }, [stock.symbol]);

  // Holdings
  const costBasis   = stock.avg_cost * stock.shares;
  const marketValue = livePrice * stock.shares;
  const gainLoss    = marketValue - costBasis;
  const returnPct   = costBasis > 0 ? (gainLoss / costBasis) * 100 : 0;
  const annualIncome = stock.annual_dividend
    ? parseFloat(stock.annual_dividend)
    : stock.dividend_yield
    ? livePrice * stock.shares * (parseFloat(stock.dividend_yield) / 100)
    : null;

  // SMA
  const sma200   = stats?.sma200;
  const smaAbove = sma200 != null ? livePrice > sma200 : null;

  // Div yield display
  const divYieldDisplay = stock.dividend_yield
    ? `${parseFloat(stock.dividend_yield).toFixed(2)}%`
    : stats?.divYield != null && stats.divYield > 0
    ? `${(stats.divYield * 100).toFixed(2)}%`
    : analyst?.divYield
    ? `${analyst.divYield}%`
    : "—";

  // P/E from stats or analyst
  const peDisplay = stats?.peRatio
    ? stats.peRatio.toFixed(1)
    : analyst?.peRatio
    ? analyst.peRatio.toFixed(1)
    : "—";

  // Sector from stock record or analyst
  const sectorDisplay = stock.sector || analyst?.sector || "—";

  // Intrinsic value = analyst target avg if available, else SMA×1.10
  const intrinsicValue = analyst?.targetAvg
    ?? (sma200 != null ? sma200 * 1.10 : null);
  const intrinsicUpside = intrinsicValue != null && livePrice > 0
    ? ((intrinsicValue - livePrice) / livePrice) * 100
    : null;

  // Forecast
  const forecastAvg  = analyst?.targetAvg ?? null;
  const forecastLow  = analyst?.targetLow ?? null;
  const forecastHigh = analyst?.targetHigh ?? null;

  const recLabel = (r) => {
    if (!r) return "";
    const map = { strong_buy:"Strong Buy", buy:"Buy", hold:"Hold", sell:"Sell", strong_sell:"Strong Sell" };
    return map[r.toLowerCase().replace(" ","_")] || r;
  };

  const Spinner = () => <Loader2 className="h-3 w-3 animate-spin text-gray-300 inline-block" />;

  return (
    <div className="border rounded-lg bg-white shadow overflow-hidden text-sm">

      {/* Price Header */}
      <div className="p-4 bg-gray-50 border-b flex items-start justify-between">
        <div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-gray-900">{fmtC(livePrice, currency)}</span>
            <span className="text-sm text-gray-400">{currency}</span>
          </div>
          <div className={cn("flex items-center gap-1 text-sm font-medium mt-0.5",
            isUp ? "text-green-600" : "text-red-500")}>
            {isUp ? <TrendingUp className="h-3.5 w-3.5"/> : <TrendingDown className="h-3.5 w-3.5"/>}
            {isUp?"+":""}{fmtC(change,currency)} ({isUp?"+":""}{changePct.toFixed(2)}%) · 1D
          </div>
        </div>
        <button onClick={onClose}
          className="text-gray-400 hover:text-gray-700 text-xl p-1 rounded hover:bg-gray-200 transition-colors">✕</button>
      </div>

      {/* Chart */}
      <div className="px-4 pt-3 pb-1">
        {chartLoading ? (
          <div className="h-36 flex items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-gray-200" />
          </div>
        ) : chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={140}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#10b981" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="date" tick={{fontSize:10}} interval="preserveStartEnd"/>
              <YAxis domain={["auto","auto"]} tick={{fontSize:10}} width={54} tickFormatter={v=>`$${v}`}/>
              <Tooltip formatter={v=>[fmtC(v,currency),"Price"]}/>
              <Area type="monotone" dataKey="price" stroke="#10b981" strokeWidth={1.5}
                fill="url(#cg)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-36 flex items-center justify-center text-gray-300 text-xs">Chart unavailable</div>
        )}
        <div className="flex gap-1 justify-center mt-1 mb-2">
          {RANGES.map(r => (
            <button key={r} onClick={() => setRange(r)}
              className={cn("px-2.5 py-0.5 text-xs rounded font-medium transition-colors",
                range===r?"bg-gray-800 text-white":"text-gray-400 hover:bg-gray-100")}>
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Key Stats */}
      <div className="px-4 pb-4 border-t pt-3">
        <div className="text-sm font-semibold text-gray-700 mb-3">Key Stats</div>
        {statsLoading ? (
          <div className="flex items-center gap-2 text-xs text-gray-300 py-2"><Spinner /> Loading stats...</div>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3">
            <StatItem label="Open"      value={stats?.open     != null ? fmtC(stats.open,    currency) : "—"} />
            <StatItem label="Day High"  value={stats?.dayHigh  != null ? fmtC(stats.dayHigh, currency) : "—"} />
            <StatItem label="Day Low"   value={stats?.dayLow   != null ? fmtC(stats.dayLow,  currency) : "—"} />
            <StatItem label="Volume"    value={fmtVol(stats?.volume)} />
            <StatItem label="P/E Ratio" value={peDisplay} />
            <StatItem label="Mkt Cap"   value={fmtBig(stats?.marketCap)} />
            <StatItem label="52W High"  value={stats?.week52High != null ? fmtC(stats.week52High, currency) : "—"} />
            <StatItem label="52W Low"   value={stats?.week52Low  != null ? fmtC(stats.week52Low,  currency) : "—"} />
            <StatItem label="Div Yield" value={divYieldDisplay} />
            <StatItem label="Sector"    value={sectorDisplay} />
          </div>
        )}
      </div>

      {/* Your Holdings */}
      <div className="px-4 pb-4 border-t pt-3">
        <div className="text-sm font-semibold text-gray-700 mb-3">Your Holdings</div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-3">
          <StatItem label="Shares"       value={stock.shares} />
          <StatItem label="Avg Cost"     value={fmtC(stock.avg_cost, currency)} />
          <StatItem label="Market Value" value={fmtC(marketValue, currency)} />
          <StatItem label="Cost Basis"   value={fmtC(costBasis, currency)} />
          <StatItem label="Gain/Loss"    value={
            <span className={gainLoss>=0?"text-green-600":"text-red-500"}>
              {gainLoss>=0?"+":""}{fmtC(gainLoss,currency)}
            </span>
          } />
          <StatItem label="Return" value={
            <span className={returnPct>=0?"text-green-600":"text-red-500"}>
              {returnPct>=0?"+":""}{returnPct.toFixed(2)}%
            </span>
          } />
          {annualIncome != null && (
            <StatItem label="Annual Income" value={<span className="text-green-600">{fmtC(annualIncome,currency)}</span>} />
          )}
          {stock.purchase_date && <StatItem label="Purchased" value={stock.purchase_date} />}
          {stock.account_type  && <StatItem label="Account"   value={stock.account_type} />}
        </div>
      </div>

      {/* 200 SMA + Intrinsic Value */}
      <div className="px-4 pb-4 border-t pt-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-1.5">
            <TrendingUp className="h-3.5 w-3.5"/> 200 SMA
          </div>
          {statsLoading ? <Spinner /> : (
            <>
              <div className="font-bold text-gray-900">
                {sma200 != null ? `${sma200.toFixed(2)} ${currency}` : "—"}
              </div>
              {smaAbove != null && (
                <div className={cn("text-xs font-medium mt-0.5",
                  smaAbove?"text-green-600":"text-red-500")}>
                  {smaAbove ? "↑ Above SMA" : "↓ Below SMA"}
                </div>
              )}
            </>
          )}
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
          <div className="text-xs text-gray-400 mb-1.5">$ Intrinsic Value</div>
          {statsLoading ? <Spinner /> : analystLoading ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-400"><Spinner /> Estimating...</div>
          ) : (
            <>
              <div className="font-bold text-gray-900">
                {intrinsicValue != null ? `${intrinsicValue.toFixed(2)} ${currency}` : "—"}
              </div>
              {intrinsicUpside != null && (
                <div className={cn("text-xs font-medium mt-0.5",
                  intrinsicUpside>0?"text-green-600":"text-red-500")}>
                  {intrinsicUpside>0?"+":""}{intrinsicUpside.toFixed(1)}%{" "}
                  {intrinsicUpside>0?"upside":"downside"}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* 12-Month Forecast */}
      <div className="px-4 pb-4 border-t pt-3">
        <div className="text-xs text-gray-400 mb-2 flex items-center gap-1.5">
          <span className="text-gray-300">◎</span> 12-Month Forecast
        </div>
        {statsLoading ? <div className="text-xs text-gray-300 py-1"><Spinner /> Loading...</div>
        : analystLoading ? (
          <div className="flex items-center gap-1.5 text-xs text-gray-400"><Spinner /> Fetching analyst estimates...</div>
        ) : forecastAvg != null ? (
          <>
            <div className="flex justify-between mb-2">
              <div>
                <div className="text-xs text-gray-400">Low</div>
                <div className="font-semibold text-gray-900">{forecastLow != null ? forecastLow.toFixed(2) : "—"}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-gray-400">Avg</div>
                <div className="font-semibold text-blue-600">{forecastAvg.toFixed(2)}</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-400">High</div>
                <div className="font-semibold text-gray-900">{forecastHigh != null ? forecastHigh.toFixed(2) : "—"}</div>
              </div>
            </div>
            {forecastLow != null && forecastHigh != null && forecastHigh > forecastLow && (
              <div className="relative h-2 bg-gray-100 rounded-full mb-2">
                <div className="absolute inset-0 bg-gradient-to-r from-red-200 via-yellow-200 to-green-300 rounded-full opacity-50"/>
                <div className="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full bg-gray-800 border-2 border-white shadow-sm"
                  style={{ left:`calc(${Math.min(100,Math.max(0,((livePrice-forecastLow)/(forecastHigh-forecastLow))*100))}% - 5px)` }}
                  title={`Current: ${fmtC(livePrice,currency)}`}
                />
              </div>
            )}
            {analyst?.recommendation && (
              <div className="text-xs font-semibold text-gray-800 mt-1">
                {recLabel(analyst.recommendation)}
                {analyst?.analysts != null && (
                  <span className="font-normal text-gray-400"> ({analyst.analysts} analysts)</span>
                )}
              </div>
            )}
            {!getGroqKey() && (
              <p className="text-xs text-gray-400 mt-1 italic">Add a Groq API key for AI-powered analyst estimates</p>
            )}
          </>
        ) : (
          <div className="text-xs text-gray-400">
            {getGroqKey()
              ? "Could not fetch forecast for this stock"
              : "Add a free Groq API key in the AI panels to see analyst estimates"}
          </div>
        )}
      </div>
    </div>
  );
}
