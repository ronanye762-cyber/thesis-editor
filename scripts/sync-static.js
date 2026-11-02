const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
for(const name of ['index.html','styles.css','app.js','document-model.js','draft-store.js','workflow.js','workflow.css'])fs.copyFileSync(path.join(root,'public',name),path.join(root,name));
console.log('Static mirrors updated');
