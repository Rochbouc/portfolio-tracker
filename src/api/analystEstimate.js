// Analyst price target + sector estimates via Groq (AI knowledge-based
// estimate, NOT a live scrape). Yahoo's live analyst-target endpoint
// (v10 quoteSummary) requires an auth cookie/crumb that the older v8 price
// endpoint doesn't need, so it's not reliably reachable through a public
// CORS proxy — this is the same approach the stock detail panel already
// uses successfully, centralized here so every part of the app that wants
// this data uses the same source and cache instead of duplicating it.
//
// Requires a Groq API key to be set (Settings → AI Assistant). Without one,
// this returns null everywhere it's used — same as the existing detail panel.

const GROQ_KEY_STORAGE = "groq_api_key";
const getGroqKey = () => localStorage.getItem(GROQ_KEY_STORAGE) || "";

const CACHE_KEY = "analyst_estimate_cache_v1";
const CACHE_DAYS = 30; // re-check monthly, same cadence as the dividend data refresh

function loadCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; } }
function saveCache(c) { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); }
function isFresh(iso) { if (!iso) return false; return (Date.now() - new Date(iso).getTime()) / 86400000 < CACHE_DAYS; }

export function getCachedEstimate(symbol) {
  const entry = loadCache()[symbol];
  return entry && isFresh(entry.checkedAt) ? entry : null;
}

export async function fetchGroqAnalystEstimate(symbol, name, price, week52Low, week52High, sma200, currency) {
  const key = getGroqKey();
  if (!key) return null;
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${key}` },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        max_tokens: 200,
        temperature: 0.3,
        messages: [{
          role: "system",
          content: "You are a financial analyst. Respond ONLY with a valid JSON object, no markdown, no explanation.",
        }, {
          role: "user",
          content: `Give analyst estimates for ${symbol} (${name}).
Current price: ${price} ${currency}
52W Range: ${week52Low} - ${week52High} ${currency}
200-day SMA: ${sma200 ? sma200.toFixed(2) : "unknown"} ${currency}

Respond with ONLY this JSON (no code blocks):
{"targetLow": number, "targetAvg": number, "targetHigh": number, "recommendation": "Strong Buy|Buy|Hold|Sell|Strong Sell", "analysts": number, "peRatio": number, "sector": "string"}`,
        }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    return JSON.parse(jsonMatch[0]);
  } catch { return null; }
}

// Fetch-or-cache in one call. Only successful results are cached — a
// missing Groq key or a failed call returns null without writing to cache,
// so it retries cleanly (and cheaply) once a key is added, rather than
// being stuck "not available" for 30 days.
export async function ensureAnalystEstimate(symbol, name, price, week52Low, week52High, sma200, currency) {
  const cached = getCachedEstimate(symbol);
  if (cached) return cached;
  const est = await fetchGroqAnalystEstimate(symbol, name, price, week52Low, week52High, sma200, currency);
  if (est) {
    const cache = loadCache();
    cache[symbol] = { ...est, checkedAt: new Date().toISOString() };
    saveCache(cache);
  }
  return est;
}
