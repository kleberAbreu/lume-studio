import type {Receipt} from './costs';
export type Version = {id:string; root:string; parent?:string; created:number; prompt:string; size:string; quality:string; blob?:Blob; draft?:boolean; draftFile?:Blob; title:string; original?:boolean; local?:boolean; receipt?:Receipt|null};
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

export async function localIds(account:string):Promise<string[]> {
  const db=await open(account);
  return new Promise((resolve,reject)=>{const r=db.transaction('versions').objectStore('versions').getAllKeys();
    r.onsuccess=()=>resolve(r.result.map(String));r.onerror=()=>reject(r.error)});
}
export async function localVersion(account:string,id:string):Promise<Version|undefined> {
  const db=await open(account);
  return new Promise((resolve,reject)=>{const r=db.transaction('versions').objectStore('versions').get(id);
    r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});
}
export function galleryUrl(account:string,params:Record<string,string>={}) {
  return '/img_editor/api/gallery?'+new URLSearchParams({account,...params});
}
export function mediaUrl(account:string,id:string,kind='image') {
  return galleryUrl(account,{op:'media',id,kind});
}
export async function galleryRequest(account:string,params:Record<string,string>,body?:BodyInit) {
  const response=await fetch(galleryUrl(account,params),{cache:'no-store',method:body===undefined?'GET':'POST',
    headers:{'x-lume-account':account},body});
  if(!response.ok) throw Error((await response.json().catch(()=>null))?.error || 'Não foi possível sincronizar a galeria.');
  return response.json();
}
export async function versionBlob(account:string,v:Version,kind:'image'|'state'='image') {
  const local=kind==='image'?v.blob:v.draftFile;
  if(local) return local;
  const response=await fetch(mediaUrl(account,v.id,kind));
  if(!response.ok) throw Error('Não foi possível abrir esta versão. Confira a conexão.');
  return response.blob();
}
async function uploadFile(account:string,file:Blob) {
  const parts:string[]=[];
  const size=4*1024*1024;
  for(let start=0;start<file.size;start+=size) {
    const {hash}=await galleryRequest(account,{op:'chunk'},file.slice(start,start+size));
    parts.push(hash);
  }
  return {type:file.type,parts};
}
async function thumbnail(photo:Blob) {
  const bitmap=await createImageBitmap(photo);
  try {
    const scale=Math.min(1,512/Math.max(bitmap.width,bitmap.height));
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));
    canvas.getContext('2d')!.drawImage(bitmap,0,0,canvas.width,canvas.height);
    return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao criar a miniatura.')),'image/webp',.8));
  } finally {bitmap.close()}
}
export async function pushVersion(account:string,v:Version) {
  const {blob,draftFile,...meta}=v;
  if(!blob) throw Error('A imagem local está indisponível.');
  const image=await uploadFile(account,blob);
  const thumb=await uploadFile(account,await thumbnail(blob));
  const state=draftFile?await uploadFile(account,draftFile):undefined;
  await galleryRequest(account,{op:'version'},JSON.stringify({meta,image,thumb,state}));
}
