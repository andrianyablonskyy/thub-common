/**
 * @file        packages/shared/src/remote.js
 * @description Remote board access (README §5.6): the WebSocket protocol the Agent, Coordinator and Client relay a
 *              reserved board's UARTs and SWD (OpenOCD's GDB server) over
 *
 * @author      Andrian Yablonskyy
 * @copyright   Copyright (c) 2026 Andrian Yablonskyy. All rights reserved.
 *
 * This file is part of TestHub and is proprietary and confidential.
 * Unauthorized copying, modification, distribution, or use of this file,
 * via any medium, is strictly prohibited without prior written permission
 * from AdSystem.PRO.
 */

'use strict';

// Two WebSockets, relayed by the Coordinator: the Agent's session
// (`thub connect`, /api/v1/resources/<client>/remote) and the Client's link
// (/api/v1/resources/<id>/remote-link, up while the runner is reserved).
// Each carries any number of channels — one per local TCP connection on the
// Agent's side: a UART, or a GDB connection to an OpenOCD the Client starts
// for it.
//
// Binary messages are a channel's bytes: a 2-byte big-endian channel id,
// then the data. Text messages are JSON control messages, `t` saying which:
//   Agent → Client   open {ch, kind: 'uart'|'swd', index, target?}, close {ch}
//   Client → Agent   devices {uarts, probes, serial}, opened {ch}, note {ch, text},
//                    close {ch, reason?}
//   Coordinator →    status {state: 'waiting'|'ready', client, until} (Agent)
// The holder may run several sessions at once: each numbers its channels
// itself, and the Coordinator maps them onto the link's own ids.
const REMOTE_KINDS = ['uart', 'swd'],
  MAX_CHANNEL = 0xffff,
  // Per message: a UART's bytes come in small chunks; GDB's (a flash
  // download) in bigger ones, split to this.
  MAX_CHUNK = 32 * 1024,
  // Close codes that end a session for good — the Agent doesn't reconnect.
  CLOSE = {
    RESERVATION_ENDED: 4001,
    REPLACED: 4002
  },
  // OpenOCD target script names (target/<name>.cfg): no paths, no options.
  OPENOCD_TARGET_RE = /^[A-Za-z0-9_.-]{1,64}$/;

function encodeData(ch, data){
  const buf = Buffer.allocUnsafe(2 + data.length);
  buf.writeUInt16BE(ch, 0);
  (Buffer.isBuffer(data) ? data : Buffer.from(data)).copy(buf, 2);
  return buf;
}

// { ch, data } of a binary message, or null if it's too short to be one.
function decodeData(buf){
  return buf.length >= 2 ? { ch: buf.readUInt16BE(0), data: buf.subarray(2) } : null;
}

// Splits `data` into MAX_CHUNK-sized binary messages for channel `ch`.
function* dataMessages(ch, data){
  for (let i = 0; i < data.length; i += MAX_CHUNK){
    yield encodeData(ch, data.subarray(i, i + MAX_CHUNK));
  }
}

// A control message as an object, or null when it isn't valid JSON with a `t`.
function parseControl(text){
  try {
    const msg = JSON.parse(String(text));
    return msg && typeof msg === 'object' && typeof msg.t === 'string' ? msg : null;
  }
  catch {
    return null;
  }
}

const isChannel = (ch) => Number.isInteger(ch) && ch >= 1 && ch <= MAX_CHANNEL;

// What the Agent may send through the Coordinator, checked there (and again
// on the Client): an open with a known kind and a device index, or a close.
// Returns the cleaned message or null.
function agentControl(msg){
  if (msg?.t === 'close' && isChannel(msg.ch)){
    return { t: 'close', ch: msg.ch };
  }
  if (msg?.t === 'open' && isChannel(msg.ch) && REMOTE_KINDS.includes(msg.kind) && Number.isInteger(msg.index) && msg.index >= 1 && msg.index <= 64){
    if (msg.target !== undefined && (typeof msg.target !== 'string' || !OPENOCD_TARGET_RE.test(msg.target))){
      return null;
    }
    return { t: 'open', ch: msg.ch, kind: msg.kind, index: msg.index, ...(msg.target ? { target: msg.target } : {}) };
  }
  return null;
}

// The ws:// or wss:// URL of an /api/v1 path on the Coordinator at `baseUrl`.
function remoteUrl(baseUrl, path){
  return `${String(baseUrl).replace(/\/+$/, '').replace(/^http/, 'ws')}/api/v1${path}`;
}

// Reconnect delays: 1 s, 2 s, 4 s … up to `maxMs`, with ±20 % jitter.
function backoffMs(attempt, maxMs = 30_000){
  const base = Math.min(maxMs, 1000 * 2 ** Math.max(0, attempt));
  return Math.round(base * (0.8 + Math.random() * 0.4));
}

module.exports = {
  REMOTE_KINDS, REMOTE_MAX_CHUNK: MAX_CHUNK, REMOTE_CLOSE: CLOSE, OPENOCD_TARGET_RE,
  encodeData, decodeData, dataMessages, parseControl, agentControl, remoteUrl, backoffMs
};
