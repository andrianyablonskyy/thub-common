/**
 * @file        packages/shared/src/api-client.js
 * @description Fetch-based HTTP client with SSE parsing, shared by the Agent and Client
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

/**
 * A thin wrapper around fetch() for talking to the Coordinator's
 * /api/v1 surface. Shared by the Agent CLI and the Client daemon so
 * both speak the exact same protocol (README.md §1: "This keeps CI
 * and manual usage identical").
 */
class ApiClient{
  constructor({ baseUrl, token }){
    if (!baseUrl){
      throw new Error('ApiClient requires baseUrl');
    }
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  _url(path){
    return `${this.baseUrl}/api/v1${path}`;
  }

  _headers(extra = {}){
    const headers = { ...extra };
    if (this.token){
      headers.Authorization = `Bearer ${this.token}`;
    }
    return headers;
  }

  async request(method, path, { body, headers, query, signal } = {}){
    let url = this._url(path);
    if (query){
      const qs = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
      ).toString();
      if (qs){
        url += `?${qs}`;
      }
    }

    const isJsonBody = body !== undefined && !(body instanceof FormData),
      res = await fetch(url, {
        method,
        signal,
        headers: this._headers({
          ...(isJsonBody ? { 'Content-Type': 'application/json' } : {}),
          ...headers
        }),
        body: isJsonBody ? JSON.stringify(body) : body
      }),

      text = await res.text(),
      data = text ? safeJson(text) : undefined;

    if (!res.ok){
      const err = new Error((data && data.error) || `HTTP ${res.status}`);
      err.status = res.status;
      err.body = data;
      throw err;
    }
    return data;
  }

  get(path, opts){
    return this.request('GET', path, opts);
  }

  post(path, body, opts){
    return this.request('POST', path, { ...opts, body });
  }

  /**
   * Opens a Server-Sent-Events stream and invokes onEvent({event, id, data})
   * for each event. Resolves when the stream ends (server closes it, e.g.
   * on job.end) or rejects on network error / abort.
   */
  async streamEvents(path, { lastEventId, signal, onEvent, query } = {}){
    let url = this._url(path);
    if (query){
      const qs = new URLSearchParams(
        Object.entries(query).filter(([, v]) => v !== undefined && v !== null)
      ).toString();
      if (qs){
        url += `?${qs}`;
      }
    }

    const headers = this._headers({ Accept: 'text/event-stream' });
    if (lastEventId){
      headers['Last-Event-ID'] = String(lastEventId);
    }

    const res = await fetch(url, { headers, signal });
    if (!res.ok){
      const err = new Error(`HTTP ${res.status}`);
      err.status = res.status;
      throw err;
    }

    const reader = res.body.getReader(),
      decoder = new TextDecoder();
    let buf = '';

    while (true){
      const { done, value } = await reader.read();
      if (done){
        break;
      }
      buf += decoder.decode(value, { stream: true });

      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1){
        const rawEvent = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const parsed = parseSseEvent(rawEvent);
        if (parsed){
          onEvent(parsed);
        }
      }
    }
  }
}

function parseSseEvent(raw){
  let event = 'message',
    id;
  const dataLines = [];
  for (const line of raw.split('\n')){
    if (line.startsWith('event:')){
      event = line.slice(6).trim();
    }
    else if (line.startsWith('id:')){
      id = line.slice(3).trim();
    }
    else if (line.startsWith('data:')){
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0 && !id){
    return null;
  }
  const rawData = dataLines.join('\n');
  return { event, id, data: safeJson(rawData) ?? rawData };
}

function safeJson(text){
  try {
    return JSON.parse(text);
  }
  catch {
    return undefined;
  }
}

module.exports = { ApiClient };
