import React, { useState } from 'react'
import { db } from '../../api/localData'
import { Button, Input, Card, Spinner } from '../ui/index.jsx'

const GROQ_API = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'

async function groqChat(apiKey, messages) {
  const res = await fetch(GROQ_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: MODEL, messages, max_tokens: 512, temperature: 0.7 })
  })
  if (!res.ok) throw new Error(`Groq error: ${res.status}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content || ''
}

export default function AISidebar() {
  const [apiKey, setApiKey] = useState(localStorage.getItem('groq_api_key') || '')
  const [keyInput, setKeyInput] = useState('')
  const [activeTab, setActiveTab] = useState('assistant')
  // Assistant
  const [chatMessages, setChatMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  // Sentiment
  const [sentTicker, setSentTicker] = useState('')
  const [sentResult, setSentResult] = useState('')
  const [sentLoading, setSentLoading] = useState(false)

  function saveKey() {
    localStorage.setItem('groq_api_key', keyInput)
    setApiKey(keyInput)
  }

  async function sendChat() {
    if (!input.trim() || !apiKey) return
    const stocks = db.list('stocks').map(s => s.ticker).join(', ')
    const userMsg = { role: 'user', content: input }
    const history = [...chatMessages, userMsg]
    setChatMessages(history)
    setInput('')
    setLoading(true)
    try {
      const system = `You are a helpful stock portfolio assistant. The user holds these tickers: ${stocks || 'none listed'}. Provide concise, helpful analysis and answers.`
      const reply = await groqChat(apiKey, [{ role: 'system', content: system }, ...history])
      setChatMessages([...history, { role: 'assistant', content: reply }])
    } catch (e) {
      setChatMessages([...history, { role: 'assistant', content: `Error: ${e.message}` }])
    }
    setLoading(false)
  }

  async function runSentiment() {
    if (!sentTicker.trim() || !apiKey) return
    setSentLoading(true); setSentResult('')
    try {
      const prompt = `Provide a brief investment sentiment analysis for ${sentTicker.toUpperCase()}. Include: 1) Overall sentiment (Bullish/Neutral/Bearish), 2) Key factors driving this view, 3) Main risks to monitor. Keep it under 150 words.`
      const result = await groqChat(apiKey, [{ role: 'user', content: prompt }])
      setSentResult(result)
    } catch (e) { setSentResult(`Error: ${e.message}`) }
    setSentLoading(false)
  }

  if (!apiKey) return (
    <div className="p-4 space-y-3">
      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Features</div>
      <p className="text-sm text-gray-600">Enter your free Groq API key to enable AI features.</p>
      <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 underline">Get free key at console.groq.com →</a>
      <Input label="Groq API Key (gsk_...)" value={keyInput} onChange={e => setKeyInput(e.target.value)} placeholder="gsk_..." />
      <Button onClick={saveKey} disabled={!keyInput.startsWith('gsk_')}>Save Key</Button>
    </div>
  )

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">AI Assistant</span>
        <button onClick={() => { localStorage.removeItem('groq_api_key'); setApiKey('') }} className="text-xs text-gray-400 hover:text-red-500">Reset Key</button>
      </div>

      {/* Tab selector */}
      <div className="flex border-b">
        {['assistant','sentiment'].map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize border-b-2 -mb-px transition-colors ${activeTab === t ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500'}`}>
            {t}
          </button>
        ))}
      </div>

      {activeTab === 'assistant' && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {chatMessages.length === 0 && (
              <p className="text-xs text-gray-400 text-center pt-4">Ask me anything about your portfolio or any stock.</p>
            )}
            {chatMessages.map((m, i) => (
              <div key={i} className={`text-xs p-2.5 rounded-lg ${m.role === 'user' ? 'bg-blue-50 text-blue-900 ml-4' : 'bg-gray-100 text-gray-800 mr-4'}`}>
                {m.content}
              </div>
            ))}
            {loading && <div className="flex justify-center"><Spinner size="sm" /></div>}
          </div>
          <div className="p-3 border-t flex gap-2">
            <input
              value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendChat()}
              placeholder="Ask about stocks..."
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button size="sm" onClick={sendChat} disabled={loading || !input.trim()}>→</Button>
          </div>
        </div>
      )}

      {activeTab === 'sentiment' && (
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">Get AI sentiment analysis for any ticker.</p>
          <div className="flex gap-2">
            <input
              value={sentTicker} onChange={e => setSentTicker(e.target.value.toUpperCase())}
              placeholder="AAPL"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <Button size="sm" onClick={runSentiment} disabled={sentLoading || !sentTicker.trim()}>
              {sentLoading ? <Spinner size="sm" /> : 'Analyze'}
            </Button>
          </div>
          {sentResult && (
            <Card className="p-3">
              <p className="text-xs text-gray-700 whitespace-pre-line leading-relaxed">{sentResult}</p>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
