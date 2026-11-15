import { fileURLToPath, URL } from 'node:url'
import { createRequire } from 'node:module'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const file = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

export default defineConfig({
  define: { 'import.meta.env.VITE_STUDY_MOBILE': JSON.stringify('true') },
  base: './',
  plugins: [react()],
  css: { postcss: { plugins: [
    tailwindcss({
      presets: [createRequire(import.meta.url)('../tailwind.config.js')],
      content: [file('./src/**/*.{ts,tsx}'), file('../src/renderer/src/**/*.{ts,tsx}')]
    }),
    autoprefixer()
  ] } },
  resolve: {
    dedupe: ['react', 'react-dom', 'zustand'],
    alias: [
      { find: /^\.\/openCorpus$/, replacement: file('../src/main/db/openCorpus.android.ts') },
      { find: '@shared', replacement: file('../src/shared') },
      { find: '@', replacement: file('../src/renderer/src') }
    ]
  }
})
