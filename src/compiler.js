const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');
const config = require('./config');
const { buildLatex } = require('./latex');
const { normalizeProject } = require('../public/document-model');
let available;
let active=0;
const cache=new Map();
function localAvailable(){
  if(available===undefined){const result=spawnSync(config.latexCommand,['--version'],{timeout:2000,stdio:'ignore'});available=result.status===0;}
  return available;
}
function compilerInfo(){return {configured:Boolean(config.latexServiceUrl)||localAvailable(),mode:config.latexServiceUrl?'service':'local'};}
function error(message,statusCode=422){return Object.assign(new Error(message),{statusCode});}
async function runCompiler(dir){
  return new Promise((resolve,reject)=>{
    let log=''; let timedOut=false;
    const child=spawn(config.latexCommand,['-no-shell-escape','-halt-on-error','-interaction=nonstopmode','-file-line-error','main.tex'],{
      cwd:dir,windowsHide:true,stdio:['ignore','pipe','pipe'],
      env:{PATH:process.env.PATH || '',HOME:dir,TMPDIR:dir,SystemRoot:process.env.SystemRoot || '',openin_any:'p',openout_any:'p',shell_escape:'f'},
    });
    const timer=setTimeout(()=>{timedOut=true;child.kill('SIGKILL');},config.latexTimeoutMs);
    const collect=chunk=>{log=(log+chunk.toString()).slice(-18000);};
    child.stdout.on('data',collect);child.stderr.on('data',collect);
    child.once('error',()=>{clearTimeout(timer);reject(error('排版引擎未安装或无法启动，请联系管理员配置编译服务。',503));});
    child.once('close',code=>{
      clearTimeout(timer);
      if(timedOut)return reject(error('论文排版超时，请缩小图片或稍后重试。',504));
      if(code!==0){
        // Keep paths, TeX source and server configuration out of user-facing errors.
        const fontFailure=/font.*(?:cannot be found|not found)|fontspec.*error/is.test(log);
        return reject(error(fontFailure?'排版所需字体不可用，请联系管理员安装模板字体。':'排版未完成，请检查最近添加的内容或图片后重试。'));
      }
      resolve();
    });
  });
}
async function compileLocal(project){
  if(!localAvailable())throw error('排版服务尚未配置，请联系管理员连接 LaTeX 编译服务。',503);
  if(active>=config.compileConcurrency)throw error('排版服务正在处理其他论文，请稍后重试。',429);
  active++;
  let dir;
  try{
    dir=await fs.mkdtemp(path.join(os.tmpdir(),'thesis-compile-'));
    const {source,files}=buildLatex(project);
    await fs.writeFile(path.join(dir,'main.tex'),source,'utf8');
    for(const file of files)await fs.writeFile(path.join(dir,file.name),Buffer.from(file.base64,'base64'));
    // Three passes resolve the generated TOC and total page count.
    for(let pass=0;pass<3;pass++)await runCompiler(dir);
    const pdf=await fs.readFile(path.join(dir,'main.pdf'));
    if(pdf.subarray(0,5).toString()!=='%PDF-' || pdf.length>32*1024*1024)throw error('排版结果无效或过大。');
    return pdf;
  } finally {active--;if(dir)await fs.rm(dir,{recursive:true,force:true});}
}
async function compileProject(input,{localOnly=false}={}){
  const project=normalizeProject(input);
  if(!project.formatReady)throw error('请先输入格式要求并完成解析。',400);
  const key=crypto.createHash('sha256').update(JSON.stringify([project,config.fonts])).digest('hex');
  if(cache.has(key))return cache.get(key);
  let pdf;
  if(config.latexServiceUrl && !localOnly){
    let response;
    try{
      response=await fetch(`${config.latexServiceUrl.replace(/\/+$/,'')}/internal/compile`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${config.latexServiceToken}`},body:JSON.stringify({project}),signal:AbortSignal.timeout(config.latexTimeoutMs*3+5000)});
    }catch{throw error('排版服务连接失败或超时，请稍后重试。',502);}
    if(!response.ok){const payload=await response.json().catch(()=>({}));throw error(payload.error?.message || '排版服务未能完成请求。',[400,422,429,503,504].includes(response.status)?response.status:502);}
    pdf=Buffer.from(await response.arrayBuffer());
    if(pdf.length>32*1024*1024 || pdf.subarray(0,5).toString()!=='%PDF-')throw error('排版服务返回了无效文件。',502);
  }else pdf=await compileLocal(project);
  if(pdf.length<=8*1024*1024){if(cache.size>=4)cache.delete(cache.keys().next().value);cache.set(key,pdf);}
  return pdf;
}
module.exports={compileProject,compilerInfo};
