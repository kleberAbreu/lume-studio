import {NextRequest, NextResponse} from 'next/server';
import {basePath,cookieName,issueSession,lifetime,sessionUser,verifyPassword} from '../../../lib/access.mjs';
import {handleStudio} from '../../../lib/studio/api.mjs';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=300;
const attempts=new Map<string,{count:number;until:number}>();
const reject=(error:string,status:number)=>NextResponse.json({error},{status,headers:{'Cache-Control':'no-store'}});
async function handle(req:NextRequest,{params}:{params:Promise<{action:string}>}){
  const {action}=await params;
  const origin=process.env.APP_ORIGIN || (process.env.NODE_ENV==='production'?'https://www.kleberabreu.com.br':req.nextUrl.origin);
  const home=new URL(basePath,origin);
  if(req.method==='POST' && req.headers.get('origin')!==home.origin)return reject('Origem inválida.',403);
  const options={path:basePath,httpOnly:true,secure:home.protocol==='https:',sameSite:'lax' as const};
  if(action==='login'&&req.method==='POST'){
    if(Number(req.headers.get('content-length'))>16384)return reject('Solicitação muito longa.',413);
    const form=await req.formData(),user=String(form.get('username')||'').trim().toLowerCase();
    const bucket=['kleber','renato'].includes(user)?user:'unknown';
    const now=Date.now(), state=attempts.get(bucket);
    if(state && state.until>now && state.count>=10){home.searchParams.set('erro','limite');return NextResponse.redirect(home,303)}
    if(!verifyPassword(user,String(form.get('password')||''),process.env)){
      attempts.set(bucket,state&&state.until>now?{...state,count:state.count+1}:{count:1,until:now+120000});
      home.searchParams.set('erro','1');return NextResponse.redirect(home,303);
    }
    attempts.delete(bucket);const out=NextResponse.redirect(home,303);
    out.cookies.set(cookieName,issueSession(user,process.env),{...options,maxAge:lifetime});return out;
  }
  if(action==='logout'&&req.method==='POST'){
    const out=NextResponse.redirect(home,303);out.cookies.set(cookieName,'',{...options,maxAge:0});return out;
  }
  const user=sessionUser(req.cookies.get(cookieName)?.value,process.env);
  if(!user)return reject('Sua sessão expirou. Reabra o editor e entre novamente.',401);
  if(req.method==='POST' && req.headers.get('x-lume-account')!==user)return reject('A conta desta aba mudou. Recarregue a página para continuar.',409);
  return handleStudio(new Request(new URL('/api/'+action,home.origin),req),{OPENAI_API_KEY:process.env.OPENAI_API_KEY});
}
export {handle as GET, handle as POST};
