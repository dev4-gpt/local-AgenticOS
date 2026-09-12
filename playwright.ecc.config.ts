import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir:'tests',testMatch:'ecc-ui.spec.ts',timeout:60000,workers:1,
  outputDir:'tmp/ecc-ui-results',
  use:{baseURL:'http://127.0.0.1:3851',trace:'retain-on-failure'},
  webServer:{command:'env PORT=3851 VELOCE_DIST_DIR=.next-client-test node scripts/run-next-dev.mjs',url:'http://127.0.0.1:3851',reuseExistingServer:false,timeout:180000},
});
