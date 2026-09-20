import assert from "node:assert/strict";
import { test } from "node:test";
import { get } from "node:https";
import { connect, createServer } from "node:net";
import { lookup } from "node:dns/promises";

test("the preloaded guard blocks HTTP, sockets, DNS, fetch, and listeners before I/O", async () => {
  assert.throws(() => get("https://example.invalid"), /Network access is disabled/);
  assert.throws(() => connect({ host: "example.invalid", port: 443 }), /Network access is disabled/);
  assert.throws(() => lookup("example.invalid"), /Network access is disabled/);
  assert.throws(() => createServer(), /Network access is disabled/);
  await assert.rejects(fetch("https://example.invalid"), /Network access is disabled/);
});
