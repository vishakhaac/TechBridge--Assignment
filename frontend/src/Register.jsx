import React, { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { AuthContext } from './App'

export default function Register() {
  const { register } = useContext(AuthContext)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState(null)
  const nav = useNavigate()

  async function submit(e) {
    e.preventDefault()
    try {
      await register(name, email, password)
      nav('/dashboard')
    } catch (e) {
      setErr(e.response?.data?.message || 'Register failed')
    }
  }

  return (
    <div className="auth">
      <h2>Register</h2>
      {err && <div className="error">{err}</div>}
      <form onSubmit={submit}>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Name" />
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" />
        <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" />
        <button type="submit">Register</button>
      </form>
    </div>
  )
}
