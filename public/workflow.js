/* Plain-language setup, rich manuscript editing and compiled PDF preview. */
const Workflow = (() => {
  const M=ThesisModel, e=M.escapeHtml;
  let bookmark=null, selectedImage=null, attachmentTarget=null, lastPdfUrl='', lastPreviewKey='', previewTimer=0, previewController=null, previewVersion=0;
  let undoStack=[],redoStack=[],lastHistoryAt=0,restoring=false,setupEditing=false,capabilities=null;
  const id=prefix=>`${prefix}-${crypto.randomUUID()}`;
  const $=value=>document.getElementById(value);
  const currentModel=()=>M.normalizeProject(state);
  function rememberHistory(force=false){
    if(restoring)return;
    const time=Date.now();if(!force&&time-lastHistoryAt<700)return;
    undoStack.push(JSON.stringify(state));if(undoStack.length>35)undoStack.shift();redoStack=[];lastHistoryAt=time;updateUndoUi();
    while(undoStack.length>1&&undoStack.reduce((n,s)=>n+s.length,0)>16000000)undoStack.shift();
  }
  function updateUndoUi(){if($('undoEdit'))$('undoEdit').disabled=!undoStack.length;if($('redoEdit'))$('redoEdit').disabled=!redoStack.length;}
  function history(direction){
    const source=direction==='undo'?undoStack:redoStack,target=direction==='undo'?redoStack:undoStack;
    if(!source.length)return;
    target.push(JSON.stringify(state));restoring=true;
    const identity={id:state.id,revision:state.revision};
    state={...JSON.parse(source.pop()),...identity,clientUpdatedAt:new Date().toISOString()};renderStructuredEditor();scheduleSaveAndRender();restoring=false;bookmark=null;selectedImage=null;updateUndoUi();
  }
  function resetHistory(){undoStack=[];redoStack=[];bookmark=null;selectedImage=null;updateUndoUi();}
  function initialize(){
    $('requirementsForm').addEventListener('submit',submitRequirements);
    $('continueDraft').addEventListener('click',()=>{if(state.formatReady)enterEditor();});
    $('cancelRequirements').addEventListener('click',()=>{if(state.formatReady)enterEditor();});
    $('editRequirements').addEventListener('click',()=>showSetup(true));
    $('addAttachment').addEventListener('click',()=>{
      captureSelection();$('attachmentMenu').hidden=!$('attachmentMenu').hidden;
    });
    $('addAttachment').addEventListener('mousedown',event=>event.preventDefault());
    document.addEventListener('selectionchange',captureSelection);
    document.addEventListener('click',event=>{if(!event.target.closest('.attachment-control'))$('attachmentMenu').hidden=true;});
    document.querySelectorAll('[data-insert-kind]').forEach(button=>button.addEventListener('click',()=>openAttachment(button.dataset.insertKind)));
    $('attachmentForm').addEventListener('submit',submitAttachment);
    $('attachmentFile').addEventListener('change',previewAttachment);
    $('attachmentWidth').addEventListener('input',()=>{$('attachmentWidthLabel').textContent=`${$('attachmentWidth').value}% 正文宽度`;});
    $('undoEdit').addEventListener('click',()=>history('undo'));$('redoEdit').addEventListener('click',()=>history('redo'));
    editor.addEventListener('beforeinput',()=>rememberHistory());
    editor.addEventListener('input',onRichInput);
    editor.addEventListener('paste',onPaste);
    editor.addEventListener('drop',event=>{if(event.target.closest('[data-manuscript]')){event.preventDefault();showToast('请通过顶部附件入口插入图片，或用移动按钮调整位置。');}});
    editor.addEventListener('click',onEditorClick);
    editor.addEventListener('mousedown',event=>{if(event.target.closest('[data-image-action]'))event.preventDefault();});
    editor.addEventListener('keydown',event=>{
      if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();history(event.shiftKey?'redo':'undo');}
      if(event.key==='Escape'){selectedImage=null;editor.querySelectorAll('.manuscript-image.selected').forEach(x=>x.classList.remove('selected'));}
    });
    $('referenceForm').addEventListener('submit',submitReference);
    $('referenceChoices').addEventListener('click',event=>{const button=event.target.closest('[data-use-reference]');if(button)insertReference(button.dataset.useReference);});
    $('referenceNew').addEventListener('click',()=>{ $('referenceForm').reset();$('referenceEditId').value='';$('referenceInsert').checked=true; });
    $('refreshPreview').addEventListener('click',()=>schedulePreview(true));
    window.addEventListener('beforeunload',()=>{if(lastPdfUrl)URL.revokeObjectURL(lastPdfUrl);});
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistState();});
    $('requirementsInput').value=state.requirementsText || '';
    showSetup(false);
    fetch('/api/capabilities').then(res=>res.ok?res.json():Promise.reject()).then(info=>{
      capabilities=info;
      if(!info.aiConfigured)$('setupServiceStatus').textContent='格式解析服务尚未连接。你可以先填写要求并保存在此页面，服务连接后再开始。';
      else if(!info.compiler?.configured)$('setupServiceStatus').textContent='格式解析服务已连接，排版服务等待管理员配置。';
      else $('setupServiceStatus').textContent='格式解析与排版服务已就绪。';
    }).catch(()=>{$('setupServiceStatus').textContent='暂时无法连接服务，请检查网络后重试。';});
    $('requirementsInput').addEventListener('input',()=>{try{localStorage.setItem('thesis-requirements-draft',$('requirementsInput').value);}catch{}});
    if(!state.requirementsText)$('requirementsInput').value=localStorage.getItem('thesis-requirements-draft') || '';
  }
  function showSetup(editing=false){
    setupEditing=editing;persistState();document.body.classList.add('in-setup');$('requirementsScreen').hidden=false;$('workbench').hidden=true;
    $('requirementsInput').value=state.requirementsText || $('requirementsInput').value;
    $('continueDraft').hidden=editing || !state.formatReady;$('cancelRequirements').hidden=!editing || !state.formatReady;
    $('requirementsError').textContent='';
    $('setupTitle').textContent=editing?'调整这篇论文的格式要求':'先告诉我们，论文应该怎样排版';
  }
  function enterEditor(){
    document.body.classList.remove('in-setup');$('requirementsScreen').hidden=true;$('workbench').hidden=false;renderStructuredEditor();renderAll();schedulePreview(true);
  }
  async function submitRequirements(event){
    event.preventDefault();const button=$('startWriting'),error=$('requirementsError'),requirements=$('requirementsInput').value.trim();
    if(requirements.length<8){error.textContent='请填写完整的论文格式要求。';return;}
    button.disabled=true;button.textContent='正在理解格式要求…';error.textContent='';
    try{
      const result=await apiRequest('/api/requirements/parse',{method:'POST',body:{requirements}});
      rememberHistory(true);state.requirementsText=requirements;state.formatRules=M.normalizeRules(result.rules);state.formatReady=true;
      state.template={...state.template,name:'我的论文格式',headingMode:state.formatRules.headingMode,requirementText:requirements};
      state.clientUpdatedAt=new Date().toISOString();persistState();enterEditor();scheduleCloudSave();
      showToast(setupEditing?'论文格式已更新，正文和附件已保留':'格式已生成，可以开始写作');
    }catch(err){error.textContent=err.message;}finally{button.disabled=false;button.textContent='生成格式，开始写作';}
  }
  function sectionCardHtml(section,index,displayTitle){
    const reference=section.kind==='references';
    return `<section class="section-card" id="form-${e(section.id)}" data-section-id="${e(section.id)}">
      <div class="section-card-head"><span class="section-number">${index+1}</span><div class="auto-title-preview">${e(displayTitle)}</div>
      ${reference?'':`<select class="level-select" data-field="level" aria-label="章节层级">${[1,2,3].map(n=>`<option value="${n}"${section.level===n?' selected':''}>${n}级标题</option>`).join('')}</select>`}
      <div class="section-actions"><button class="icon-btn ghost" data-action="move-up" title="上移章节" type="button">↑</button><button class="icon-btn ghost" data-action="move-down" title="下移章节" type="button">↓</button><button class="icon-btn ghost danger" data-action="delete-section" title="删除章节" type="button">×</button></div></div>
      ${reference?referenceLibraryHtml():`<div class="field-stack"><label class="form-field"><span>章节标题</span><input data-field="title" type="text" value="${e(section.title)}" /></label>
      <div class="form-field"><span>正文 · 在光标处插入图片或引用</span><div class="manuscript" data-manuscript="${e(section.id)}" contenteditable="true" role="textbox" aria-multiline="true" aria-label="${e(section.title)}正文" spellcheck="false">${blocksHtml(section.blocks)}</div></div></div>`}
    </section>`;
  }
  function blocksHtml(blocks){
    const index=M.indexProject(state);
    return (blocks || [M.paragraph()]).map(block=>{
      if(block.type==='paragraph')return `<p>${block.inlines.map(run=>run.type==='citation'?`<sup class="citation" data-reference-id="${e(run.referenceId)}" contenteditable="false" title="编辑参考文献">[${index.refNumbers[run.referenceId] || '?'}]</sup>`:e(run.text).replace(/\n/g,'<br>')).join('') || '<br>'}</p>`;
      const numbered=block.numbered&&(block.kind!=='equation'||state.formatRules.numbering.equations),label=numbered?index.images[block.id]?.label:'';
      return `<figure class="manuscript-image" data-image-id="${e(block.id)}" contenteditable="false" tabindex="0" role="group" aria-label="${e(block.caption || label || '论文图片')}">
        <div class="image-actions"><button type="button" data-image-action="edit">调整 / 替换</button><button type="button" data-image-action="up">上移</button><button type="button" data-image-action="down">下移</button><button type="button" data-image-action="move">移动到光标</button><button type="button" data-image-action="delete">删除</button></div>
        <img src="${e(block.dataUrl)}" alt="${e(block.alt || block.caption)}" style="width:${block.widthPercent}%" />
        <figcaption>${e([label,block.caption].filter(Boolean).join(' ') || '未填写说明')}</figcaption></figure>`;
    }).join('');
  }
  function readInlines(node){
    const result=[];
    const visit=child=>{
      if(child.nodeType===Node.TEXT_NODE){if(child.textContent)result.push({type:'text',text:child.textContent});return;}
      if(child.nodeType!==Node.ELEMENT_NODE)return;
      if(child.dataset.referenceId){result.push({type:'citation',referenceId:child.dataset.referenceId});return;}
      if(child.tagName==='BR'){result.push({type:'text',text:'\n'});return;}
      child.childNodes.forEach(visit);
    };
    node.childNodes.forEach(visit);
    if(result.length===1&&result[0].text==='\n')return [{type:'text',text:''}];
    return result.length?result:[{type:'text',text:''}];
  }
  function readManuscript(element){
    const section=findSection(element.dataset.manuscript);if(!section)return;
    const previous=new Map(section.blocks.filter(b=>b.type==='image').map(b=>[b.id,b]));
    const blocks=[];let pending=[];
    const flush=()=>{if(pending.length){const wrapper=document.createElement('div');pending.forEach(n=>wrapper.append(n.cloneNode(true)));blocks.push({type:'paragraph',inlines:readInlines(wrapper)});pending=[];}};
    for(const child of element.childNodes){
      if(child.nodeType===Node.ELEMENT_NODE&&child.dataset.imageId){flush();const image=previous.get(child.dataset.imageId);if(image)blocks.push(image);}
      else if(child.nodeType===Node.ELEMENT_NODE&&['P','DIV'].includes(child.tagName)){flush();blocks.push({type:'paragraph',inlines:readInlines(child)});}
      else pending.push(child);
    }
    flush();section.blocks=blocks.length?blocks:[M.paragraph()];section.body=M.blocksText(section.blocks);
  }
  function onRichInput(event){const element=event.target.closest('[data-manuscript]');if(!element)return;readManuscript(element);captureSelection();scheduleSaveAndRender();updateCitationLabels();}
  function onPaste(event){
    const element=event.target.closest('[data-manuscript]');if(!element)return;
    event.preventDefault();rememberHistory(true);
    const selection=window.getSelection();if(!selection.rangeCount)return;
    const range=selection.getRangeAt(0);if(!element.contains(range.commonAncestorContainer))return;
    range.deleteContents();const fragment=document.createDocumentFragment();
    (event.clipboardData?.getData('text/plain') || '').split(/\r?\n/).forEach((line,i)=>{if(i)fragment.append(document.createElement('br'));fragment.append(document.createTextNode(line));});
    const tail=fragment.lastChild;range.insertNode(fragment);if(tail){range.setStartAfter(tail);range.collapse(true);selection.removeAllRanges();selection.addRange(range);}
    readManuscript(element);captureSelection();scheduleSaveAndRender();
  }
  function captureSelection(){
    const selection=window.getSelection();if(!selection?.rangeCount)return;
    const range=selection.getRangeAt(0),node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;
    if(node.closest?.('[data-image-id],[data-reference-id],button'))return;
    const container=node.closest?.('[data-manuscript]');
    if(container&&container.contains(range.endContainer))bookmark={sectionId:container.dataset.manuscript,range:range.cloneRange()};
  }
  function insertionRange(){
    if(!bookmark || !bookmark.range.startContainer.isConnected){showToast('请先在正文中点击需要插入的位置。','error');return null;}
    const container=document.querySelector(`[data-manuscript="${CSS.escape(bookmark.sectionId)}"]`);
    if(!container||!container.contains(bookmark.range.startContainer)){showToast('原插入位置已改变，请重新点击正文位置。','error');return null;}
    return {range:bookmark.range.cloneRange(),container,section:findSection(bookmark.sectionId)};
  }
  function onEditorClick(event){
    const reference=event.target.closest('[data-reference-edit]');if(reference){openReferenceDialog(reference.dataset.referenceEdit,false);return;}
    if(event.target.closest('[data-reference-add]')){openReferenceDialog(null,false);return;}
    const citation=event.target.closest('[data-reference-id]');if(citation){openReferenceDialog(citation.dataset.referenceId,false);return;}
    const image=event.target.closest('[data-image-id]');if(!image)return;
    selectedImage={sectionId:image.closest('[data-manuscript]').dataset.manuscript,imageId:image.dataset.imageId};
    editor.querySelectorAll('.manuscript-image.selected').forEach(x=>x.classList.remove('selected'));image.classList.add('selected');
    const action=event.target.closest('[data-image-action]')?.dataset.imageAction;if(!action)return;
    event.preventDefault();const section=findSection(selectedImage.sectionId),at=section.blocks.findIndex(b=>b.id===selectedImage.imageId),block=section.blocks[at];
    if(action==='edit'){openAttachment(block.kind,selectedImage);return;}
    if(action==='move'){moveImageToCaret();return;}
    rememberHistory(true);
    if(action==='delete')section.blocks.splice(at,1);
    else{const target=at+(action==='up'?-1:1);if(target<0||target>=section.blocks.length)return;[section.blocks[at],section.blocks[target]]=[section.blocks[target],section.blocks[at]];}
    renderStructuredEditor();scheduleSaveAndRender();
  }
  function openAttachment(kind,editTarget=null){
    $('attachmentMenu').hidden=true;
    if(kind==='reference'){if(!insertionRange())return;openReferenceDialog(null,true);return;}
    if(!editTarget&&!insertionRange())return;
    attachmentTarget=editTarget;
    const image=editTarget?findSection(editTarget.sectionId)?.blocks.find(b=>b.id===editTarget.imageId):null;
    $('attachmentForm').reset();$('attachmentKind').value=kind;
    $('attachmentTitle').textContent=`${image?'调整':'插入'}${{figure:'图片',table:'表格图片',equation:'公式图片'}[kind]}`;
    $('attachmentCaption').value=image?.caption || '';$('attachmentAlt').value=image?.alt || '';
    $('attachmentWidth').value=image?.widthPercent || (kind==='equation'?60:85);$('attachmentWidthLabel').textContent=`${$('attachmentWidth').value}% 正文宽度`;
    $('attachmentNumbered').checked=image?.numbered!==false;$('attachmentFile').required=!image;
    $('attachmentPreview').src=image?.dataUrl || '';$('attachmentPreview').hidden=!image;$('attachmentError').textContent='';
    $('attachmentDialog').showModal();
  }
  async function previewAttachment(){
    const file=$('attachmentFile').files[0];if(!file)return;
    try{$('attachmentPreview').src=await imageData(file);$('attachmentPreview').hidden=false;$('attachmentError').textContent='';}
    catch(err){$('attachmentError').textContent=err.message;$('attachmentPreview').src='';$('attachmentPreview').hidden=true;}
  }
  async function imageData(file){
    if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPEG 或 WebP 图片。');
    if(file.size>12*1024*1024)throw new Error('图片不能超过 12 MB，请压缩后上传。');
    const bitmap=await createImageBitmap(file).catch(()=>{throw new Error('无法读取这张图片，请重新选择。');});
    if(bitmap.width*bitmap.height>60000000){bitmap.close();throw new Error('图片像素过大，请缩小后上传。');}
    const scale=Math.min(1,2000/Math.max(bitmap.width,bitmap.height)),canvas=document.createElement('canvas');
    canvas.width=Math.round(bitmap.width*scale);canvas.height=Math.round(bitmap.height*scale);canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();
    const data=canvas.toDataURL(file.type==='image/png'?'image/png':'image/jpeg',0.9);
    if(data.length>4000000)throw new Error('图片内容过大，请压缩后上传。');
    return data;
  }
  async function submitAttachment(event){
    event.preventDefault();const button=$('attachmentSubmit');button.disabled=true;
    try{
      const file=$('attachmentFile').files[0],kind=$('attachmentKind').value;
      const original=attachmentTarget?findSection(attachmentTarget.sectionId)?.blocks.find(b=>b.id===attachmentTarget.imageId):null;
      const dataUrl=file?await imageData(file):original?.dataUrl;
      if(!dataUrl)throw new Error('请先选择有效图片。');
      if(kind==='table'){const check=new Image();check.src=dataUrl;await check.decode();if(check.naturalHeight/check.naturalWidth>2.5)throw new Error('这张表格过长，请拆成多张图片后分别上传，避免缩小后无法阅读。');}
      const block={type:'image',id:original?.id || id('img'),kind,dataUrl,caption:$('attachmentCaption').value.trim(),alt:$('attachmentAlt').value.trim(),widthPercent:Number($('attachmentWidth').value),numbered:$('attachmentNumbered').checked};
      const position=original?null:insertionRange();if(!original&&!position)return;
      rememberHistory(true);
      if(original){const section=findSection(attachmentTarget.sectionId);section.blocks[section.blocks.findIndex(b=>b.id===original.id)]=block;renderStructuredEditor();}
      else insertImageBlock(block,position);
      $('attachmentDialog').close();scheduleSaveAndRender();showToast(original?'图片已更新':'已插入正文位置');
    }catch(err){$('attachmentError').textContent=err.message;}finally{button.disabled=false;}
  }
  function insertImageBlock(block,position){
    const {range,container,section}=position;range.collapse(true);
    const top=(()=>{let node=range.startContainer.nodeType===1?range.startContainer:range.startContainer.parentElement;while(node.parentElement!==container&&node!==container)node=node.parentElement;return node;})();
    section.blocks.push(block);
    const holder=document.createElement('div');holder.innerHTML=blocksHtml([block]);const image=holder.firstElementChild;
    if(top===container){range.insertNode(image);}
    else if(top.dataset.imageId){top.after(image);}
    else{
      const tailRange=document.createRange();tailRange.selectNodeContents(top);tailRange.setStart(range.startContainer,range.startOffset);
      const tail=tailRange.extractContents(),next=document.createElement('p');next.append(tail);if(!next.childNodes.length)next.append(document.createElement('br'));
      top.after(image,next);
    }
    readManuscript(container);
    if(!image.nextElementSibling){const next=document.createElement('p');next.innerHTML='<br>';image.after(next);readManuscript(container);}
    const next=image.nextElementSibling,newRange=document.createRange();newRange.selectNodeContents(next);newRange.collapse(true);
    container.focus();const selection=window.getSelection();selection.removeAllRanges();selection.addRange(newRange);captureSelection();
  }
  function moveImageToCaret(){
    const position=insertionRange();if(!position||!selectedImage)return;
    const section=findSection(selectedImage.sectionId),block=section.blocks.find(b=>b.id===selectedImage.imageId);
    if(position.range.startContainer.parentElement?.closest('[data-image-id]'))return;
    rememberHistory(true);
    const element=editor.querySelector(`[data-image-id="${CSS.escape(block.id)}"]`);element?.remove();section.blocks=section.blocks.filter(b=>b.id!==block.id);
    insertImageBlock(block,position);renderStructuredEditor();scheduleSaveAndRender();showToast('图片已移动到光标位置');
  }
  function referenceLibraryHtml(){
    const index=M.indexProject(state);
    return `<div class="reference-library"><p>在正文光标处通过顶部“＋”插入引用。引用会显示为右上角标。</p><button class="command-btn" type="button" data-reference-add>录入文献</button>${state.references.length?state.references.map(ref=>`<div class="reference-row"><span>${index.refNumbers[ref.id]?`[${index.refNumbers[ref.id]}]`:'未引用'} ${e(M.referenceText(ref))}</span><button class="command-btn compact" type="button" data-reference-edit="${e(ref.id)}">编辑</button></div>`).join(''):'<p class="muted">尚未录入参考文献。</p>'}</div>`;
  }
  function openReferenceDialog(referenceId=null,insert=false){
    const ref=state.references.find(r=>r.id===referenceId);$('referenceForm').reset();$('referenceEditId').value=ref?.id || '';
    for(const key of ['authors','title','source','year','volume','issue','pages','doi','raw','type'])if($(`reference-${key}`))$(`reference-${key}`).value=ref?.[key] || (key==='type'?'J':'');
    $('referenceInsert').checked=insert;$('referenceError').textContent='';
    const index=M.indexProject(state);
    $('referenceChoices').innerHTML=state.references.map(r=>`<button class="reference-choice" data-use-reference="${e(r.id)}" type="button">${index.refNumbers[r.id]?`[${index.refNumbers[r.id]}] `:''}${e(r.title || r.raw || '未命名文献')}</button>`).join('') || '<p>还没有已录入文献。</p>';
    $('referenceDialog').showModal();
  }
  function submitReference(event){
    event.preventDefault();const insert=$('referenceInsert').checked;if(insert&&!insertionRange())return;
    const ref={id:$('referenceEditId').value || id('ref')};
    for(const key of ['authors','title','source','year','volume','issue','pages','doi','raw','type'])ref[key]=$(`reference-${key}`).value.trim();
    if(!ref.raw&&(!ref.authors||!ref.title)){$('referenceError').textContent='请填写作者和文献题名，或录入完整著录信息。';return;}
    rememberHistory(true);const at=state.references.findIndex(r=>r.id===ref.id);if(at<0)state.references.push(ref);else state.references[at]=ref;
    if(insert)insertReference(ref.id,true);
    else{$('referenceDialog').close();renderStructuredEditor();scheduleSaveAndRender();showToast('文献信息已保存');}
  }
  function insertReference(referenceId,historyTaken=false){
    const position=insertionRange();if(!position)return;if(!historyTaken)rememberHistory(true);
    const {range,container}=position;range.collapse(true);
    const node=document.createElement('sup');node.className='citation';node.contentEditable='false';node.dataset.referenceId=referenceId;node.textContent='[·]';range.insertNode(node);
    const after=document.createTextNode('');node.after(after);range.setStartAfter(node);range.collapse(true);const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);container.focus();
    readManuscript(container);captureSelection();updateCitationLabels();$('referenceDialog').close();scheduleSaveAndRender();showToast('已插入上标引用');
  }
  function updateCitationLabels(){
    const index=M.indexProject(state);editor.querySelectorAll('[data-reference-id]').forEach(node=>node.textContent=`[${index.refNumbers[node.dataset.referenceId] || '?'}]`);
    editor.querySelectorAll('[data-image-id]').forEach(node=>{const block=state.sections.flatMap(s=>s.blocks).find(b=>b.id===node.dataset.imageId);if(block){const show=block.numbered&&(block.kind!=='equation'||state.formatRules.numbering.equations);node.querySelector('figcaption').textContent=[show?index.images[block.id]?.label:'',block.caption].filter(Boolean).join(' ') || '未填写说明';}});
    const library=editor.querySelector('.reference-library');if(library){const holder=document.createElement('div');holder.innerHTML=referenceLibraryHtml();library.replaceWith(holder.firstElementChild);}
  }
  function syncContent(){
    const index=M.indexProject(state);
    state.sections.forEach(s=>s.body=M.blocksText(s.blocks));
    // Legacy checks need searchable HTML, not duplicate embedded image data.
    state.content=state.sections.map(s=>`<h${s.level} id="${e(s.id)}">${e(index.headings[s.id] || s.title)}</h${s.level}>`+(s.blocks || []).map(b=>b.type==='image'?`<p>${e(b.caption)}</p>`:`<p>${b.inlines.map(r=>r.type==='text'?e(r.text):`<sup>[${index.refNumbers[r.referenceId] || '?'}]</sup>`).join('')}</p>`).join('')).join('');
  }
  function renderAll(){
    syncContent();renderOutline(collectHeadings());runChecks(collectHeadings());updateWordCount();updateProgress();updateCursorState();updateProjectLabels();updateCitationLabels();
    if(state.formatReady && !$('workbench').hidden)schedulePreview();
  }
  function schedulePreview(immediate=false){
    clearTimeout(previewTimer);if(!state.formatReady)return;
    if(immediate){compilePreview();return;}
    $('compileStatus').textContent=lastPdfUrl?'内容已变更，等待更新预览…':'等待生成排版预览…';
    previewTimer=setTimeout(compilePreview,1100);
  }
  async function binaryRequest(path,project,signal){
    const body=JSON.stringify({project});
    if(new Blob([body]).size>(capabilities?.maxRequestBytes || 20*1024*1024))throw new Error('当前论文图片总量超过此部署的处理上限，请压缩图片或联系管理员调整服务。');
    const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body,signal});
    if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(result.error?.message || result.error || '请求失败，请稍后重试。');}
    return response.blob();
  }
  async function compilePreview(){
    const project=currentModel(),key=JSON.stringify([project.sections,project.metadata,project.references,project.formatRules]);
    if(key===lastPreviewKey&&lastPdfUrl){$('compileStatus').textContent='预览已更新';return;}
    previewController?.abort();previewController=new AbortController();const version=++previewVersion;
    $('compileStatus').textContent='正在排版…';$('previewError').hidden=true;
    try{
      const blob=await binaryRequest('/api/preview',project,previewController.signal);
      if(version!==previewVersion)return;
      if(blob.type!=='application/pdf')throw new Error('排版服务未返回有效 PDF。');
      const url=URL.createObjectURL(blob),previous=lastPdfUrl;lastPdfUrl=url;lastPreviewKey=key;
      $('compiledPdf').src=`${url}#toolbar=0&view=FitH`;$('compiledPdf').hidden=false;$('previewEmpty').hidden=true;
      if(previous)setTimeout(()=>URL.revokeObjectURL(previous),2000);
      $('compileStatus').textContent='预览已更新';
    }catch(err){if(err.name==='AbortError'||version!==previewVersion)return;$('compileStatus').textContent=lastPdfUrl?'预览尚未更新，显示上次排版':'排版未完成';$('previewError').textContent=err.message;$('previewError').hidden=false;}
  }
  async function exportDocument(type){
    if(!state.formatReady){showSetup(true);return;}
    const button=$(type==='pdf'?'exportPdf':'exportWord');button.disabled=true;const label=button.textContent;
    button.textContent='正在生成…';syncContent();persistState();
    try{const blob=await binaryRequest(`/api/export/${type}`,currentModel());downloadBlob(`${safeFileName(state.metadata.title || '论文')}.${type==='word'?'docx':'pdf'}`,blob);showToast('文件已生成');}
    catch(err){showToast(err.message,'error');}finally{button.disabled=false;button.textContent=label;}
  }
  function invalidatePreview(){previewController?.abort();previewVersion++;lastPreviewKey='';if(lastPdfUrl){URL.revokeObjectURL(lastPdfUrl);lastPdfUrl='';}$('compiledPdf').removeAttribute('src');$('compiledPdf').hidden=true;$('previewEmpty').hidden=false;$('previewError').hidden=true;resetHistory();}
  function normalizeState(base,incoming){const model=M.normalizeProject({...base,...incoming,metadata:{...base.metadata,...incoming.metadata},template:{...base.template,...incoming.template}});return {...model,id:incoming.id || null,revision:Number(incoming.revision || 0),clientUpdatedAt:incoming.clientUpdatedAt || incoming.updatedAt || new Date().toISOString()};}
  return {initialize,sectionCardHtml,rememberHistory,resetHistory,renderAll,syncContent,showSetup,enterEditor,exportDocument,invalidatePreview,normalizeState,schedulePreview};
})();
