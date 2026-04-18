/**
 * normEngineService.ts — Z-score normative engine service for QEEG metrics.
 * Manages initialization and access to the WASM-based NormEngine for Z-score computation.
 */

import type { NormEngine } from '../pkg/norm_engine/norm_engine';

class NormEngineService {
  private engine: NormEngine | null = null;
  private initPromise: Promise<void> | null = null;
  private currentDbKey = '';

  /**
   * Initialize or switch to a normative database.
   * Fetches encrypted binary from `/api/norm-bin?db=<dbKey>` and constructs NormEngine.
   * Silently fails (logs to console) if unable to load.
   * Redirects to login on 401/403.
   */
  async init(dbKey: string): Promise<void> {
    if (dbKey === this.currentDbKey && this.engine !== null) return;
    if (this.initPromise !== null) return this.initPromise;

    this.initPromise = this._doInit(dbKey);
    try {
      await this.initPromise;
    } finally {
      this.initPromise = null;
    }
  }

  private async _doInit(dbKey: string): Promise<void> {
    this.engine = null;

    try {
      const res = await fetch(`/api/norm-bin?db=${encodeURIComponent(dbKey)}`, {
        credentials: 'include',
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          const next = encodeURIComponent(window.location.pathname);
          window.location.href = `/login?next=${next}`;
          return;
        }
        throw new Error(`norm-bin fetch failed: ${res.status}`);
      }

      const buf = await res.arrayBuffer();
      // Dynamic import required for WASM modules with vite-plugin-wasm
      const { NormEngine: NE } = await import('../pkg/norm_engine/norm_engine');
      this.engine = new NE(new Uint8Array(buf));
      this.currentDbKey = dbKey;
    } catch (err) {
      console.error('[NormEngineService] init failed:', err);
      // Silent fail — Z-score mode stays unavailable until next retry
    }
  }

  /**
   * Switch to a different normative database if not already loaded.
   */
  async switchDb(dbKey: string): Promise<void> {
    if (dbKey === this.currentDbKey && this.engine !== null) return;
    await this.init(dbKey);
  }

  /**
   * Check if engine is ready (loaded and initialized).
   */
  isReady(): boolean {
    return this.engine !== null;
  }

  /**
   * Get the underlying NormEngine instance (null if not yet loaded).
   */
  getEngine(): NormEngine | null {
    return this.engine;
  }
}

export const normEngineService = new NormEngineService();
