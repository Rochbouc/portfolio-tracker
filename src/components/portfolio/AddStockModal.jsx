import React, { useState } from 'react'
import { db } from '../../api/localData'
import { Modal, Button, Input, Select } from '../ui/index.jsx'
import TickerSearch from './TickerSearch.jsx'

const SECTORS = ['Technology','Financials','Healthcare','Energy','Materials','Industrials','Consumer Discretionary','Consumer Staples','Utilities','Real Estate','Communication Services','ETF','Other']

export default function AddStockModal({ onClose }) {
  const accounts = db.list('accounts')
  const [ticker, setTicker] = useState('')
  const [sector, setSector] = useState('Other')
  const [account, setAccount] = useState(accounts[0]?.name || '')
  const [saving, setSaving] = useState(false)

  function handleSave() {
    if (!ticker.trim()) return
    const existing = db.list('stocks').find(s => s.ticker === ticker.trim().toUpperCase())
    if (existing) { alert('This ticker already exists'); return }
    setSaving(true)
    db.create('stocks', { ticker: ticker.trim().toUpperCase(), sector, account })
    onClose()
  }

  return (
    <Modal open title="Add Stock" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">Ticker Symbol</label>
          <TickerSearch value={ticker} onChange={setTicker} />
        </div>
        <Select label="Sector" value={sector} onChange={e => setSector(e.target.value)}>
          {SECTORS.map(s => <option key={s}>{s}</option>)}
        </Select>
        {accounts.length > 0 && (
          <Select label="Account" value={account} onChange={e => setAccount(e.target.value)}>
            {accounts.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
          </Select>
        )}
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={!ticker.trim() || saving}>Add Stock</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
