import {useEffect, useState} from 'react';

export function BlobImage({blob,alt}:{blob:Blob|string;alt:string}){
  const [src,setSrc]=useState('');
  useEffect(()=>{if(typeof blob==='string'){setSrc(blob);return}const url=URL.createObjectURL(blob);setSrc(url);return()=>URL.revokeObjectURL(url)},[blob]);
  return src?<img loading="lazy" src={src} alt={alt}/>:null;
}
