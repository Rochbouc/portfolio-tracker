import React, { useState, useEffect } from 'react'
import { db } from '../../api/localData'
import { fetchQuote } from '../../api/stockPrices'
import { Button, Modal, Input, Select, EmptyState, Card, Spinner } from '../ui/index.jsx'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts'
import TickerSearch from '../portfolio/TickerSearch.jsx'

export function AddDividendModal({ onClose }) {
  const accounts = db.list('accounts')
  const [ticker, setTicker] = useState('')
  const [amount, setAmount] = useState('')
  const [account, setAccount] = useState(accounts[0]?.name || '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))
  const [shares, setShares] = useState('')

  function handleSave() {
    if (!ticker.trim() || !amount) { alert('Fill in all fields'); return }
    const a = parseFloat(amount)
    if (isNaN(a)) { alert('Invalid amount'); return }
    db.create('dividends', { ticker: ticker.trim().toUpperCase(), amount: a, account, date, shares: parseFloat(shares) || 0 })
    // Credit cash
    if (account) {
      const cashList = db.list('cashEntries')
      const entry = cashList.find(c => c.account === account)
      if (entry) {
        db.update('cashEntries', entry.id, { amount: (parseFloat(entry.amount) || 0) + a })
      }
    }
    onClose()
  }

  return (
    <Modal open title="Record Dividend" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Ticker</label>
          <TickerSearch value={ticker} onChange={setTicker} />
        </div>
        <Input label="Total Amount Received ($)" type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.01" />
        <Input label="Shares Held (optional)" type="number" value={shares} onChange={e => setShares(e.target.value)} min="0" step="0.001" />
        {accounts.length > 0 && (
          <Select label="Account" value={account} onChange={e => setAccount(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
          </Select>
        )}
        <Input label="Date" type="date" value={date} onChange={e => setDate(e.target.value)} />
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave}>Save</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

export function DividendList() {
  const [divs, setDivs] = useState([])
  const [showAdd, setShowAdd] = useState(false)

  function reload() { setDivs(db.list('dividends').sort((a,b) => b.date.localeCompare(a.date))) }
  useEffect(() => { reload() }, [])

  function handleDelete(id) {
    if (!confirm('Delete dividend?')) return
    db.delete('dividends', id)
    reload()
  }

  if (divs.length === 0) return (
    <div>
      <EmptyState icon="💰" title="No dividends" description="Record dividend payments received" action={<Button onClick={() => setShowAdd(true)}>Record Dividend</Button>} />
      {showAdd && <AddDividendModal onClose={() => { setShowAdd(false); reload() }} />}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}>+ Record Dividend</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="pb-2 pr-3">Date</th>
              <th className="pb-2 pr-3">Ticker</th>
              <th className="pb-2 pr-3">Amount</th>
              <th className="pb-2 pr-3">Shares</th>
              <th className="pb-2 pr-3">Account</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {divs.map(d => (
              <tr key={d.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-3 text-gray-500">{d.date}</td>
                <td className="py-2 pr-3 font-medium">{d.ticker}</td>
                <td className="py-2 pr-3 text-green-600 font-medium">${Number(d.amount).toFixed(2)}</td>
                <td className="py-2 pr-3">{d.shares || '—'}</td>
                <td className="py-2 pr-3 text-gray-500">{d.account}</td>
                <td className="py-2">
                  <button onClick={() => handleDelete(d.id)} className="text-gray-300 hover:text-red-500">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddDividendModal onClose={() => { setShowAdd(false); reload() }} />}
    </div>
  )
}

export function DividendCalendar() {
  const [calData, setCalData] = useState([])
  const [loading, setLoading] = useState(false)

  async function buildCalendar() {
    setLoading(true)
    const stocks = db.list('stocks')
    const txns = db.list('transactions')
    // Build share counts per ticker
    const shareCounts = {}
    txns.forEach(t => {
      if (!shareCounts[t.ticker]) shareCounts[t.ticker] = 0
      shareCounts[t.ticker] += t.type === 'buy' ? t.shares : -t.shares
    })
    const results = []
    await Promise.allSettled(stocks.map(async s => {
      try {
        const q = await fetchQuote(s.ticker)
        const annualRate = q.trailingAnnualDividendRate || 0
        if (annualRate > 0) {
          const shares = shareCounts[s.ticker] || 0
          const quarterly = annualRate / 4
          results.push({ ticker: s.ticker, annualRate, quarterly, shares, annualTotal: annualRate * shares })
        }
      } catch {}
    }))
    results.sort((a,b) => b.annualRate - a.annualRate)
    setCalData(results)
    setLoading(false)
  }

  useEffect(() => { buildCalendar() }, [])

  if (loading) return <div className="flex justify-center p-8"><Spinner /></div>

  if (calData.length === 0) return (
    <EmptyState icon="📅" title="No dividend data" description="Add dividend-paying stocks to see calendar" action={<Button onClick={buildCalendar}>Refresh</Button>} />
  )

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={buildCalendar}>↻ Refresh</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th className="text-left p-2 border border-gray-200 font-medium">Ticker</th>
              <th className="p-2 border border-gray-200 font-medium">Annual/Share</th>
              {months.map(m => <th key={m} className="p-2 border border-gray-200 font-medium w-12">{m}</th>)}
              <th className="p-2 border border-gray-200 font-medium">Annual Total</th>
            </tr>
          </thead>
          <tbody>
            {calData.map(row => (
              <tr key={row.ticker} className="hover:bg-blue-50">
                <td className="p-2 border border-gray-200 font-semibold">{row.ticker}</td>
                <td className="p-2 border border-gray-200 text-center">${row.annualRate.toFixed(2)}</td>
                {months.map((m, i) => {
                  const isQtr = [2,5,8,11].includes(i) // Mar, Jun, Sep, Dec (most common)
                  return (
                    <td key={m} className={`p-2 border border-gray-200 text-center ${isQtr ? 'bg-green-50 text-green-700 font-medium' : 'text-gray-300'}`}>
                      {isQtr ? `$${row.quarterly.toFixed(2)}` : '—'}
                    </td>
                  )
                })}
                <td className="p-2 border border-gray-200 text-center font-bold text-green-700">
                  {row.shares > 0 ? `$${row.annualTotal.toFixed(2)}` : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">Quarterly schedule shown for Mar/Jun/Sep/Dec (typical). Actual payment dates vary by stock.</p>
    </div>
  )
}

export function DividendCharts() {
  const divs = db.list('dividends')
  if (divs.length === 0) return <EmptyState icon="📊" title="No dividend data yet" description="Record dividends to see charts" />

  // Monthly totals
  const monthly = {}
  divs.forEach(d => {
    const month = d.date.slice(0, 7)
    monthly[month] = (monthly[month] || 0) + d.amount
  })
  const monthlyData = Object.entries(monthly).sort().map(([month, amount]) => ({ month, amount: Number(amount.toFixed(2)) }))

  // Per ticker totals
  const byTicker = {}
  divs.forEach(d => { byTicker[d.ticker] = (byTicker[d.ticker] || 0) + d.amount })
  const tickerData = Object.entries(byTicker).map(([ticker, total]) => ({ ticker, total: Number(total.toFixed(2)) })).sort((a,b) => b.total - a.total)

  return (
    <div className="space-y-6">
      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Monthly Dividends Received</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyData}>
              <XAxis dataKey="month" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [`$${v}`, 'Dividends']} />
              <Bar dataKey="amount" fill="#16a34a" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card className="p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Total by Ticker</h3>
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={tickerData}>
              <XAxis dataKey="ticker" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip formatter={(v) => [`$${v}`, 'Total']} />
              <Bar dataKey="total" fill="#2563eb" radius={[4,4,0,0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </div>
  )
}
