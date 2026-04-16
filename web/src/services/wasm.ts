// WASM loader service — encrypted WASM (Scheme B)
//
// Flow:
//   1. Fetch AES-256-GCM key from Worker (requires JWT auth)
//   2. Fetch the encrypted .wasm asset (12-byte IV || ciphertext)
//   3. Decrypt in memory → pass raw bytes to wasm-bindgen init()

import type { SteegParser } from '../pkg/steeg_wasm.js';
export type { SteegParser };

import encWasmUrl from '../pkg/steeg_wasm_bg.wasm?url';

const API_BASE = import.meta.env.VITE_API_BASE ?? 'https://artisebio-api.swlucifer.workers.dev';

export interface WasmApi {
  SteegParser: typeof SteegParser;
  [key: string]: unknown;
}

async function fetchWasmKey(): Promise<string> {
  const cookieToken = document.cookie.match(/steeg_token=([^;]+)/)?.[1];
  const lsToken = localStorage.getItem('steeg_token');
  const raw = cookieToken ?? lsToken ?? null;
  const token = raw ? decodeURIComponent(raw) : null;
  console.log('[WASM] fetching key, token present:', !!token);
  const res = await fetch(`${API_BASE}/api/wasm-key?app=nfb`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`WASM key fetch failed: ${res.status} ${body}`);
  }
  const { key } = await res.json() as { key: string };
  console.log('[WASM] key received, length:', key.length);
  return key;
}

async function decryptWasm(encBytes: ArrayBuffer, keyHex: string): Promise<ArrayBuffer> {
  const keyBytes = Uint8Array.from(keyHex.match(/.{2}/g)!.map(h => parseInt(h, 16)));
  const iv  = encBytes.slice(0, 12);
  const ct  = encBytes.slice(12);
  const cryptoKey = await crypto.subtle.importKey(
    'raw', keyBytes, { name: 'AES-GCM' }, false, ['decrypt']
  );
  return crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ct);
}

class WasmService {
  private _initialized = false;
  private _module: WasmApi | null = null;

  async init(): Promise<void> {
    if (this._initialized) return;

    console.log('[WASM] init start');
    const pkg = await import('../pkg/steeg_wasm.js');

    const [keyHex, encResp] = await Promise.all([
      fetchWasmKey(),
      fetch(encWasmUrl),
    ]);
    const encBytes = await encResp.arrayBuffer();
    console.log('[WASM] encrypted bytes:', encBytes.byteLength);
    const wasmBytes = await decryptWasm(encBytes, keyHex);
    console.log('[WASM] decrypted bytes:', wasmBytes.byteLength);
    await pkg.default(new Uint8Array(wasmBytes));

    this._module = pkg as unknown as WasmApi;
    this._initialized = true;
    console.log('[WASM] init complete');
  }

  get api(): WasmApi {
    if (!this._module) throw new Error('WASM not initialized — call init() first');
    return this._module;
  }

  get isInitialized(): boolean { return this._initialized; }
}

export const wasmService = new WasmService();
