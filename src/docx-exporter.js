const {Document,Paragraph,TextRun,ImageRun,Packer,Header,Footer,TableOfContents,PageNumber,HeadingLevel,AlignmentType,LineRuleType,Table,TableRow,TableCell,WidthType}=require('docx');
const {imageSize}=require('image-size');
const Model=require('../public/document-model');
const fonts={songti:'宋体',heiti:'黑体',kaiti:'楷体',fangsong:'仿宋'};
const mm=value=>Math.round(value*1440/25.4);
const alignment=value=>({center:AlignmentType.CENTER,right:AlignmentType.RIGHT,left:AlignmentType.LEFT}[value] || AlignmentType.LEFT);
async function buildDocx(input){
  const project=Model.normalizeProject(input),r=project.formatRules,m=project.metadata,index=Model.indexProject(project);
  const font=(style)=>({ascii:r.body.latinFont==='arial'?'Arial':'Times New Roman',hAnsi:r.body.latinFont==='arial'?'Arial':'Times New Roman',eastAsia:fonts[style.font || r.body.font],hint:'eastAsia'});
  const run=(text,style=r.body,extra={})=>new TextRun({text:String(text || ''),font:font(style),size:style.sizePt*2,bold:Boolean(style.bold),color:'000000',language:{value:'zh-CN',eastAsia:'zh-CN'},...extra});
  const spacing={line:r.body.exactLinePt?Math.round(r.body.exactLinePt*20):Math.round(r.body.lineSpacing*240),lineRule:r.body.exactLinePt?LineRuleType.EXACT:LineRuleType.AUTO,before:r.body.beforePt*20,after:r.body.afterPt*20};
  const para=(children,options={})=>new Paragraph({children,spacing,indent:{firstLine:r.body.indentEm*r.body.sizePt*20},...options});
  const heading=(title,level=1,options={})=>{const s=r.headings[level-1];return para([run(title,s)],{...(options.inToc===false?{}:{heading:[HeadingLevel.HEADING_1,HeadingLevel.HEADING_2,HeadingLevel.HEADING_3][level-1]}),alignment:alignment(s.align),indent:{firstLine:0},spacing:{before:s.beforePt*20,after:s.afterPt*20},keepNext:true,pageBreakBefore:options.newPage!==false&&level===1});};
  const content=[];
  if(r.cover.enabled){
    content.push(para([run(`学校代码：${m.schoolCode || ''}    学号：${m.studentId || ''}`)],{alignment:AlignmentType.RIGHT,indent:{firstLine:0}}));
    content.push(para([run(m.school,{font:'heiti',sizePt:r.cover.schoolSizePt,bold:true})],{alignment:AlignmentType.CENTER,spacing:{before:1200,after:600},indent:{firstLine:0}}));
    content.push(para([run(m.paperType || '论文',{font:'heiti',sizePt:r.cover.titleSizePt,bold:true})],{alignment:AlignmentType.CENTER,indent:{firstLine:0}}));
    content.push(para([run(m.title || project.title,{font:'heiti',sizePt:r.cover.titleSizePt,bold:true})],{alignment:AlignmentType.CENTER,spacing:{before:400,after:1000},indent:{firstLine:0}}));
    for(const [label,value] of [['专业',m.major],['研究方向',m.realm],['姓名',m.author],['指导教师',m.supervisor]])if(value)content.push(para([run(`${label}：${value}`,{font:'songti',sizePt:r.cover.labelSizePt})],{alignment:AlignmentType.CENTER,indent:{firstLine:0},spacing:{after:300}}));
    content.push(para([run(`提交日期：${m.date || ''}`)],{alignment:AlignmentType.CENTER,indent:{firstLine:0},spacing:{before:800}}));
  }
  const coverEnd=content.length;
  if(r.abstract.enabled){for(const [title,body,keys] of [['中文摘要',m.abstractCn,m.keywords],['Abstract',m.abstractEn,m.keywordsEn || m.keywords]]){if(title==='Abstract'&&!body)continue;content.push(heading(title,1,{inToc:false,newPage:title==='中文摘要'||r.abstract.separatePages}));for(const line of String(body || '').split(/\n/))content.push(para([run(line)]));content.push(para([run(`${title==='Abstract'?'Keywords:':'关键词：'}${keys || ''}`)],{indent:{firstLine:0}}));}}
  if(r.toc.enabled){content.push(heading(r.toc.title,1,{inToc:false}));content.push(new TableOfContents(r.toc.title,{hyperlink:true,headingStyleRange:`1-${r.toc.depth}`}));}
  for(const section of project.sections){
    if(section.kind==='references')continue;
    content.push(heading(index.headings[section.id],section.level));
    for(const block of section.blocks){
      if(block.type==='paragraph'){
        content.push(para(block.inlines.map(inline=>inline.type==='citation'?run(`[${index.refNumbers[inline.referenceId] || '?'}]`,r.body,{superScript:true}):run(inline.text))));continue;
      }
      if(!block.dataUrl)continue;
      const match=block.dataUrl.match(/^data:image\/(png|jpeg);base64,(.+)$/);if(!match)continue;
      const buffer=Buffer.from(match[2],'base64');
      let dimensions;try{dimensions=imageSize(buffer);}catch{throw Object.assign(new Error('图片无法读取，请重新上传有效的 PNG 或 JPEG 图片。'),{statusCode:422});}
      if(!dimensions.width || !dimensions.height || dimensions.width*dimensions.height>60000000)throw Object.assign(new Error('图片尺寸无效或过大。'),{statusCode:422});
      const maxWidth=(210-r.page.leftMm-r.page.rightMm)*96/25.4*block.widthPercent/100,maxHeight=(297-r.page.topMm-r.page.bottomMm)*96/25.4*0.70;
      const scale=Math.min(maxWidth/dimensions.width,maxHeight/dimensions.height);
      const numbered=block.numbered&&(block.kind!=='equation'||r.numbering.equations);
      const caption=[numbered?index.images[block.id]?.label:'',block.caption].filter(Boolean).join(' ');
      const captionParagraph=()=>para([run(caption,r.caption)],{alignment:alignment(r.caption.align),indent:{firstLine:0},keepNext:block.kind==='table'&&r.caption.tablePosition==='above',spacing:{before:80,after:120}});
      if(caption&&block.kind==='table'&&r.caption.tablePosition==='above')content.push(captionParagraph());
      content.push(para([new ImageRun({type:match[1]==='jpeg'?'jpg':'png',data:buffer,transformation:{width:Math.round(dimensions.width*scale),height:Math.round(dimensions.height*scale)},altText:{title:block.caption,description:block.alt,name:block.id}})],{alignment:AlignmentType.CENTER,indent:{firstLine:0},keepLines:true,keepNext:Boolean(caption&&(block.kind!=='table'||r.caption.tablePosition==='below')),spacing:{before:120,after:80}}));
      if(caption&&(block.kind!=='table'||r.caption.tablePosition==='below'))content.push(captionParagraph());
    }
    if(section.legacyTable){const t=section.legacyTable;const rows=[t.headers || [],...String(t.rows || '').split(/\n/).map(line=>line.split(/[｜|\t]/))];content.push(new Table({width:{size:100,type:WidthType.PERCENTAGE},rows:rows.map(row=>new TableRow({children:row.map(value=>new TableCell({children:[para([run(value)],{indent:{firstLine:0}})]}))}))}));}
  }
  if(index.usedReferences.length){content.push(heading('参考文献'));for(const ref of index.usedReferences)content.push(para([run(`[${index.refNumbers[ref.id]}] ${Model.referenceText(ref)}`,{font:r.body.font,sizePt:r.references.sizePt})],{indent:{firstLine:0,hanging:360,left:360},spacing:{line:Math.round(r.references.lineSpacing*240),lineRule:LineRuleType.AUTO,after:80}}));}
  const footer=[];for(const piece of r.footer.style.split(/(\{page\}|\{pages\})/)){if(piece==='{page}')footer.push(new TextRun({children:[PageNumber.CURRENT]}));else if(piece==='{pages}')footer.push(new TextRun({children:[PageNumber.TOTAL_PAGES]}));else if(piece)footer.push(run(piece,{font:r.body.font,sizePt:r.footer.sizePt}));}
  const page={size:{width:mm(210),height:mm(297)},margin:{top:mm(r.page.topMm),bottom:mm(r.page.bottomMm),left:mm(r.page.leftMm),right:mm(r.page.rightMm),header:mm(r.page.headerMm),footer:mm(r.page.footerMm)}};
  const sections=[];
  if(r.cover.enabled)sections.push({properties:{page},children:content.slice(0,coverEnd)});
  sections.push({
    properties:{page:{...page,pageNumbers:{start:1}}},
    headers:{default:new Header({children:[para([run(r.header.text,r.header)],{alignment:AlignmentType.CENTER,indent:{firstLine:0},...(r.header.line?{border:{bottom:{color:'000000',size:4,style:'single'}}}:{})})]})},
    footers:{default:new Footer({children:[para(r.footer.pageNumbers?footer:[],{alignment:AlignmentType.CENTER,indent:{firstLine:0}})]})},children:content.slice(coverEnd).length?content.slice(coverEnd):[para([run('')])],
  });
  const doc=new Document({creator:'格式助手',title:m.title || project.title,description:'按论文格式要求生成的可编辑文档',features:{updateFields:true},styles:{default:{document:{run:{font:font(r.body),size:r.body.sizePt*2,color:'000000'},paragraph:{spacing}}}},sections});
  return Packer.toBuffer(doc);
}
module.exports={buildDocx};
