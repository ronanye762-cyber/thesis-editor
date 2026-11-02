const http=require('node:http');
const crypto=require('node:crypto');
const {compileProject}=require('../src/compiler');
const {readJsonBody,sendBuffer,sendError,sendJson}=require('../src/http-utils');
const token=process.env.LATEX_SERVICE_TOKEN;
if(!token || token.length<24)throw new Error('LATEX_SERVICE_TOKEN must contain at least 24 characters');
function authorized(req){const actual=Buffer.from(req.headers.authorization || ''),expected=Buffer.from(`Bearer ${token}`);return actual.length===expected.length&&crypto.timingSafeEqual(actual,expected);}
http.createServer(async(req,res)=>{
  if(req.url==='/health' && req.method==='GET')return sendJson(res,200,{ok:true,service:'thesis-latex-compiler'});
  if(!authorized(req))return sendError(res,401,'Unauthorized');
  if(req.url!=='/internal/compile' || req.method!=='POST')return sendError(res,404,'Not found');
  try{const body=await readJsonBody(req,20*1024*1024);const pdf=await compileProject(body.project,{localOnly:true});sendBuffer(res,200,pdf,'application/pdf',{'Cache-Control':'no-store'});}
  catch(e){sendError(res,e.statusCode || 500,e.statusCode?e.message:'排版服务暂不可用。');}
}).listen(Number(process.env.PORT || 8788),'0.0.0.0');
