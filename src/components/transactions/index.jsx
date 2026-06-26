import React, { useState, useEffect } from 'react'
import { db } from '../../api/localData'
import { Button, Modal, Input, Select, EmptyState, Badge } from '../ui/index.jsx'
import TickerSearch from '../portfolio/TickerSearch.jsx'

export function AddTransactionModal({ onClose, prefillTicker }) {
  const accounts = db.list('accounts')
  const [type, setType] = useState('buy')
  const [ticker, setTicker] = useState(prefillTicker || '')
  const [shares, setShares] = useState('')
  const [price, setPrice] = useState('')
  const [account, setAccount] = useState(accounts[0]?.name || '')
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10))

  function handleSave() {
    if (!ticker.trim() || !shares || !price) { alert('Fill in all fields'); return }
    const s = parseFloat(shares), p = parseFloat(price)
    if (isNaN(s) || isNaN(p)) { alert('Invalid numbers'); return }
    db.create('transactions', { type, ticker: ticker.trim().toUpperCase(), shares: s, price: p, account, date })
    // Update cash
    if (account) {
      const cashList = db.list('cashEntries')
      const entry = cashList.find(c => c.account === account)
      const total = s * p
      if (entry) {
        const current = parseFloat(entry.amount) || 0
        db.update('cashEntries', entry.id, { amount: type === 'buy' ? current - total : current + total })
      }
    }
    onClose()
  }

  return (
    <Modal open title="Add Transaction" onClose={onClose}>
      <div className="space-y-3">
        <Select label="Type" value={type} onChange={e => setType(e.target.value)}>
          <option value="buy">Buy</option>
          <option value="sell">Sell</option>
        </Select>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Ticker</label>
          <TickerSearch value={ticker} onChange={setTicker} />
        </div>
        <Input label="Shares" type="number" value={shares} onChange={e => setShares(e.target.value)} min="0" step="0.001" />
        <Input label="Price per Share" type="number" value={price} onChange={e => setPrice(e.target.value)} min="0" step="0.01" />
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

export function TransactionList() {
  const [txns, setTxns] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState(null)

  function reload() { setTxns(db.list('transactions').sort((a,b) => b.date.localeCompare(a.date))) }
  useEffect(() => { reload() }, [])

  function handleDelete(id) {
    if (!confirm('Delete transaction?')) return
    db.delete('transactions', id)
    reload()
  }

  if (txns.length === 0) return (
    <div>
      <EmptyState icon="💼" title="No transactions" description="Record your buys and sells" action={<Button onClick={() => setShowAdd(true)}>Add Transaction</Button>} />
      {showAdd && <AddTransactionModal onClose={() => { setShowAdd(false); reload() }} />}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}>+ Add Transaction</Button>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500 border-b">
              <th className="pb-2 pr-3">Date</th>
              <th className="pb-2 pr-3">Type</th>
              <th className="pb-2 pr-3">Ticker</th>
              <th className="pb-2 pr-3">Shares</th>
              <th className="pb-2 pr-3">Price</th>
              <th className="pb-2 pr-3">Total</th>
              <th className="pb-2 pr-3">Account</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {txns.map(t => (
              <tr key={t.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-3 text-gray-500">{t.date}</td>
                <td className="py-2 pr-3"><Badge color={t.type === 'buy' ? 'green' : 'red'}>{t.type}</Badge></td>
                <td className="py-2 pr-3 font-medium">{t.ticker}</td>
                <td className="py-2 pr-3">{t.shares}</td>
                <td className="py-2 pr-3">${Number(t.price).toFixed(2)}</td>
                <td className="py-2 pr-3">${(t.shares * t.price).toFixed(2)}</td>
                <td className="py-2 pr-3 text-gray-500">{t.account}</td>
                <td className="py-2">
                  <button onClick={() => handleDelete(t.id)} className="text-gray-300 hover:text-red-500">✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showAdd && <AddTransactionModal onClose={() => { setShowAdd(false); reload() }} />}
    </div>
  )
}
