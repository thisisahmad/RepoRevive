const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'failed_unfixable', 'unsupported_stack'])

export function isTerminalStatus(status) {
  return TERMINAL_STATUSES.has(status)
}

let authToken = null
export function setAuthToken(token) {
  authToken = token
}

let onUnauthorized = null
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn
}

async function readJson(res) {
  try {
    return await res.json()
  } catch {
    return null
  }
}

async function request(path, { method = 'GET', body, auth = false } = {}) {
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (auth && authToken) headers.Authorization = `Bearer ${authToken}`

  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await readJson(res)
  if (!res.ok) {
    if (auth && res.status === 401) onUnauthorized?.()
    throw new Error(data?.error || `Request failed (${res.status})`)
  }
  return data
}

export function register(email, password) {
  return request('/api/auth/register', { method: 'POST', body: { email, password } })
}

export function login(email, password) {
  return request('/api/auth/login', { method: 'POST', body: { email, password } })
}

export function createJob(repoUrl) {
  return request('/api/jobs', { method: 'POST', body: { repoUrl }, auth: true })
}

export function getJob(id) {
  return request(`/api/jobs/${id}`, { auth: true })
}

export function listJobs() {
  return request('/api/jobs', { auth: true })
}

/** Binary response, so it can't go through request()'s res.json() path. */
export async function downloadJobZip(id) {
  const res = await fetch(`${API_URL}/api/jobs/${id}/download`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
  })
  if (!res.ok) {
    if (res.status === 401) onUnauthorized?.()
    const data = await readJson(res)
    throw new Error(data?.error || `Download failed (${res.status})`)
  }
  return res.blob()
}
