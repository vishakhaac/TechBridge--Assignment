import React, { useEffect, useMemo, useState } from 'react'
import { Pie, Line, Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS, ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement
} from 'chart.js'
import api from './api'

ChartJS.register(ArcElement, Tooltip, Legend,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement)

const PIE_COLORS = ['#f97316', '#60a5fa', '#34d399', '#f472b6', '#a78bfa', '#facc15', '#22d3ee']

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [view, setView] = useState('monthly')   // 'monthly' | 'yearly'
  const [period, setPeriod] = useState('all')   // 'all' or e.g. '2026-05' / '2026'

  useEffect(() => {
    api.get('/api/analytics').then(r => setData(r.data)).catch(console.error)
  }, [])

  useEffect(() => { setPeriod('all') }, [view])

  const periodOptions = useMemo(() => {
    if (!data) return []
    const buckets = view === 'yearly' ? (data.yearly || []) : (data.monthly || [])
    const key = view === 'yearly' ? 'year' : 'month'
    return Array.from(new Set(buckets.map(b => b[key]))).sort().reverse()
  }, [data, view])

  const charts = useMemo(() => {
    if (!data) return null
    const buckets = view === 'yearly' ? (data.yearly || []) : (data.monthly || [])
    const keyField = view === 'yearly' ? 'year' : 'month'

    let catList
    if (period === 'all') {
      catList = data.categories || []
    } else if (view === 'yearly') {
      catList = (data.categoriesByYear || {})[period] || []
    } else {
      catList = (data.categoriesByMonth || {})[period] || []
    }

    const pie = {
      labels: catList.map(c => c.category),
      datasets: [{
        data: catList.map(c => Number(c.total)),
        backgroundColor: PIE_COLORS
      }]
    }

    // When a specific period is picked, collapse trend charts to that
    // period so all charts stay in sync with the dropdown.
    const labels = period === 'all'
      ? Array.from(new Set(buckets.map(b => b[keyField]))).sort()
      : [period]
    const series = (t) => labels.map(k => {
      const r = buckets.find(x => x[keyField] === k && x.type === t)
      return r ? Number(r.total) : 0
    })

    const line = {
      labels,
      datasets: [
        { label: 'Income', data: series('income'), borderColor: '#10b981' },
        { label: 'Expense', data: series('expense'), borderColor: '#ef4444' }
      ]
    }

    const bar = {
      labels,
      datasets: [
        { label: 'Income', data: series('income'), backgroundColor: '#10b981' },
        { label: 'Expense', data: series('expense'), backgroundColor: '#ef4444' }
      ]
    }

    return { pie, line, bar, hasCategories: catList.length > 0 }
  }, [data, view, period])

  const summary = useMemo(() => {
    if (!data) return null
    let income, expense
    if (period === 'all') {
      const totals = data.totals || []
      income = Number(totals.find(t => t.type === 'income')?.total || 0)
      expense = Number(totals.find(t => t.type === 'expense')?.total || 0)
    } else {
      const buckets = view === 'yearly' ? (data.yearly || []) : (data.monthly || [])
      const keyField = view === 'yearly' ? 'year' : 'month'
      income = Number(buckets.find(b => b[keyField] === period && b.type === 'income')?.total || 0)
      expense = Number(buckets.find(b => b[keyField] === period && b.type === 'expense')?.total || 0)
    }
    return { income, expense, net: income - expense }
  }, [data, view, period])

  if (!data) return <div>Loading analytics...</div>

  const periodLabel = period === 'all' ? 'All time' : period

  return (
    <div>
      <h2>Dashboard</h2>

      <div className="view-toggle" style={{ margin: '8px 0', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setView('monthly')} disabled={view === 'monthly'}>Monthly</button>
        <button onClick={() => setView('yearly')} disabled={view === 'yearly'}>Yearly</button>

        <label style={{ marginLeft: 16 }}>Period:</label>
        <select value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="all">All time</option>
          {periodOptions.map(k => <option key={k} value={k}>{k}</option>)}
        </select>
      </div>

      <div className="summary">
        <span>Showing: {periodLabel}</span>{' · '}
        <span>Income: {summary.income.toFixed(2)}</span>{' · '}
        <span>Expense: {summary.expense.toFixed(2)}</span>{' · '}
        <span>Net: {summary.net.toFixed(2)}</span>
      </div>

      <div className="charts">
        <div className="chart">
          <h4>Category Distribution — Expenses ({periodLabel})</h4>
          {charts.hasCategories
            ? <Pie data={charts.pie} />
            : <div>No expense data for this period.</div>}
        </div>
        <div className="chart">
          <h4>{view === 'yearly' ? 'Yearly Trends' : 'Monthly Trends'}</h4>
          <Line data={charts.line} />
        </div>
        <div className="chart">
          <h4>Income vs Expense ({view === 'yearly' ? 'per year' : 'per month'})</h4>
          <Bar data={charts.bar} />
        </div>
      </div>
    </div>
  )
}
