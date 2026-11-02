const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../public/document-model');
const {buildLatex,escapeTex}=require('../src/latex');
const {buildDocx}=require('../src/docx-exporter');
const {unzipSync}=require('fflate');
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function project(){return M.normalizeProject({formatReady:true,metadata:{title:'排版测试',author:'测试作者',school:'示例大学',date:'2026-11-02',abstractCn:'摘要内容。'},references:[{id:'ref-a',authors:'张三',title:'论文题名',source:'示例期刊',year:'2026',type:'J'},{id:'ref-b',raw:'另一篇文献。'}],sections:[{id:'sec-a',title:'绪论',level:1,blocks:[{type:'paragraph',inlines:[{type:'text',text:'前文 50% A_B & C # D '},{type:'citation',referenceId:'ref-b'},{type:'text',text:' 后文'}]},{type:'image',id:'img-a',kind:'figure',dataUrl:png,caption:'图片说明',widthPercent:80,numbered:true},{type:'paragraph',inlines:[{type:'citation',referenceId:'ref-b'},{type:'citation',referenceId:'ref-a'}]}]}]});}
test('citation order follows first occurrence and repeated references reuse numbers',()=>{
  const p=project();const idx=M.indexProject(p);assert.deepEqual({...idx.refNumbers},{'ref-b':1,'ref-a':2});
  p.sections[0].blocks[0].inlines=[{type:'text',text:'无引用'}];p.sections[0].blocks.pop();assert.equal(M.indexProject(p).unusedReferences.length,2);
});
test('normalization preserves image and inline citation positions and sanitizes section IDs',()=>{
  const p=project();p.sections[0].id='x"><img onerror=alert(1)>';
  const normalized=M.normalizeProject(p);assert.equal(normalized.sections[0].id,'sec-1');assert.deepEqual(normalized.sections[0].blocks.map(b=>b.type),['paragraph','image','paragraph']);assert.equal(normalized.references.length,2);
});
test('LaTeX escapes manuscript text and contains anchored images and superscript citations',()=>{
  const {source,files}=buildLatex(project());assert.ok(source.includes('50\\% A\\_B \\& C \\# D'));assert.ok(source.includes('\\textsuperscript{[1]}'));assert.ok(source.includes('\\begin{minipage}'));assert.equal(files.length,1);assert.ok(!source.includes('\\begin{figure}'));
  assert.equal(escapeTex('\\input{/etc/passwd}'),'\\textbackslash{}input\\{/etc/passwd\\}');
});
test('DOCX is actual OOXML with editable text, superscript references, images and selected template',async()=>{
  const p=project();p.formatRules.page.leftMm=30;p.formatRules.body.sizePt=14;
  const buffer=await buildDocx(p);assert.equal(buffer.subarray(0,2).toString(),'PK');
  const zip=unzipSync(buffer),xml=Buffer.from(zip['word/document.xml']).toString();
  assert.ok(xml.includes('前文 50% A_B &amp; C # D '));assert.ok(xml.includes('superscript'));assert.ok(xml.includes('w:left="1701"'));assert.ok(Object.keys(zip).some(k=>k.startsWith('word/media/')));
});
module.exports={project};
