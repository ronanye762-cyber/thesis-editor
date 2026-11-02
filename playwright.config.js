const {defineConfig}=require('@playwright/test');
const os=require('node:os');
const path=require('node:path');
module.exports=defineConfig({testDir:'./tests/browser',fullyParallel:false,workers:1,timeout:30000,use:{baseURL:'http://127.0.0.1:8799',viewport:{width:1600,height:1000},headless:true,channel:process.env.PLAYWRIGHT_CHANNEL || 'chrome'},webServer:{command:'node src/server.js',url:'http://127.0.0.1:8799/health',reuseExistingServer:false,env:{HOST:'127.0.0.1',PORT:'8799',DATA_DIR:path.join(os.tmpdir(),'thesis-browser-test-'+process.pid),AI_BASE_URL:'',AI_API_KEY:'',AI_MODEL:'',KV_REST_API_URL:'',KV_REST_API_TOKEN:'',UPSTASH_REDIS_REST_URL:'',UPSTASH_REDIS_REST_TOKEN:''}}});
