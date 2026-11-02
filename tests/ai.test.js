const {test}=require('node:test');
const assert=require('node:assert/strict');
process.env.AI_BASE_URL='https://ai.example.invalid/v1';process.env.AI_API_KEY='test-key';process.env.AI_MODEL='test-model';
const {parseRequirements}=require('../src/ai-parser');
const M=require('../public/document-model');
test('AI parser sends the configured model and validates structured rules',async()=>{
  const original=global.fetch;
  try{let request;global.fetch=async(url,options)=>{request={url,body:JSON.parse(options.body)};return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({rules:M.defaults,conflicts:[],unhandled:[]})}}]}));};
    const {rules}=await parseRequirements('正文宋体小四，A4，1.5倍行距。');assert.equal(rules.body.sizePt,12);assert.equal(request.body.model,'test-model');assert.equal(request.url,'https://ai.example.invalid/v1/chat/completions');
  }finally{global.fetch=original;}
});
test('unsupported or conflicting requirements never pretend to be applied',async()=>{
  const original=global.fetch;try{global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({rules:M.defaults,conflicts:['正文存在两种字号'],unhandled:[]})}}]}));await assert.rejects(parseRequirements('格式要求中存在相互冲突的两种字号。'),/冲突/);}finally{global.fetch=original;}
});
test('out-of-range AI values are rejected instead of silently changed',async()=>{
  const original=global.fetch;try{const rules=M.clone(M.defaults);rules.body.sizePt=100;global.fetch=async()=>new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({rules,conflicts:[],unhandled:[]})}}]}));await assert.rejects(parseRequirements('格式要求需要特别大的正文。'),/超出支持范围/);}finally{global.fetch=original;}
});
