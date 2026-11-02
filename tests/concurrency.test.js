const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
process.env.DATA_DIR=fs.mkdtempSync(path.join(os.tmpdir(),'thesis-storage-test-'));
for(const key of ['KV_REST_API_URL','KV_REST_API_TOKEN','UPSTASH_REDIS_REST_URL','UPSTASH_REDIS_REST_TOKEN'])delete process.env[key];
const {mutateCollection,readCollection}=require('../src/storage');
test('simultaneous writes to different projects are retained',async()=>{
  await mutateCollection('projects',()=>[{id:'a',revision:1},{id:'b',revision:1}]);
  await Promise.all(['a','b'].map(id=>mutateCollection('projects',rows=>rows.map(r=>r.id===id?{...r,revision:r.revision+1}:r))));
  assert.deepEqual((await readCollection('projects')).map(r=>r.revision),[2,2]);
});
test('compare-and-update rejects one of two concurrent writers with the same revision',async()=>{
  await mutateCollection('projects',()=>[{id:'a',revision:1}]);
  const save=()=>mutateCollection('projects',rows=>{assert.equal(rows[0].revision,1);rows[0].revision=2;return rows;});
  const results=await Promise.allSettled([save(),save()]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
});
