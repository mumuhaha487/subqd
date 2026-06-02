// 09subing Cloudflare Worker
// Injects BACKEND_URL env var into the frontend + proxies /api/* to backend
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Proxy /api/* and /sub/* to backend (via BACKEND_URL env var)
    if (path.startsWith('/api/') || path.startsWith('/sub/')) {
      const backendUrl = env.BACKEND_URL;
      if (!backendUrl) {
        return new Response(JSON.stringify({ error: 'BACKEND_URL not configured in Cloudflare Worker env vars' }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
      const target = `${backendUrl.replace(/\/+$/, '')}${path}${url.search}`;
      const headers = new Headers(request.headers);
      headers.delete('host');
      const init = { method: request.method, headers, redirect: 'follow' };
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        init.body = await request.text();
      }
      try {
        const res = await fetch(target, init);
        const rh = new Headers(res.headers);
        rh.set('Access-Control-Allow-Origin', '*');
        return new Response(res.body, { status: res.status, headers: rh });
      } catch {
        return new Response(JSON.stringify({ error: 'Backend unreachable' }), {
          status: 502, headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // For asset requests, serve from static assets
    try {
      const asset = await env.ASSETS.fetch(request);
      if (asset.status !== 404) {
        // Inject BACKEND_URL env var into HTML response
        const ct = asset.headers.get('content-type') || '';
        if (ct.includes('text/html')) {
          const html = await asset.text();
          const injected = html.replace(
            "const API = getApiBase();",
            `const API = '${env.BACKEND_URL || ''}';`
          );
          return new Response(injected, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
        }
        return asset;
      }
    } catch (e) {}

    // SPA fallback: serve index.html
    const indexAsset = await env.ASSETS.fetch(new Request(new URL('/index.html', url.origin)));
    const html = await indexAsset.text();
    const injected = html.replace(
      "const API = getApiBase();",
      `const API = '${env.BACKEND_URL || ''}';`
    );
    return new Response(injected, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }
};
