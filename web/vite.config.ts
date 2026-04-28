import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import wasm from 'vite-plugin-wasm'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'
import { resolve } from 'path'

const APP_VERSION = '1.4.1'
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
