import React, {
  Suspense, createContext, useContext, useState, useEffect, useCallback, useMemo
} from 'react'
import { Routes, Route, Link, Navigate, useNavigate } from 'react-router-dom'
import api from './api'

export const AuthContext = createContext(null)
export const ThemeContext = createContext(null)

function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('pft_user')) || null }
    catch { return null }
  })

  useEffect(() => {
    if (user) localStorage.setItem('pft_user', JSON.stringify(user))
    else localStorage.removeItem('pft_user')
  }, [user])

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/api/auth/login', { email, password })
    localStorage.setItem('pft_token', data.token)
    setUser(data.user)
  }, [])

  const register = useCallback(async (name, email, password) => {
    const { data } = await api.post('/api/auth/register', { name, email, password })
    localStorage.setItem('pft_token', data.token)
    setUser(data.user)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem('pft_token')
    setUser(null)
  }, [])

  const value = useMemo(() => ({ user, login, register, logout }),
    [user, login, register, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function ThemeProvider({ children }) {
  const [dark, setDark] = useState(false)
  return <ThemeContext.Provider value={{ dark, setDark }}>{children}</ThemeContext.Provider>
}

function RequireAuth({ children }) {
  const { user } = useContext(AuthContext)
  return user ? children : <Navigate to="/login" replace />
}

const Login = React.lazy(() => import('./Login'))
const Register = React.lazy(() => import('./Register'))
const Dashboard = React.lazy(() => import('./Dashboard'))
const Transactions = React.lazy(() => import('./Transactions'))

function NavBar() {
  const { user, logout } = useContext(AuthContext)
  const { dark, setDark } = useContext(ThemeContext)
  const nav = useNavigate()
  return (
    <nav>
      <Link to="/dashboard">Dashboard</Link>
      <Link to="/transactions">Transactions</Link>
      <button onClick={() => setDark(d => !d)}>{dark ? 'Light' : 'Dark'}</button>
      {user ? (
        <>
          <span style={{ marginLeft: 8 }}>{user.name} ({user.role})</span>
          <button onClick={() => { logout(); nav('/login') }}>Logout</button>
        </>
      ) : (
        <>
          <Link to="/login">Login</Link>
          <Link to="/register">Register</Link>
        </>
      )}
    </nav>
  )
}

function Shell() {
  const { dark } = useContext(ThemeContext)
  return (
    <div className={`app ${dark ? 'dark' : ''}`}>
      <header>
        <h1>Personal Finance Tracker</h1>
        <NavBar />
      </header>
      <main>
        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
            <Route path="/transactions" element={<RequireAuth><Transactions /></RequireAuth>} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Shell />
      </ThemeProvider>
    </AuthProvider>
  )
}
