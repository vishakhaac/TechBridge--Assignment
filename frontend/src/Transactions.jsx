import React, { useEffect, useState, useContext, useCallback, useMemo } from 'react'
import { FixedSizeList as List } from 'react-window'
import api from './api'
import { AuthContext } from './App'

function currentMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

const empty = { amount: '', type: 'expense', category: '', note: '', date: '' }

export default function Transactions() {
  const { user } = useContext(AuthContext)
  const readOnly = user?.role === 'read-only'

  // Single primary control: which month/year we are working in.
  const [activeMonth, setActiveMonth] = useState(currentMonth())

  const [page, setPage] = useState(1)
  const limit = 20
  const [filters, setFilters] = useState({ q: '', type: '', category: '' })
  const [sortBy, setSortBy] = useState('date-desc')
  const [data, setData] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(() => ({ ...empty, date: `${currentMonth()}-01` }))

  // Last 24 months as dropdown options
  const monthOptions = useMemo(() => {
    const now = new Date()
    const out = []
    for (let i = 0; i < 24; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }
    return out
  }, [])

  // Days in the active month — populates the form's day dropdown
  const dayOptions = useMemo(() => {
    const [y, m] = activeMonth.split('-').map(Number)
    const days = new Date(y, m, 0).getDate()
    return Array.from({ length: days }, (_, i) => String(i + 1).padStart(2, '0'))
  }, [activeMonth])

  // Switching the working month resets the form to that month, day 1.
  const onActiveMonthChange = useCallback((e) => {
    const m = e.target.value
    setActiveMonth(m)
    setPage(1)
    setEditingId(null)
    setForm({ ...empty, date: `${m}-01` })
  }, [])

  const formDay = form.date ? form.date.slice(8, 10) : '01'

  const onFormDayChange = useCallback((e) => {
    setForm(f => ({ ...f, date: `${activeMonth}-${e.target.value}` }))
  }, [activeMonth])

  // Build query params — always scoped to the active month.
  const params = useMemo(() => {
    const p = { page, limit, month: activeMonth }
    if (filters.q) p.q = filters.q
    if (filters.type) p.type = filters.type
    if (filters.category) p.category = filters.category
    return p
  }, [page, filters, activeMonth])

  const load = useCallback(async () => {
    const r = await api.get('/api/transactions', { params })
    setData(r.data)
  }, [params])

  useEffect(() => { load().catch(console.error) }, [load])

  const change = useCallback((e) => {
    const { name, value } = e.target
    setForm(f => ({ ...f, [name]: value }))
  }, [])

  const resetForm = useCallback(() => {
    setForm({ ...empty, date: `${activeMonth}-01` })
    setEditingId(null)
  }, [activeMonth])

  const submit = useCallback(async (e) => {
    e.preventDefault()
    if (editingId) {
      await api.put(`/api/transactions/${editingId}`, form)
    } else {
      await api.post('/api/transactions', form)
      setPage(1)
    }
    resetForm()
    load()
  }, [form, editingId, load, resetForm])

  const startEdit = useCallback((tx) => {
    // If the row is in a different month, switch the working month first.
    const rowMonth = tx.date.slice(0, 7)
    if (rowMonth !== activeMonth) setActiveMonth(rowMonth)
    setEditingId(tx.id)
    setForm({
      amount: String(tx.amount),
      type: tx.type,
      category: tx.category,
      note: tx.note || '',
      date: tx.date
    })
  }, [activeMonth])

  const remove = useCallback(async (id) => {
    if (!window.confirm('Delete?')) return
    await api.delete(`/api/transactions/${id}`)
    load()
  }, [load])

  const items = useMemo(() => {
    const rows = [...(data?.data || [])]
    switch (sortBy) {
      case 'date-asc': return rows.sort((a, b) => a.date.localeCompare(b.date))
      case 'amount-desc': return rows.sort((a, b) => Number(b.amount) - Number(a.amount))
      case 'amount-asc': return rows.sort((a, b) => Number(a.amount) - Number(b.amount))
      case 'date-desc':
      default: return rows.sort((a, b) => b.date.localeCompare(a.date))
    }
  }, [data, sortBy])

  const summary = useMemo(() => {
    if (!items.length) return { income: 0, expense: 0, avg: 0 }
    let income = 0, expense = 0
    for (const t of items) {
      if (t.type === 'income') income += Number(t.amount)
      else expense += Number(t.amount)
    }
    return { income, expense, avg: (income + expense) / items.length }
  }, [items])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / limit)) : 1

  const Row = ({ index, style }) => {
    const tx = items[index]
    return (
      <div className="tx-row" style={style}>
        <div>{tx.date}</div>
        <div>{tx.category}</div>
        <div>{tx.type}</div>
        <div>{tx.amount}</div>
        <div>{tx.note}</div>
        {!readOnly && (
          <>
            <button onClick={() => startEdit(tx)}>Edit</button>
            <button onClick={() => remove(tx.id)}>Delete</button>
          </>
        )}
      </div>
    )
  }

  return (
    <div>
      <h2>Transactions</h2>

      {/* Single primary control: pick the working month/year. */}
      <div className="month-bar" style={{ display: 'flex', gap: 8, alignItems: 'center', margin: '8px 0', flexWrap: 'wrap' }}>
        <label><b>Working month:</b></label>
        <select value={activeMonth} onChange={onActiveMonthChange}>
          {monthOptions.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <span style={{ color: '#6b7280' }}>Showing: {activeMonth}</span>
      </div>

      {readOnly ? (
        <div className="readonly">Read-only access</div>
      ) : (
        <form className="tx-form" onSubmit={submit}>
          <input name="amount" value={form.amount} onChange={change} placeholder="Amount" />
          <select name="type" value={form.type} onChange={change}>
            <option value="income">Income</option>
            <option value="expense">Expense</option>
          </select>
          <input name="category" value={form.category} onChange={change} placeholder="Category" />

          {/* Day-only — month/year already chosen at the top. */}
          <label>Day:</label>
          <select value={formDay} onChange={onFormDayChange}>
            {dayOptions.map(d => <option key={d} value={d}>{d}</option>)}
          </select>

          <input name="note" value={form.note} onChange={change} placeholder="Note" />
          <button type="submit">{editingId ? 'Save' : 'Add'}</button>
          {editingId && <button type="button" onClick={resetForm}>Cancel</button>}
        </form>
      )}

      <div className="filters" style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
        <input placeholder="Search note" value={filters.q}
          onChange={e => { setPage(1); setFilters(f => ({ ...f, q: e.target.value })) }} />
        <select value={filters.type}
          onChange={e => { setPage(1); setFilters(f => ({ ...f, type: e.target.value })) }}>
          <option value="">All types</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </select>
        <input placeholder="Category" value={filters.category}
          onChange={e => { setPage(1); setFilters(f => ({ ...f, category: e.target.value })) }} />
        <select value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="date-desc">Newest first</option>
          <option value="date-asc">Oldest first</option>
          <option value="amount-desc">Amount: high → low</option>
          <option value="amount-asc">Amount: low → high</option>
        </select>
      </div>

      {data && (
        <>
          <div className="tx-meta">
            Total rows: {data.total} · Income: {summary.income.toFixed(2)} ·
            Expense: {summary.expense.toFixed(2)} · Avg amount: {summary.avg.toFixed(2)}
          </div>
          <List height={400} itemCount={items.length} itemSize={48} width={'100%'}>{Row}</List>
          <div className="pagination" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
            <span>Page {page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        </>
      )}
    </div>
  )
}
