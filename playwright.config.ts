import {defineConfig} from '@playwright/test';
import {existsSync} from 'node:fs';
const executablePath=process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium-browser')?'/usr/bin/chromium-browser':undefined);
export default defineConfig({
  testDir:'./tests',testMatch:'**/*.e2e.ts',fullyParallel:false,workers:1,timeout:60000,
  expect:{timeout:10000},reporter:'list',
  use:{baseURL:'http://localhost:3100',viewport:{width:1440,height:1000},trace:'retain-on-failure',screenshot:'only-on-failure',launchOptions:{executablePath,args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']}},
  webServer:{command:'npm run start -- --port 3100',url:'http://localhost:3100',reuseExistingServer:!process.env.CI,timeout:120000,env:{DATABASE_URL:'',HISTORY_STORE_PATH:process.env.HISTORY_E2E_STORE_PATH||'/tmp/athar-browser-tests-v2/.store.json',APP_ORIGIN:'http://localhost:3100'}},
});
