import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'
import { resolve } from 'path'

const APP_VERSION = '1.5.2'
// v1.4.7 — fix: HistCanvas (EEG #1–5 history bars) collapsed to an empty
//   strip when the history was negative (Z-Score mode). The old `max =
//   max(history, threshold*1.1, 1)` clamped the y-scale to ≥1 and used
//   `fillRect(x, h - barH, w, barH)`, so a value of −4.16 drew a rect from
//   y=200 down by 158 px on a 42 px canvas → entirely off-screen. New code
//   computes a signed range `[min(history,threshold,0), max(history,threshold,0)]`
//   and draws each bar from a floating zero baseline (+ a faint zero line when
//   both signs are present). Threshold drag now uses the same range so dragging
//   below zero works for Z-Score; the `Math.max(0.5, …)` floor inside the
//   canvas handler is removed (parent decides clamp). Mirrors Poseidon v1.10.11.
// v1.4.6 — fix: TrainingView auto-threshold (EEG #1–5) was using RMS of the
//   recent history window for both Power and Z-Score modes. RMS is sign-blind:
//   a Z=−1 sample contributes the same as Z=+1, so when the user is consistently
//   below the normative mean, the auto-threshold drifts above zero and breaks
//   both up- and down-direction detection. New `computeAutoThreshold(values,
//   metricMode)` helper now returns the arithmetic mean (sign-preserving) when
//   `metricMode === 'zscore'` and falls back to RMS for Power mode (which is
//   always ≥ 0). Mirrors Poseidon v1.10.10.
// v1.4.5 — ui: move α (Save Folder) and β (Camera) cards from col 2 to the
//   top of col 3, above the 錄製·標記 title. Reduces col-2 vertical pressure
//   and groups recording-adjacent controls (folder + cam + start/stop) together.
// v1.4.4 — fix: norm_engine dynamic import 404 (text/html MIME). The obfuscator
//   stringArray was turning `import('../pkg/norm_engine/norm_engine')` into
//   `import(t(350))`, which prevents Vite from rewriting the path to a chunk
//   URL → at runtime the literal `pkg/norm_engine/norm_engine` is requested,
//   matched by the SPA fallback, and served as HTML. Fix: exclude
//   normEngineService.ts from the obfuscator (mirroring wasm.ts) and append
//   `.js` to the dynamic import path so Vite resolves it deterministically.
// v1.4.3 — feat: FormulaCard (EEG #5) gains per-card Power/Z-Score selector.
//   Z-Score is enabled only when the formula matches the whitelist
//   (A/B, log(A/B), (A-B)/(A+B)) and CHBMP norm is loaded. Math:
//   • A/B & log(A/B): Z = (log10A − log10B − Δμ_log) / √(σ²_logA + σ²_logB)
//   • (A−B)/(A+B): delta-method on log-normal back-transformed raw stats.
//   (μ_log, σ_log) are extracted from the WASM engine via a probe trick
//   (zscore_qeeg with zeros + ones in log-space) — no WASM rebuild needed.
//   Saturated (channel × band) entries (|Z|≈10) fall back to null.
// v1.4.2 — ui: collapse EegCard metric / channel / band into a single row
//   (was 2 rows). Z-Score selector flexed slightly wider to fit "Z 分數 Z-Score".
// v1.4.1 — fix: per-EegCard Power/Z-Score dropdown (4 independent selectors).
//   • Each EEG#1-4 card now has its own <select> placed directly above the
//     channel+band row; mode is per-indicator (no global toggle), so users can
//     mix Power and Z-Score across the four cards.
//   • Removed the column-1 mini-toggle and column-4 mode-toggle (per-card
//     dropdowns now drive metric selection); column 4 keeps DB picker + age.
//   • Z-Score option in each dropdown is disabled until age + norm engine
//     are ready; SoraMynd's 8 channels (Fp1/Fp2/T7/T8/O1/O2/Cz/Fz) are all
//     CHBMP-19 so no channel-snap is needed.
// v1.4.0 — feat: Z-Score metric mode visibility + CHBMP default-on label.
//   • TrainingView Column 1 gains a "指標模式 / Metric Mode" mini-toggle
//     above EegCards (Power | Z-Score), mirroring Poseidon. Z-Score gates
//     on subjectAge (set in Column 4 panel).
//   • CHBMP DB chips now display "適用 5-87 歲" (and equivalents for the
//     four databases) so the applicable age range is visible at a glance.
//   • CHBMP remains the default selected DB and the only enabled one.

export default defineConfig({
  plugins: [
    wasm(),
    react(),
    obfuscatorPlugin({
      include: ['src/**/*.js', 'src/**/*.ts', 'src/**/*.tsx'],
      exclude: [
        /node_modules/,
        /src\/pkg\/.*\.js/,
        /src\/services\/wasm\.ts/,
        /src\/services\/normEngineService\.ts/,
        /src\/components\/layout\/Header\.tsx/,
        /src\/game\/subject\//,
        /src\/game\/games\//,
        /src\/gameWindow\.tsx/,
      ],
      apply: 'build',
      debugger: true,
      options: {
        compact: true,
        controlFlowFlattening: true,
        controlFlowFlatteningThreshold: 0.5,
        numbersToExpressions: true,
        simplify: true,
        stringArrayShuffle: true,
        splitStrings: false,
        stringArrayThreshold: 0.8,
        unicodeEscapeSequence: false,
        identifierNamesGenerator: 'hexadecimal'
      }
    })
  ],
  base: './',
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        nfbGame: resolve(__dirname, 'nfb-game.html'),
      },
    },
  },
})
