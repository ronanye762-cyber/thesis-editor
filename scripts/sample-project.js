const {deflateSync}=require('node:zlib');
const M=require('../public/document-model');
function sampleImage(){
  const width=480,height=180,raw=Buffer.alloc((width*3+1)*height,255);
  for(let y=0;y<height;y++){raw[y*(width*3+1)]=0;for(let x=0;x<width;x++){const at=y*(width*3+1)+x*3+1;const bar=x>50&&x<120&&y>80 || x>180&&x<250&&y>45 || x>310&&x<380&&y>15;if(bar){raw[at]=40;raw[at+1]=95;raw[at+2]=165;}}}
  function crc(buf){let c=0xffffffff;for(const byte of buf){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
  function chunk(name,data){const t=Buffer.from(name),length=Buffer.alloc(4),sum=Buffer.alloc(4);length.writeUInt32BE(data.length);sum.writeUInt32BE(crc(Buffer.concat([t,data])));return Buffer.concat([length,t,data,sum]);}
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;
  return 'data:image/png;base64,'+Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]).toString('base64');
}
function sampleProject(){return M.normalizeProject({formatReady:true,requirementsText:'A4纸；宋体小四，1.5倍行距；按章编号；文献上标。',metadata:{school:'示例大学',schoolCode:'10000',studentId:'20260001',title:'论文格式助手排版验证',paperType:'本科毕业论文',major:'信息管理',author:'测试作者',supervisor:'测试导师',date:'2026-11-02',abstractCn:'本示例用于检查中文正文、目录、图题、文献上标与文件导出的排版效果。',keywords:'论文排版；文献引用；格式验证'},references:[{id:'ref-one',authors:'张三, 李四',title:'论文排版方法研究',source:'示例学报',year:'2026',volume:'12',issue:'3',pages:'10-18',type:'J'}],sections:[{id:'sec-intro',level:1,title:'绪论',blocks:[{type:'paragraph',inlines:[{type:'text',text:'这段正文的中间有一处文献引用'},{type:'citation',referenceId:'ref-one'},{type:'text',text:'，后面的文字继续正常排版。正文也包含 50% 和 A_B & C # D 等特殊字符。'}]},{type:'image',id:'img-sample',kind:'figure',dataUrl:sampleImage(),caption:'不同阶段的示例指标',widthPercent:75,numbered:true},{type:'paragraph',inlines:[{type:'text',text:'图片与标题应保持在一起；正文可以在图片之后继续编辑。'}]}]},{id:'sec-method',level:1,title:'研究方法',blocks:[M.paragraph('我们将格式要求、正文与附件分别保存，再根据统一的格式规则生成排版文件。'.repeat(12)),{type:'paragraph',inlines:[{type:'text',text:'再次引用同一篇文献'},{type:'citation',referenceId:'ref-one'},{type:'text',text:'时，编号保持一致。'}]}]},{id:'sec-references',kind:'references',level:1,title:'参考文献',blocks:[]}]});}
module.exports={sampleProject,sampleImage};
