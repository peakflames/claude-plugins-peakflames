// Login demo for the web2video sign-in UAT case (AC-UAT-05).
// node server.mjs → http://127.0.0.1:4173 (loopback only; a fixed origin so a saved session
// matches between `capture signin` and the take). Any user name and password sign in.
import { createServer } from 'node:http';
const page = (body) => `<!doctype html><meta charset=utf-8><title>Demo</title><body>${body}</body>`;
createServer((req, res) => {
  const signedIn = /(?:^|; )session=demo(?:;|$)/.test(req.headers.cookie ?? '');
  if (req.method === 'POST' && req.url === '/login') {
    res.writeHead(303, { 'Set-Cookie': 'session=demo; Path=/; HttpOnly', Location: '/' });
    return res.end();
  }
  if (!signedIn) {
    res.writeHead(200, { 'content-type': 'text/html' });
    return res.end(page(`<h1>Sign in</h1><form method=post action=/login>
      <input name=user placeholder=User><input name=pass type=password placeholder=Password>
      <button>Sign in</button></form>`));
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(page(`<h1 data-testid=dash>Dashboard</h1><button id=report>Run report</button>
    <p id=out></p><script>report.onclick=()=>{out.textContent='Report ready: 42 rows'}</script>`));
}).listen(4173, '127.0.0.1', () => console.log('login demo on http://127.0.0.1:4173'));
