import type {Receipt} from './costs';
export type Version = {id:string; root:string; parent?:string; created:number; prompt:string; size:string; quality:string; blob:Blob; title:string; original?:boolean; local?:boolean; receipt?:Receipt|null};
const databases=new Map<string,Promise<IDBDatabase>>();
function open(account:string){
  let database=databases.get(account);
  if(!database) database=new Promise((resolve,reject)=>{
    const req=indexedDB.open('lume-studio-v1-'+account,1);
    req.onupgradeneeded=()=>req.result.createObjectStore('versions',{keyPath:'id'});
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>{databases.delete(account);reject(req.error)};
  });
  databases.set(account,database);
  return database;
}
export async function listVersions(account:string):Promise<Version[]>{
  const db=await open(account);
  return new Promise((resolve,reject)=>{const req=db.transaction('versions').objectStore('versions').getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});
}
export async function saveVersions(account:string,items:Version[]){
  const db=await open(account);
  return new Promise<void>((resolve,reject)=>{
    const tx=db.transaction('versions','readwrite');
    items.forEach(v=>tx.objectStore('versions').put(v));
    tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
  });
}
