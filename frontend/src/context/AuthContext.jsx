import { createContext, useContext, useEffect, useState } from 'react'
import { login as apiLogin, register as apiRegister, setAuthToken, setUnauthorizedHandler } from '../lib/api'

const TOKEN_KEY = 'reporevive:token'
const USER_KEY = 'reporevive:user'

const AuthContext = createContext(null)

function readStoredUser() {
  const raw = localStorage.getItem(USER_KEY)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY))
  const [user, setUser] = useState(readStoredUser)

  useEffect(() => {
    setAuthToken(token)
  }, [token])

  function logout() {
    setToken(null)
    setUser(null)
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  }

  // Runs once — the captured `logout` closes over the stable setState/localStorage
  // calls, so it stays correct even though this effect never re-runs.
  useEffect(() => {
    setUnauthorizedHandler(logout)
  }, [])

  function persist({ token: nextToken, user: nextUser }) {
    setToken(nextToken)
    setUser(nextUser)
    localStorage.setItem(TOKEN_KEY, nextToken)
    localStorage.setItem(USER_KEY, JSON.stringify(nextUser))
  }

  async function login(email, password) {
    persist(await apiLogin(email, password))
  }

  async function register(email, password) {
    persist(await apiRegister(email, password))
  }

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!token, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
