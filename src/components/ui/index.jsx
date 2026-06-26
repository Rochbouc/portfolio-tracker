import React from 'react'
import { clsx } from 'clsx'

export function Button({ children, onClick, variant = 'primary', size = 'md', disabled, className, type = 'button' }) {
  const base = 'inline-flex items-center justify-center font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed'
  const variants = {
    primary: 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500',
    secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-400',
    danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
    ghost: 'text-gray-600 hover:bg-gray-100 focus:ring-gray-400',
    outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-400',
  }
  const sizes = { sm: 'px-2.5 py-1 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-2.5 text-base' }
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={clsx(base, variants[variant], sizes[size], className)}>
      {children}
    </button>
  )
}

export function Card({ children, className }) {
  return <div className={clsx('bg-white rounded-xl shadow-sm border border-gray-200', className)}>{children}</div>
}

export function Input({ label, value, onChange, placeholder, type = 'text', className, disabled, min, max, step }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && <label className="text-xs font-medium text-gray-600">{label}</label>}
      <input
        type={type} value={value} onChange={onChange} placeholder={placeholder}
        disabled={disabled} min={min} max={max} step={step}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-50"
      />
    </div>
  )
}

export function Select({ label, value, onChange, children, className }) {
  return (
    <div className={clsx('flex flex-col gap-1', className)}>
      {label && <label className="text-xs font-medium text-gray-600">{label}</label>}
      <select
        value={value} onChange={onChange}
        className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        {children}
      </select>
    </div>
  )
}

export function Modal({ open, onClose, title, children, width = 'max-w-lg' }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div className={clsx('relative bg-white rounded-2xl shadow-xl w-full max-h-[90vh] overflow-y-auto', width)} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">&times;</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function Badge({ children, color = 'gray' }) {
  const colors = {
    gray: 'bg-gray-100 text-gray-700',
    green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700',
    blue: 'bg-blue-100 text-blue-700',
    yellow: 'bg-yellow-100 text-yellow-700',
    purple: 'bg-purple-100 text-purple-700',
  }
  return <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium', colors[color])}>{children}</span>
}

export function Spinner({ size = 'md' }) {
  const sizes = { sm: 'w-4 h-4', md: 'w-6 h-6', lg: 'w-8 h-8' }
  return (
    <div className={clsx('animate-spin rounded-full border-2 border-gray-200 border-t-blue-600', sizes[size])} />
  )
}

export function Tabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-1 border-b border-gray-200">
      {tabs.map(t => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={clsx(
            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            active === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function EmptyState({ icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon && <div className="text-4xl mb-3">{icon}</div>}
      <p className="font-medium text-gray-700 mb-1">{title}</p>
      {description && <p className="text-sm text-gray-500 mb-4">{description}</p>}
      {action}
    </div>
  )
}
