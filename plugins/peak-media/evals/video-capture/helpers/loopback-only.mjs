// Preload (`node --import <this>`) for capture runs: like helpers/no-network.mjs, but loopback is
// allowed, because capture serves local pages on 127.0.0.1 (its listen() resolves the address).
// Any other connection or lookup prints "NETWORK-ATTEMPT <target>" to stderr and fails, so an
// OpenRouter call (or any other) shows up in the log (AC-REC-10).
import net from 'node:net';
import dns from 'node:dns';

const LOOPBACK = /^(127\.\d+\.\d+\.\d+|::1|localhost|::ffff:127\.\d+\.\d+\.\d+)$/i;
const note = (t) => { process.stderr.write(`NETWORK-ATTEMPT ${t}\n`); };

const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const o = Array.isArray(args[0]) ? args[0][0] : args[0];
  if (typeof o === 'object' && o?.path) return origConnect.apply(this, args); // unix sockets are local
  const host = typeof o === 'object' ? (o.host ?? 'localhost') : (typeof args[1] === 'string' ? args[1] : 'localhost');
  if (LOOPBACK.test(String(host))) return origConnect.apply(this, args);
  const target = typeof o === 'object' ? `${o.host}:${o.port}` : `${host}:${o}`;
  note(target);
  throw new Error(`network blocked (${target})`);
};

const origLookup = dns.lookup;
dns.lookup = function (host, ...rest) {
  if (LOOPBACK.test(String(host))) return origLookup.call(this, host, ...rest);
  note(`dns:${host}`);
  const cb = rest.at(-1);
  if (typeof cb === 'function') cb(new Error('network blocked'));
};
const origPLookup = dns.promises.lookup;
dns.promises.lookup = async (host, ...rest) => {
  if (LOOPBACK.test(String(host))) return origPLookup(host, ...rest);
  note(`dns:${host}`); throw new Error('network blocked');
};
dns.promises.resolve = async (host) => { note(`dns:${host}`); throw new Error('network blocked'); };

const origFetch = globalThis.fetch;
globalThis.fetch = async (url, ...rest) => {
  const u = new URL(String(url?.url ?? url));
  if (LOOPBACK.test(u.hostname.replace(/^\[|\]$/g, ''))) return origFetch(url, ...rest);
  note(String(u));
  throw new Error(`network blocked (${u})`);
};
