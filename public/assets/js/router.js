// Routeur monopage basé sur l'History API.
const routes = [];
let cleanup = null;
let onNavigate = () => {};

export function route(pattern, view, opts = {}) {
  const keys = [];
  if (pattern === '*') { routes.push({ re: /(?!)/, keys, view, opts, pattern }); return; }
  const re = new RegExp('^' + pattern.replace(/\/:(\w+)/g, (_, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$');
  routes.push({ re, keys, view, opts, pattern });
}

export function setNavigateHook(fn) { onNavigate = fn; }

export function navigate(url, { replace = false } = {}) {
  if (replace) history.replaceState({}, '', url); else history.pushState({}, '', url);
  return render();
}

export async function render() {
  const path = location.pathname;
  const query = Object.fromEntries(new URLSearchParams(location.search));
  if (cleanup) { try { cleanup(); } catch { /* ignore */ } cleanup = null; }
  for (const r of routes) {
    const m = r.re.exec(path);
    if (!m) continue;
    const params = Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])]));
    const allowed = await onNavigate({ path, route: r, params, query });
    if (allowed === false) return;
    const result = await r.view({ params, query, path });
    if (typeof result === 'function') cleanup = result;
    return;
  }
  const notFound = routes.find((r) => r.pattern === '*');
  if (notFound) await notFound.view({ params: {}, query, path });
}

/** Intercepte les clics sur les liens internes. */
export function startRouter() {
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.target === '_blank' || a.hasAttribute('download') || e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
    e.preventDefault();
    navigate(url.pathname + url.search);
  });
  window.addEventListener('popstate', render);
  return render();
}
