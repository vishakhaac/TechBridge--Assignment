import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:4000'
})

api.interceptors.request.use((cfg) => {
  const token = localStorage.getItem('pft_token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

export default api
