import {useEffect, useState} from 'react';

export function BlobImage({blob,alt}:{blob:Blob;alt:string}){
  const [src,setSrc]=useState('');
  useEffect(()=>{const url=URL.createObjectURL(blob);setSrc(url);return()=>URL.revokeObjectURL(url)},[blob]);
  return src?<img src={src} alt={alt}/>:null;
}
