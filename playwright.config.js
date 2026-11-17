
import {defineConfig} from '@playwright/test';
export default defineConfig({testDir:'./tests/ui',workers:1,use:{baseURL:'http://127.0.0.1:4173',channel:'chrome',viewport:{width:390,height:844}},webServer:{command:'STATE_DIR=.state/ui-tests SEED=1 npm start',url:'http://127.0.0.1:4173',reuseExistingServer:true}});
