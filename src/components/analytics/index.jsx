import React, { useState, useEffect } from 'react'
import { db } from '../../api/localData'
import { fetchQuote } from '../../api/stockPrices'
import { Card, Button, Spinner, EmptyState } from '../ui/index.jsx'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, BarChart, Bar } from 'recharts'

const COLORS = ['#2563eb','#16a34a','#dc2626','#d97706','#7c3aed','#0891b2','#be185d','#059669','#4f46e5','#b45309']

export function SummaryCards() {
  const [data, setData] = useState({ totalValue: 0, totalCash: 0, dayChange: 0, accounts: 0, stocks: 0 })
  const [loading, setLoading] = useState(false)

  async function calc() {
    setLoading(true)
    const stocks = db.list('stocks')
    const txns = db.list('transactions')
    const cash = db.list('cashEntries')
    const shareCounts = {}
    txns.forEach(t => {
      if (!shareCounts[t.ticker]) shareCounts[t.ticker] = 0
      shareCounts[t.ticker] += t.type === 'buy' ? t.shares : -t.shares
    })
    let totalValue = 0, dayChange = 0
    await Promise.allSettled(stocks.map(async s => {
      try {
        const q = await fetchQuote(s.ticker)
        const shares = shareCounts[s.ticker] || 0
        totalValue += shares * q.price
        dayChange += shares * q.change
      } catch {}
    }))
    const totalCash = cash.reduce((sum, c) => sum + (parseFloat(c.amount) || 0), 0)
    setData({ totalValue, totalCash, dayChange, accounts: db.list('accounts').length, stocks: stocks.length })
    setLoading(false)
  }

  useEffect(() => { calc() }, [])

  const cards = [
    { label: 'Portfolio Value', value: `$${data.totalValue.toFixed(2)}`, color: 'text-blue-600' },
    { label: 'Cash Balance', value: `$${data.totalCash.toFixed(2)}`, color: 'text-green-600' },
    { label: "Today's Change", value: `${data.dayChange >= 0 ? '+' : ''}$${data.dayChange.toFixed(2)}`, color: data.dayChange >= 0 ? 'text-green-600' : 'text-red-600' },
    { label: 'Total Assets', value: `$${(data.totalValue + data.totalCash).toFixed(2)}`, color: 'text-purple-600' },
  ]

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {cards.map(c => (
        <Card key={c.label} className="p-4">
          <div className="text-xs text-gray-500 mb-1">{c.label}</div>
          <div className={`text-xl font-bold ${c.color}`}>{loading ? '...' : c.value}</div>
        </Card>
      ))}
    </div>
  )
}

export function SectorAllocation() {
  const stocks = db.list('stocks')
  const sectorCounts = {}
  stocks.forEach(s => { sectorCounts[s.sector || 'Other'] = (sectorCounts[s.sector || 'Other'] || 0) + 1 })
  const data = Object.entries(sectorCounts).map(([name, value]) => ({ name, value }))

  if (data.length === 0) return <EmptyState icon="🥧" title="No sector data" description="Add stocks to see sector allocation" />

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Sector Allocation</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export function PortfolioPerformanceChart() {
  const txns = db.list('transactions').sort((a,b) => a.date.localeCompare(b.date))
  if (txns.length === 0) return <EmptyState icon="📈" title="No transaction history" description="Add transactions to see performance chart" />

  const accounts = [...new Set(txns.map(t => t.account).filter(Boolean))]
  
  // Build cumulative cost by account over time
  const dateMap = {}
  const accountTotals = {}
  txns.forEach(t => {
    if (!accountTotals[t.account]) accountTotals[t.account] = 0
    const cost = t.shares * t.price
    accountTotals[t.account] += t.type === 'buy' ? cost : -cost
    if (!dateMap[t.date]) dateMap[t.date] = { date: t.date, ...JSON.parse(JSON.stringify(accountTotals)) }
    else Object.assign(dateMap[t.date], { ...JSON.parse(JSON.stringify(accountTotals)) })
  })
  const chartData = Object.values(dateMap).sort((a,b) => a.date.localeCompare(b.date))

  return (
    <Card className="p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Invested Capital Over Time (by Account)</h3>
      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 10 }} />
            <YAxis tick={{ fontSize: 10 }} />
            <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`]} />
            <Legend />
            {accounts.map((a, i) => (
              <Line key={a} type="monotone" dataKey={a} stroke={COLORS[i % COLORS.length]} dot={false} strokeWidth={2} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
