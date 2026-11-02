const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {sampleProject}=require('./sample-project');
const {compileProject}=require('../src/compiler');
const {buildDocx}=require('../src/docx-exporter');
async function main(){
  const dir=process.argv[2] || path.join(os.tmpdir(),'thesis-output-qa');await fs.mkdir(dir,{recursive:true});
  const project=sampleProject();await fs.writeFile(`${dir}/sample.docx`,await buildDocx(project));
  const pdf=await compileProject(project);await fs.writeFile(`${dir}/sample.pdf`,pdf);console.log(`Real LaTeX compile passed: ${pdf.length} bytes; outputs: ${dir}`);
}
main().catch(err=>{console.error(err.message);process.exitCode=1;});
