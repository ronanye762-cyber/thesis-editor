const config = require('./config');
const Model = require('../public/document-model');

function escapeTex(value) {
  return String(value ?? '').replace(/[\\{}$&#%_^~]/g,c=>({'\\':'\\textbackslash{}','{':'\\{','}':'\\}','$':'\\$','&':'\\&','#':'\\#','%':'\\%','_':'\\_','^':'\\textasciicircum{}','~':'\\textasciitilde{}'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/\r?\n/g,' ');
}
function safeFont(name) { if(!/^[\w .-]{1,100}$/.test(name))throw new Error('Invalid server font configuration'); return name; }
function fontOptions(key){
  const name=config.fonts[key];
  if(name==='FandolSong-Regular.otf')return '[BoldFont=FandolSong-Bold.otf]';
  if(name==='FandolHei-Regular.otf')return '[BoldFont=FandolHei-Bold.otf]';
  if(name==='FandolKai-Regular.otf'||name==='FandolFang-Regular.otf')return '[AutoFakeBold=2]';
  if(/^texgyre(?:termes|heros)-regular\.otf$/.test(name)){const family=name.replace('-regular.otf','');return `[BoldFont=${family}-bold.otf,ItalicFont=${family}-italic.otf,BoldItalicFont=${family}-bolditalic.otf]`;}
  return '';
}
const fontCommands={songti:'\\songti',heiti:'\\heiti',kaiti:'\\kaishu',fangsong:'\\fangsong'};
function fontStyle(style) { return `${fontCommands[style.font] || '\\songti'}\\fontsize{${style.sizePt}}{${Math.round(style.sizePt*1.3*100)/100}}\\selectfont${style.bold?'\\bfseries':'\\mdseries'}`; }
function buildLatex(input) {
  const project=Model.normalizeProject(input), r=project.formatRules, meta=project.metadata, index=Model.indexProject(project), files=[];
  const bodyBase=r.body.exactLinePt || r.body.sizePt*r.body.lineSpacing;
  const bodyStyle=`${fontCommands[r.body.font]}\\fontsize{${r.body.sizePt}}{${bodyBase}}\\selectfont`;
  const headingKeys=['chapter','section','subsection'];
  const headingSettings=r.headings.map((s,i)=>`${headingKeys[i]}={format={${s.align==='center'?'\\centering':s.align==='right'?'\\raggedleft':'\\raggedright'}${fontStyle(s)}},beforeskip=${s.beforePt}pt,afterskip=${s.afterPt}pt}`).join(',\n');
  const pageText=escapeTex(r.footer.style).replace(/\\\{page\\\}/g,'\\thepage{}').replace(/\\\{pages\\\}/g,'\\pageref{LastPage}');
  let source=`\\documentclass[UTF8,scheme=plain,fontset=none,a4paper,oneside,openany]{ctexrep}
\\usepackage[left=${r.page.leftMm}mm,right=${r.page.rightMm}mm,top=${r.page.topMm}mm,bottom=${r.page.bottomMm}mm,headsep=${Math.max(1,r.page.topMm-r.page.headerMm-Math.max(16,r.header.sizePt*1.5)*25.4/72)}mm,footskip=${Math.max(1,r.page.bottomMm-r.page.footerMm)}mm]{geometry}
\\usepackage{graphicx,caption,fancyhdr,lastpage,needspace,tabularx,booktabs,indentfirst}
\\usepackage[unicode,hidelinks]{hyperref}
\\setmainfont${fontOptions(r.body.latinFont)}{${safeFont(config.fonts[r.body.latinFont])}}
\\setCJKmainfont${fontOptions('songti')}{${safeFont(config.fonts.songti)}}
\\setCJKsansfont${fontOptions('heiti')}{${safeFont(config.fonts.heiti)}}
\\setCJKmonofont${fontOptions('fangsong')}{${safeFont(config.fonts.fangsong)}}
\\setCJKfamilyfont{zhsong}${fontOptions('songti')}{${safeFont(config.fonts.songti)}}
\\setCJKfamilyfont{zhhei}${fontOptions('heiti')}{${safeFont(config.fonts.heiti)}}
\\setCJKfamilyfont{zhkai}${fontOptions('kaiti')}{${safeFont(config.fonts.kaiti)}}
\\setCJKfamilyfont{zhfs}${fontOptions('fangsong')}{${safeFont(config.fonts.fangsong)}}
\\providecommand{\\songti}{\\CJKfamily{zhsong}}
\\providecommand{\\heiti}{\\CJKfamily{zhhei}}
\\providecommand{\\kaishu}{\\CJKfamily{zhkai}}
\\providecommand{\\fangsong}{\\CJKfamily{zhfs}}
\\ctexset{${headingSettings}}
\\pagestyle{fancy}\\fancyhf{}
\\setlength{\\headheight}{${Math.max(16,r.header.sizePt*1.5)}pt}
\\renewcommand{\\headrulewidth}{${r.header.line?'0.4':'0'}pt}
\\fancyhead[C]{{${fontStyle(r.header)} ${escapeTex(r.header.text)}}}
\\fancyfoot[C]{{\\fontsize{${r.footer.sizePt}}{${r.footer.sizePt*1.3}}\\selectfont ${r.footer.pageNumbers?pageText:''}}}
\\fancypagestyle{plain}{\\fancyhf{}\\fancyhead[C]{{${fontStyle(r.header)} ${escapeTex(r.header.text)}}}\\fancyfoot[C]{${r.footer.pageNumbers?pageText:''}}\\renewcommand{\\headrulewidth}{${r.header.line?'0.4':'0'}pt}}
\\setlength{\\parindent}{${r.body.indentEm}em}
\\setlength{\\parskip}{${r.body.afterPt}pt}
\\setcounter{tocdepth}{${r.toc.depth-1}}
\\renewcommand{\\contentsname}{${escapeTex(r.toc.title)}}
\\raggedbottom
\\begin{document}
${bodyStyle}
`;
  if(r.cover.enabled){
    const coverLine=(label,value)=>`\\noindent ${escapeTex(label)}：\\underline{\\makebox[0.65\\linewidth][c]{${escapeTex(value)}}}\\par\\vspace{6mm}\n`;
    source+=`\\begin{titlepage}\\thispagestyle{empty}\\begin{flushright}学校代码：${escapeTex(meta.schoolCode)}\\\\ 学号：${escapeTex(meta.studentId)}\\end{flushright}
\\vspace*{20mm}\\begin{center}{\\heiti\\fontsize{${r.cover.schoolSizePt}}{${r.cover.schoolSizePt*1.4}}\\selectfont ${escapeTex(meta.school)}}\\par\\vspace{12mm}
{\\heiti\\fontsize{${r.cover.titleSizePt}}{${r.cover.titleSizePt*1.4}}\\selectfont ${escapeTex(meta.paperType || '论文')}}\\par\\vspace{10mm}
{\\heiti\\Large ${escapeTex(meta.title || project.title || '未命名论文')}}\\par\\vspace{20mm}\\end{center}
{\\fontsize{${r.cover.labelSizePt}}{${r.cover.labelSizePt*1.6}}\\selectfont
${[['专业',meta.major],['研究方向',meta.realm],['姓名',meta.author],['指导教师',meta.supervisor]].filter(([,v])=>v).map(([k,v])=>coverLine(k,v)).join('')}}
\\vfill\\begin{center}提交日期：${escapeTex(meta.date)}\\end{center}\\end{titlepage}\n`;
  }
  if(r.abstract.enabled){
    for(const [title,body,keywords] of [['中文摘要',meta.abstractCn,meta.keywords],['Abstract',meta.abstractEn,meta.keywordsEn || meta.keywords]]){
      if(title==='Abstract' && !body)continue;
      if(title==='中文摘要'||r.abstract.separatePages)source+='\\clearpage\n';
      source+=`\\begin{center}{${fontStyle(r.headings[0])} ${title}}\\end{center}\n${bodyStyle}\n${String(body || '').split(/\n+/).map(escapeTex).join('\n\\par\n')}\\par\n\\noindent\\textbf{${title==='Abstract'?'Keywords:':'关键词：'}}${escapeTex(keywords)}\n`;
    }
  }
  if(r.toc.enabled)source+='\\tableofcontents\\clearpage\n';
  const inlines=(runs)=>(runs||[]).map(run=>run.type==='citation'?`\\textsuperscript{[${index.refNumbers[run.referenceId] || '?'}]}`:escapeTex(run.text)).join('');
  const captionStyle=fontStyle(r.caption);
  for(const section of project.sections){
    if(section.kind==='references')continue;
    const command=headingKeys[section.level-1];
    source+=`\\${command}*{${escapeTex(index.headings[section.id])}}\\phantomsection\\addcontentsline{toc}{${command}}{${escapeTex(index.headings[section.id])}}\n${bodyStyle}\n`;
    for(const block of section.blocks){
      if(block.type==='paragraph'){source+=`\\vspace{${r.body.beforePt}pt}${inlines(block.inlines)}\\par\n`;continue;}
      if(!block.dataUrl)continue;
      const match=block.dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);
      if(!match)continue;
      const filename=`image-${files.length+1}.${match[1]==='jpeg'?'jpg':'png'}`;
      files.push({name:filename,base64:match[2]});
      const label=index.images[block.id]?.label || '';
      const numbered=block.numbered && (block.kind!=='equation' || r.numbering.equations);
      const caption=[numbered?label:'',block.caption].filter(Boolean).join(' ');
      const captionTex=caption?`{${r.caption.align==='left'?'\\raggedright':r.caption.align==='right'?'\\raggedleft':'\\centering'}${captionStyle} ${escapeTex(caption)}\\par}\\vspace{3mm}\n`:'';
      // A non-floating minipage anchors the image to its paragraph; TeX moves the whole unit if necessary.
      source+=`\\par\\addvspace{6pt}\\noindent\\begin{minipage}{\\linewidth}\\centering\n`;
      if(block.kind==='table' && r.caption.tablePosition==='above')source+=captionTex;
      source+=`\\includegraphics[width=${block.widthPercent/100}\\linewidth,height=0.70\\textheight,keepaspectratio]{${filename}}\\par\\vspace{2mm}\n`;
      if(block.kind!=='table' || r.caption.tablePosition!=='above')source+=captionTex;
      source+='\\end{minipage}\\par\\addvspace{6pt}\n';
    }
    if(section.legacyTable){const t=section.legacyTable,headers=(t.headers || []).slice(0,20);if(headers.length){source+=`\\begin{tabularx}{\\linewidth}{${headers.map(()=>'X').join('')}}\\toprule\n${headers.map(escapeTex).join(' & ')}\\\\\\midrule\n${String(t.rows || '').split(/\n/).map(row=>row.split(/[｜|\t]/).slice(0,headers.length).map(escapeTex).join(' & ')+'\\\\').join('\n')}\n\\bottomrule\\end{tabularx}\\par\n${escapeTex(t.caption)}\\par\n`;}}
  }
  if(index.usedReferences.length){
    source+=`\\chapter*{参考文献}\\phantomsection\\addcontentsline{toc}{chapter}{参考文献}\n\\begingroup\\songti\\fontsize{${r.references.sizePt}}{${r.references.sizePt*r.references.lineSpacing}}\\selectfont\n\\begin{list}{}{\\setlength{\\leftmargin}{2.5em}\\setlength{\\labelwidth}{2em}\\setlength{\\itemsep}{4pt}}\n`;
    index.usedReferences.forEach(ref=>source+=`\\item[{[${index.refNumbers[ref.id]}]}] ${escapeTex(Model.referenceText(ref))}\n`);
    source+='\\end{list}\\endgroup\n';
  }
  source+='\\end{document}\n';
  return {source,files};
}
module.exports={buildLatex,escapeTex};
