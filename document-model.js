(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ThesisModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const text = (value, max = 1000000) => String(value ?? '').slice(0, max);
  const number = (value, fallback, min, max) => Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Number(value))) : fallback;
  const safeId = (value, fallback) => /^[a-zA-Z][a-zA-Z0-9_-]{0,99}$/.test(String(value)) ? String(value) : fallback;
  const escapeHtml = (value) => text(value).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const defaults = {
    version: 1,
    page: { topMm: 28, bottomMm: 20, leftMm: 25, rightMm: 25, headerMm: 10, footerMm: 10 },
    body: { font: 'songti', latinFont: 'times', sizePt: 12, lineSpacing: 1.5, exactLinePt: 0, indentEm: 2, beforePt: 0, afterPt: 0 },
    headings: [
      { font: 'heiti', sizePt: 16, bold: true, align: 'center', beforePt: 18, afterPt: 18 },
      { font: 'songti', sizePt: 14, bold: true, align: 'left', beforePt: 12, afterPt: 6 },
      { font: 'songti', sizePt: 12, bold: true, align: 'left', beforePt: 6, afterPt: 6 },
    ],
    headingMode: 'chapter',
    header: { text: '', sizePt: 10.5, font: 'songti', line: false },
    footer: { pageNumbers: true, style: '第 {page} 页', sizePt: 10.5 },
    caption: { font: 'songti', sizePt: 10.5, bold: false, align: 'center', tablePosition: 'above' },
    numbering: { scope: 'chapter', separator: '-', equations: true },
    references: { style: 'gbt7714', order: 'appearance', sizePt: 10.5, lineSpacing: 1.3 },
    cover: { enabled: true, schoolSizePt: 26, titleSizePt: 22, labelSizePt: 14 },
    abstract: { enabled: true, separatePages: true },
    toc: { enabled: true, depth: 3, title: '目录' },
  };
  const pick = (v, options, fallback) => options.includes(v) ? v : fallback;
  const font = (v, fallback) => pick(v, ['songti','heiti','kaiti','fangsong'], fallback);
  function style(value, fallback) {
    const s = value && typeof value === 'object' ? value : {};
    return { font: font(s.font, fallback.font), sizePt: number(s.sizePt, fallback.sizePt, 5, 48), bold: s.bold === undefined ? fallback.bold : Boolean(s.bold), align: pick(s.align, ['left','center','right'], fallback.align), beforePt: number(s.beforePt, fallback.beforePt, 0, 80), afterPt: number(s.afterPt, fallback.afterPt, 0, 80) };
  }
  function normalizeRules(input = {}) {
    const d = clone(defaults), p = input.page || {}, b = input.body || {};
    const result = { ...d, version: 1 };
    for (const k of Object.keys(d.page)) result.page[k] = number(p[k], d.page[k], k.endsWith('Mm') && ['headerMm','footerMm'].includes(k) ? 3 : 10, 50);
    result.body = { font: font(b.font,d.body.font), latinFont: pick(b.latinFont,['times','arial'], 'times'), sizePt:number(b.sizePt,12,5,30), lineSpacing:number(b.lineSpacing,1.5,1,3), exactLinePt:number(b.exactLinePt,0,0,60), indentEm:number(b.indentEm,2,0,4), beforePt:number(b.beforePt,0,0,50), afterPt:number(b.afterPt,0,0,50) };
    result.headings = d.headings.map((h,i) => style(input.headings?.[i], h));
    result.headingMode = pick(input.headingMode,['chapter','decimal'],'chapter');
    result.header = { text:text(input.header?.text || '',200), font:font(input.header?.font,'songti'), sizePt:number(input.header?.sizePt,10.5,5,24), line:Boolean(input.header?.line) };
    result.footer = { pageNumbers:input.footer?.pageNumbers !== false, style:text(input.footer?.style || d.footer.style,100), sizePt:number(input.footer?.sizePt,10.5,5,24) };
    result.caption = { ...style(input.caption,d.caption), tablePosition:pick(input.caption?.tablePosition,['above','below'],'above') };
    result.numbering = { scope:pick(input.numbering?.scope,['chapter','document'],'chapter'), separator:pick(input.numbering?.separator,['-','.'],'-'), equations:input.numbering?.equations !== false };
    result.references = { style:pick(input.references?.style,['gbt7714','plain'],'gbt7714'), order:pick(input.references?.order,['appearance','entry'],'appearance'), sizePt:number(input.references?.sizePt,10.5,5,24), lineSpacing:number(input.references?.lineSpacing,1.3,1,3) };
    result.cover = { enabled:input.cover?.enabled !== false, schoolSizePt:number(input.cover?.schoolSizePt,26,10,48), titleSizePt:number(input.cover?.titleSizePt,22,10,48), labelSizePt:number(input.cover?.labelSizePt,14,8,30) };
    result.abstract = { enabled:input.abstract?.enabled !== false, separatePages:input.abstract?.separatePages !== false };
    result.toc = { enabled:input.toc?.enabled !== false, depth:number(input.toc?.depth,3,1,3), title:text(input.toc?.title || '目录',50) };
    return result;
  }
  function paragraph(value = '') { return { type:'paragraph', inlines:[{type:'text',text:text(value)}] }; }
  function normalizeBlocks(blocks, body = '') {
    if (!Array.isArray(blocks)) return text(body).split(/\n/).map(paragraph);
    return blocks.slice(0,5000).map((block,i) => {
      if (block?.type === 'image') {
        const dataUrl = /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(String(block.dataUrl)) && String(block.dataUrl).length <= 4500000 ? String(block.dataUrl) : '';
        return { type:'image', id:safeId(block.id,`img-${i}`), kind:pick(block.kind,['figure','table','equation'],'figure'), dataUrl, caption:text(block.caption,1000), alt:text(block.alt,1000), widthPercent:number(block.widthPercent,85,10,100), numbered:block.numbered !== false };
      }
      const inlines = Array.isArray(block?.inlines) ? block.inlines.slice(0,10000).map(run => run?.type === 'citation' ? {type:'citation',referenceId:safeId(run.referenceId,'missing-reference')} : {type:'text',text:text(run?.text)}) : [{type:'text',text:text(block?.text)}];
      return {type:'paragraph',inlines:inlines.length?inlines:[{type:'text',text:''}]};
    });
  }
  function blocksText(blocks) { return (blocks || []).map(b=> b.type==='image' ? b.caption : b.inlines.map(r=>r.type==='text'?r.text:'').join('')).join('\n'); }
  function normalizeSections(sections) {
    const used = new Set();
    return (Array.isArray(sections)?sections:[]).slice(0,300).map((section,i)=>{
      let id=safeId(section?.id,`sec-${i+1}`); while(used.has(id)) id += '-copy'; used.add(id);
      const blocks=normalizeBlocks(section?.blocks,section?.body);
      // Migrate the former one-image-per-chapter representation without losing it.
      if(!Array.isArray(section?.blocks) && section?.figure?.dataUrl) blocks.push(...normalizeBlocks([{type:'image',id:`legacy-${i}`,kind:'figure',...section.figure}]));
      const result={ id, level:Math.round(number(section?.level,1,1,3)), title:text(section?.title,300), kind:section?.kind==='references'?'references':undefined, blocks, body:blocksText(blocks) };
      if(section?.table && !Array.isArray(section?.blocks)) result.legacyTable=clone(section.table);
      else if(section?.legacyTable) result.legacyTable=clone(section.legacyTable);
      return result;
    });
  }
  function normalizeReferences(rows) {
    const used=new Set();
    return (Array.isArray(rows)?rows:[]).slice(0,3000).map((r,i)=>{
      let id=safeId(r?.id,`ref-${i+1}`); while(used.has(id))id+='-copy'; used.add(id);
      const row={id,type:pick(r?.type,['J','M','D','C','R','EB/OL'],'J')};
      for(const key of ['authors','title','source','year','volume','issue','pages','doi','raw'])row[key]=text(r?.[key],key==='raw'?5000:1000);
      return row;
    });
  }
  function normalizeProject(input = {}) {
    const sections=normalizeSections(input.sections), references=normalizeReferences(input.references);
    if(!references.length) {
      const legacy=sections.filter(s=>s.kind==='references').flatMap(s=>s.body.split(/\n/)).filter(Boolean);
      references.push(...legacy.map((raw,i)=>({id:`ref-legacy-${i+1}`,raw,type:'J'})));
    }
    return { ...input, schemaVersion:3, metadata:input.metadata && typeof input.metadata==='object'?clone(input.metadata):{}, sections, references, formatRules:normalizeRules(input.formatRules), requirementsText:text(input.requirementsText ?? input.template?.requirementText,30000), formatReady:input.formatReady===true };
  }
  function referenceText(ref) {
    if(ref.raw) return ref.raw;
    const source=[ref.source,ref.year].filter(Boolean).join(', ');
    const volume=ref.volume ? `${ref.volume}${ref.issue?`(${ref.issue})`:''}` : '';
    return `${ref.authors?ref.authors+'. ':''}${ref.title}[${ref.type || 'J'}]. ${[source,volume].filter(Boolean).join(', ')}${ref.pages?': '+ref.pages:''}.${ref.doi?' DOI: '+ref.doi:''}`;
  }
  function indexProject(project) {
    const refs=project.references || [], byId=new Map(refs.map(r=>[r.id,r])), ordered=[], refNumbers=Object.create(null), images=Object.create(null), headings=Object.create(null);
    const counts={figure:0,table:0,equation:0}; let chapter=0, second=0,third=0;
    for(const section of project.sections || []){
      if(section.kind==='references')continue;
      if(section.level===1){chapter++;second=0;third=0;if(project.formatRules?.numbering?.scope!=='document')Object.keys(counts).forEach(k=>counts[k]=0);}
      else if(section.level===2){second++;third=0;} else third++;
      const n=section.level===1?`${chapter}`:section.level===2?`${chapter||1}.${second}`:`${chapter||1}.${second||1}.${third}`;
      headings[section.id]=(section.level===1 && project.formatRules?.headingMode!=='decimal'?`第 ${chapter} 章`:n)+' '+section.title;
      for(const block of section.blocks || []){
        if(block.type==='image'){
          counts[block.kind]++;
          const num=project.formatRules?.numbering?.scope==='document'?`${counts[block.kind]}`:`${chapter||1}${project.formatRules?.numbering?.separator||'-'}${counts[block.kind]}`;
          images[block.id]={number:num,label:block.kind==='equation'?`(${num})`:`${block.kind==='table'?'表':'图'} ${num}`};
        }else for(const run of block.inlines || []){
          if(run.type==='citation' && byId.has(run.referenceId) && !ordered.includes(run.referenceId)) ordered.push(run.referenceId);
        }
      }
    }
    const usedIds=new Set(ordered);
    const ids=project.formatRules?.references?.order==='entry'?refs.filter(r=>usedIds.has(r.id)).map(r=>r.id):ordered;
    ids.forEach((id,i)=>refNumbers[id]=i+1);
    return {refNumbers,usedReferences:ids.map(id=>byId.get(id)),unusedReferences:refs.filter(r=>!usedIds.has(r.id)),images,headings};
  }
  return { defaults, normalizeRules, normalizeProject, normalizeSections, normalizeReferences, normalizeBlocks, paragraph, blocksText, referenceText, indexProject, escapeHtml, safeId, clone };
});
