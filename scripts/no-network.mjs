import { syncBuiltinESMExports } from "node:module";
import net from "node:net";
import tls from "node:tls";
import http from "node:http";
import https from "node:https";
import http2 from "node:http2";
import dgram from "node:dgram";
import dns from "node:dns";

// Test/demo-process guard, not an OS security boundary. No project module has network clients.
const blocked = () => { throw new Error("Network access is disabled for Phase 0 tests and demo."); };
for (const module of [http, https]) {
  module.request = blocked;
  module.get = blocked;
  module.createServer = blocked;
}
net.connect = blocked;
net.createConnection = blocked;
net.createServer = blocked;
net.Socket.prototype.connect = blocked;
net.Server.prototype.listen = blocked;
tls.connect = blocked;
tls.createServer = blocked;
http2.connect = blocked;
http2.createServer = blocked;
http2.createSecureServer = blocked;
dgram.createSocket = blocked;
for (const name of ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"]) {
  dns[name] = blocked;
  dns.promises[name] = blocked;
  if (name in dns.Resolver.prototype) dns.Resolver.prototype[name] = blocked;
  if (name in dns.promises.Resolver.prototype) dns.promises.Resolver.prototype[name] = blocked;
}
globalThis.fetch = async () => blocked();
globalThis.WebSocket = class { constructor() { blocked(); } };
syncBuiltinESMExports();
globalThis[Symbol.for("creator-intelligence.network-disabled")] = true;
