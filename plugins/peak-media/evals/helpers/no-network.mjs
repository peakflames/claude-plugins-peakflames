// Preload (`node --import <this>`) that blocks and records network use.
// Any attempt prints "NETWORK-ATTEMPT <target>" to stderr and fails.
import net from 'node:net';
import dns from 'node:dns';
const note = (t) => { process.stderr.write(`NETWORK-ATTEMPT ${t}\n`); };
const origConnect = net.Socket.prototype.connect;
net.Socket.prototype.connect = function (...args) {
  const o = Array.isArray(args[0]) ? args[0][0] : args[0];
  const target = typeof o === 'object' ? (o.path ?? `${o.host}:${o.port}`) : String(o);
  if (typeof o === 'object' && o.path) return origConnect.apply(this, args); // unix sockets are local
  note(target);
  throw new Error(`network blocked (${target})`);
};
dns.lookup = (host, ...rest) => { note(`dns:${host}`); const cb = rest.at(-1); if (typeof cb === 'function') cb(new Error('network blocked')); };
dns.promises.lookup = async (host) => { note(`dns:${host}`); throw new Error('network blocked'); };
dns.promises.resolve = async (host) => { note(`dns:${host}`); throw new Error('network blocked'); };
globalThis.fetch = async (url) => { note(String(url)); throw new Error(`network blocked (${url})`); };
