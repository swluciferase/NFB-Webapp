import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import obfuscatorPlugin from 'vite-plugin-javascript-obfuscator'

const APP_VERSION = '0.8.2'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    obfuscatorPlugin({
      include: ['src/**/*.js', 'src/**/*.ts', 'src/**/*.tsx'],
      exclude: [/node_modules/, /src\/pkg\/.*\.js/, /src\/services\/wasm\.ts/, /src\/components\/layout\/Header\.tsx/],
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
})
