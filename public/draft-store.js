const DraftStore=(()=>{
  let connection,queue=Promise.resolve();
  async function database(){
    if(connection)return connection;
    connection=new Promise((resolve,reject)=>{
      const request=indexedDB.open('thesis-editor-drafts',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('drafts');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
    });
    return connection;
  }
  async function read(){const db=await database();return new Promise((resolve,reject)=>{const request=db.transaction('drafts','readonly').objectStore('drafts').get('current');request.onsuccess=()=>resolve(request.result || null);request.onerror=()=>reject(request.error);});}
  function write(snapshot){
    const value=JSON.parse(JSON.stringify(snapshot));
    const operation=queue.catch(()=>{}).then(async()=>{
      const db=await database();return new Promise((resolve,reject)=>{
        const transaction=db.transaction('drafts','readwrite');transaction.objectStore('drafts').put(value,'current');
        transaction.oncomplete=()=>resolve();transaction.onerror=()=>reject(transaction.error);transaction.onabort=()=>reject(transaction.error || new Error('Draft transaction aborted'));
      });
    });queue=operation;return operation;
  }
  return {read,write};
})();
