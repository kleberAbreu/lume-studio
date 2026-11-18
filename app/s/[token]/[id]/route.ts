import {database,sharedItems,imageResponse} from '../../../../lib/gallery/store.mjs';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{token:string;id:string}>}) {
  const {token,id}=await params, db=database(), share=sharedItems(db,token);
  if(!share?.items.some(row=>row.id===id)) return new Response(null,{status:404,headers:{'Cache-Control':'no-store'}});
  return imageResponse(db,share.owner,id);
}
