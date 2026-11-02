const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
for(const dir of ['src','compiler','api','public','scripts','tests']){
  if(!fs.existsSync(dir))continue;
  for(const name of fs.readdirSync(dir).filter(x=>/\.(js|cjs)$/.test(x))){const result=spawnSync(process.execPath,['--check',path.join(dir,name)],{stdio:'inherit'});if(result.status!==0)process.exit(result.status || 1);}
}
require('./verify-static');
