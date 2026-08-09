import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // node:sqlite needs the flag; run tests in forked processes so it's on the worker's argv.
    pool: 'forks',
    poolOptions: { forks: { execArgv: ['--experimental-sqlite', '--no-warnings'] } },
    // node:sqlite is too new for Vite's builtin list — don't try to transform/bundle it.
    server: { deps: { external: ['node:sqlite'] } }
  }
})
