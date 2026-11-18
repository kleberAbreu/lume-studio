import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash, randomBytes} from 'node:crypto';

export const chunkSize = 4 * 1024 * 1024;
const uuid = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const digest = /^[a-f0-9]{64}$/;
const mime = ['image/png','image/jpeg','image/webp'];
export class GalleryError extends Error {
  constructor(status,message) {super(message);this.status=status}
}
function requireValue(ok, message, status=400) {
  if (!ok) throw new GalleryError(status,message);
}
const databases=new Map();
export function database(dir=process.env.LUME_GALLERY_DIR || '.lume-gallery') {
  if (databases.has(dir)) return databases.get(dir);
  mkdirSync(dir,{recursive:true,mode:0o700});
  const db=new DatabaseSync(join(dir,'gallery.sqlite'));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS chunks(owner TEXT, hash TEXT, bytes BLOB NOT NULL, PRIMARY KEY(owner,hash));
    CREATE TABLE IF NOT EXISTS versions(owner TEXT, id TEXT, root TEXT, created INTEGER, meta TEXT NOT NULL, assets TEXT NOT NULL, PRIMARY KEY(owner,id));
    CREATE INDEX IF NOT EXISTS gallery_project ON versions(owner,root,created);
    CREATE TABLE IF NOT EXISTS links(token TEXT PRIMARY KEY, owner TEXT, scope TEXT, target TEXT, UNIQUE(owner,scope,target));`);
  databases.set(dir,db);
  return db;
}
export function putChunk(db,owner,bytes) {
  requireValue(bytes.length && bytes.length<=chunkSize,'Parte de arquivo inválida.',413);
  const hash=createHash('sha256').update(bytes).digest('hex');
  db.prepare('INSERT OR IGNORE INTO chunks VALUES(?,?,?)').run(owner,hash,bytes);
  return hash;
}
function textField(s, max) {return typeof s==='string' && s.length<=max}
function versionMeta(v) {
  requireValue(v && uuid.test(v.id) && uuid.test(v.root) && (!v.parent || uuid.test(v.parent)) &&
    Number.isSafeInteger(v.created) && v.created>=0 && v.created<8640000000000000 &&
    textField(v.title,1024) && textField(v.prompt,12000) && textField(v.size,48) && textField(v.quality,32),'Versão inválida.');
  const r=v.receipt;
  if (r) requireValue(['nanoUsd','text','image','output','cachedImage','cachedText'].every(k=>Number.isSafeInteger(r[k]) && r[k]>=0)
    && textField(r.rateDate,32) && textField(r.model,128),'Recibo inválido.');
  const {id,root,created,title,prompt,size,quality}=v;
  return {id,root,created,title,prompt,size,quality,parent:v.parent||undefined,
    original:v.original===true,local:v.local===true,draft:v.draft===true,receipt:r||null};
}
function verifyAsset(db,owner,asset,privateData=false) {
  requireValue(asset && (privateData ? asset.type==='application/json' : mime.includes(asset.type)) &&
    Array.isArray(asset.parts) && asset.parts.length>0 && asset.parts.length<=128 &&
    asset.parts.every(id=>typeof id==='string' && digest.test(id)), 'Arquivo inválido.');
  const part=db.prepare('SELECT length(bytes) AS length, substr(bytes,1,12) AS head FROM chunks WHERE owner=? AND hash=?');
  for (const [i,hash] of asset.parts.entries()) {
    const row=part.get(owner,hash);
    requireValue(row && (i===asset.parts.length-1 || row.length===chunkSize),'Arquivo incompleto.',409);
    if (!i && !privateData) {
      const head=Buffer.from(row.head);
      const valid = asset.type==='image/jpeg' ? head.subarray(0,3).equals(Buffer.from([255,216,255])) :
        asset.type==='image/png' ? head.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
        head.toString('ascii',0,4)==='RIFF' && head.toString('ascii',8,12)==='WEBP';
      requireValue(valid,'O arquivo não corresponde ao formato da imagem.');
    }
  }
  return {type:asset.type,parts:asset.parts};
}
export function putVersion(db, owner, input) {
  const v=versionMeta(input?.meta);
  const assets={image:verifyAsset(db,owner,input.image),thumb:verifyAsset(db,owner,input.thumb)};
  if (v.draft) assets.state=verifyAsset(db,owner,input.state,true);
  if (v.parent) {
    const parent=db.prepare('SELECT root FROM versions WHERE owner=? AND id=?').get(owner,v.parent);
    requireValue(parent?.root===v.root && v.id!==v.parent,'Sincronize a versão anterior primeiro.',409);
  } else requireValue(v.id===v.root,'Projeto inválido.');
  const insert=db.prepare('INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?,?)')
    .run(owner,v.id,v.root,v.created,JSON.stringify(v),JSON.stringify(assets));
  if (!insert.changes) {
    const prior=db.prepare('SELECT meta,assets FROM versions WHERE owner=? AND id=?').get(owner,v.id);
    const saved=JSON.parse(prior.assets);
    requireValue(prior.meta===JSON.stringify(v) && JSON.stringify(saved.image)===JSON.stringify(assets.image) &&
      JSON.stringify(saved.state)===JSON.stringify(assets.state),'Já existe outra versão com este identificador.',409);
  }
}
export function catalogue(db,owner) {
  return db.prepare('SELECT meta FROM versions WHERE owner=? ORDER BY created,id').all(owner).map(r=>JSON.parse(r.meta));
}
export function imageResponse(db,owner,id,kind='image') {
  const row=db.prepare('SELECT assets FROM versions WHERE owner=? AND id=?').get(owner,id);
  const asset=row && JSON.parse(row.assets)[kind];
  if (!asset || !['image','thumb','state'].includes(kind)) return new Response(null,{status:404});
  const part=db.prepare('SELECT bytes FROM chunks WHERE owner=? AND hash=?');
  let i=0;
  const stream=new ReadableStream({pull(controller){
    controller.enqueue(part.get(owner,asset.parts[i++]).bytes);
    if(i===asset.parts.length) controller.close();
  }});
  return new Response(stream,{headers:{'Content-Type':asset.type,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
export function createLink(db,owner,scope,target) {
  requireValue(['photo','project'].includes(scope) && uuid.test(target),'Escolha uma foto ou projeto.');
  const row=db.prepare('SELECT root FROM versions WHERE owner=? AND id=?').get(owner,target);
  requireValue(row && (scope==='photo'||row.root===target),'Sincronize o projeto antes de compartilhar.',409);
  db.prepare('INSERT OR IGNORE INTO links VALUES(?,?,?,?)').run(randomBytes(24).toString('base64url'),owner,scope,target);
  return db.prepare('SELECT token FROM links WHERE owner=? AND scope=? AND target=?').get(owner,scope,target).token;
}
/** @returns {{owner:string, scope:string, items:{id:string,created:number}[]}|null} */
export function sharedItems(db,token) {
  if (!/^[\w-]{32}$/.test(token)) return null;
  const link=db.prepare('SELECT * FROM links WHERE token=?').get(token);
  if(!link) return null;
  const field=link.scope==='photo'?'id':'root';
  const items=db.prepare('SELECT id,created FROM versions WHERE owner=? AND '+field+'=? ORDER BY created DESC,id DESC').all(link.owner,link.target);
  return {...link,items};
}
