// Login fixture (web2video-plan §7 "Login demo", WP14). A tiny app on 127.0.0.1 behind a cookie:
// without `session=<token>` every page is the sign-in form (on a red page, so a still shows it at a
// glance); POST /login sets the HttpOnly cookie and redirects to the dashboard (white). Nothing is
// checked at sign-in: never type a real password here.
//   node server.mjs [port] [token]   → http://127.0.0.1:4173 (token "demo"), for capture signin by hand
//   startLoginServer({port, token})  → {url, port, close} for the evals
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const page = (title, bg, body) => `<!doctype html><meta charset=utf-8><title>${title}</title>
<style>body{margin:0;min-height:100vh;font:24px/1.4 system-ui,sans-serif;background:${bg};color:#111;padding:48px;box-sizing:border-box}
input,button{font:inherit;margin:8px 8px 8px 0;padding:8px 12px}</style><body>${body}</body>`;

export const SIGNIN_BG = '#d0302a';
export const DASH_BG = '#ffffff';

export function startLoginServer({ port = 0, token = 'demo' } = {}) {
  const server = createServer((req, res) => {
    const signedIn = (req.headers.cookie ?? '').split(/;\s*/).includes(`session=${token}`);
    if (req.method === 'POST' && req.url === '/login') {
      req.resume();
      res.writeHead(303, { 'Set-Cookie': `session=${token}; Path=/; HttpOnly; SameSite=Lax`, Location: '/' });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' });
    if (!signedIn) {
      return res.end(page('Sign in', SIGNIN_BG, `<h1 id=signin>Sign in</h1><form method=post action=/login>
        <input name=user placeholder=User><input name=pass type=password placeholder=Password>
        <button id=go>Sign in</button></form>`));
    }
    res.end(page('Dashboard', DASH_BG, `<h1 data-testid=dash>Dashboard</h1><button id=report>Run report</button>
      <p id=out></p><script>report.onclick=()=>{out.textContent='Report ready: 42 rows'}</script>`));
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const p = server.address().port;
      resolve({ url: `http://127.0.0.1:${p}/`, port: p, close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(r); }) });
    });
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const s = await startLoginServer({ port: Number(process.argv[2] ?? 4173), token: process.argv[3] ?? 'demo' });
  process.stdout.write(`login fixture on ${s.url} (Ctrl-C to stop)\n`);
}
