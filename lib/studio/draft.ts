import {canvasContext,type Selection,type Stroke} from './paint';
import type {ReferencePhoto} from './references';
type SavedObject = {tool:'object';width:number;height:number;png:string};
type SavedPhoto = Omit<ReferencePhoto,'file'> & {name:string;data:string};
function dataUrl(blob:Blob):Promise<string>{
  return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));
    reader.onerror=()=>reject(Error('Falha ao salvar a referência.'));reader.readAsDataURL(blob)});
}
export async function packDraft(region:Selection|null,photos:ReferencePhoto[]) {
  const marks=region?.marks.map(m=>m.tool==='object'?{tool:m.tool,width:m.width,height:m.height,png:m.mask.toDataURL()}:m)??[];
  const refs=await Promise.all(photos.map(async p=>({id:p.id,role:p.role,name:p.file.name,data:await dataUrl(p.file)})));
  return new Blob([JSON.stringify({marks,feather:region?.feather??0,refs})],{type:'application/json'});
}
async function decode(data:string) {
  if(!/^data:image\/(png|jpeg|webp);base64,/i.test(data))throw Error('Referência inválida.');
  return (await fetch(data)).blob();
}
export async function unpackDraft(state:Blob) {
  const saved=JSON.parse(await state.text()) as {marks:(Stroke|SavedObject)[];feather:number;refs:SavedPhoto[]};
  const marks=await Promise.all(saved.marks.map(async m=>{
    if(m.tool!=='object') return m;
    const bitmap=await createImageBitmap(await decode(m.png));
    try {
      const ctx=canvasContext(bitmap.width,bitmap.height);ctx.drawImage(bitmap,0,0);
      return {tool:m.tool,width:m.width,height:m.height,mask:ctx.canvas};
    }finally{bitmap.close()}
  }));
  const photos=await Promise.all(saved.refs.map(async p=>{
    const data=await decode(p.data);
    return {id:p.id,role:p.role,file:new File([data],p.name,{type:data.type})};
  }));
  return {region:marks.length?{marks,feather:saved.feather}:null,photos};
}
