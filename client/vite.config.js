import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

import simulatorPwa from './build/simulatorPwa.js'
export default defineConfig({
  plugins: [react(), simulatorPwa()],
  build: { manifest: true },
  test: {
    pool: 'forks',
    maxWorkers: 1,
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
