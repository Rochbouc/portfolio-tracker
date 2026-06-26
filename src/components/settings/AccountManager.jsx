import React, { useState, useEffect } from 'react'
import { db } from '../../api/localData'
import { Button, Modal, Input, Select, Card, EmptyState } from '../ui/index.jsx'

export function AccountManager() {
  const [accounts, setAccounts] = useState([])
  const [cash, setCash] = useState([])
  const [showAdd, setShowAdd] = useState(false)
  const [showCash, setShowCash] = useState(null)

  function reload() {
    setAccounts(db.list('accounts'))
    setCash(db.list('cashEntries'))
  }
  useEffect(() => { reload() }, [])

  function getCash(accountName) {
    return cash.find(c => c.account === accountName)
  }

  function deleteAccount(id) {
    if (!confirm('Delete account?')) return
    db.delete('accounts', id)
    reload()
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setShowAdd(true)}>+ Add Account</Button>
      </div>
      {accounts.length === 0 && <EmptyState icon="🏦" title="No accounts" description="Create accounts to organize your portfolio" />}
      <div className="grid gap-3 sm:grid-cols-2">
        {accounts.map(a => {
          const cashEntry = getCash(a.name)
          const cashAmt = cashEntry ? parseFloat(cashEntry.amount) : 0
          return (
            <Card key={a.id} className="p-4">
              <div className="flex justify-between items-start">
                <div>
                  <div className="font-semibold text-gray-900">{a.name}</div>
                  <div className="text-xs text-gray-500">{a.type} · {a.currency}</div>
                </div>
                <button onClick={() => deleteAccount(a.id)} className="text-gray-300 hover:text-red-500 text-sm">✕</button>
              </div>
              <div className="mt-3 flex items-center justify-between">
                <div>
                  <div className="text-xs text-gray-500">Cash Balance</div>
                  <div className="font-bold text-green-700">{a.currency === 'CAD' ? 'CA$' : '$'}{cashAmt.toFixed(2)}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => setShowCash(a)}>Edit Cash</Button>
              </div>
            </Card>
          )
        })}
      </div>

      {showAdd && <AddAccountModal onClose={() => { setShowAdd(false); reload() }} />}
      {showCash && <EditCashModal account={showCash} cashEntries={cash} onClose={() => { setShowCash(null); reload() }} />}
    </div>
  )
}

function AddAccountModal({ onClose }) {
  const [name, setName] = useState('')
  const [type, setType] = useState('TFSA')
  const [currency, setCurrency] = useState('CAD')
  const [initialCash, setInitialCash] = useState('0')

  function handleSave() {
    if (!name.trim()) return
    db.create('accounts', { name: name.trim(), type, currency })
    const cashList = db.list('cashEntries')
    if (!cashList.find(c => c.account === name.trim())) {
      db.create('cashEntries', { account: name.trim(), amount: parseFloat(initialCash) || 0, currency })
    }
    onClose()
  }

  return (
    <Modal open title="Add Account" onClose={onClose}>
      <div className="space-y-3">
        <Input label="Account Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. My TFSA" />
        <Select label="Account Type" value={type} onChange={e => setType(e.target.value)}>
          <option>TFSA</option><option>RRSP</option><option>FHSA</option>
          <option>Margin</option><option>Cash</option><option>401k</option>
          <option>IRA</option><option>Roth IRA</option><option>Other</option>
        </Select>
        <Select label="Currency" value={currency} onChange={e => setCurrency(e.target.value)}>
          <option value="CAD">CAD</option>
          <option value="USD">USD</option>
        </Select>
        <Input label="Initial Cash Balance" type="number" value={initialCash} onChange={e => setInitialCash(e.target.value)} min="0" step="0.01" />
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={!name.trim()}>Create Account</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}

function EditCashModal({ account, cashEntries, onClose }) {
  const existing = cashEntries.find(c => c.account === account.name)
  const [amount, setAmount] = useState(existing ? String(existing.amount) : '0')

  function handleSave() {
    const a = parseFloat(amount) || 0
    if (existing) {
      db.update('cashEntries', existing.id, { amount: a })
    } else {
      db.create('cashEntries', { account: account.name, amount: a, currency: account.currency })
    }
    onClose()
  }

  return (
    <Modal open title={`Cash Balance — ${account.name}`} onClose={onClose}>
      <div className="space-y-3">
        <Input label={`Cash Balance (${account.currency})`} type="number" value={amount} onChange={e => setAmount(e.target.value)} min="0" step="0.01" />
        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave}>Save</Button>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
        </div>
      </div>
    </Modal>
  )
}
