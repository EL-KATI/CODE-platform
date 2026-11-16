/**
 * API client — mirrors public/assets/js/api.js but uses fetch with credentials.
 */

const BASE = '/api'

async function request(method, path, body) {
  const opts = {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(BASE + path, opts)
  if (!res.ok) {
    let err
    try { err = await res.json() } catch { err = { error: res.statusText } }
    throw Object.assign(new Error(err.error || res.statusText), { status: res.status, data: err })
  }
  if (res.status === 204) return null
  return res.json()
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),

  // Multipart upload helper
  async upload(path, formData) {
    const res = await fetch(BASE + path, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    })
    if (!res.ok) {
      let err
      try { err = await res.json() } catch { err = { error: res.statusText } }
      throw Object.assign(new Error(err.error || res.statusText), { status: res.status })
    }
    return res.json()
  },
}
