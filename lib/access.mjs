import {createHmac,createHash,timingSafeEqual} from 'node:crypto';
export const basePath='/img_editor';
export const cookieName='lume_session';
export const lifetime=7*86400;
const accounts={kleber:'LUME_KLEBER_PASSWORD',renato:'LUME_RENATO_PASSWORD'};
const digest=s=>createHash('sha256').update(s).digest();
function password(user,env){
  return Object.hasOwn(accounts,user) && env.LUME_SESSION_SECRET?.length>=32 ? env[accounts[user]] : null;
}
export function verifyPassword(user,input,env){
  const saved=password(user,env);
  return typeof saved==='string' && saved.length>0 && timingSafeEqual(digest(saved),digest(input));
}
function signature(payload,user,env){
  return createHmac('sha256',env.LUME_SESSION_SECRET).update(JSON.stringify([payload,password(user,env)])).digest('hex');
}
export function issueSession(user,env,now=Date.now()){
  if(!password(user,env)) throw Error('Conta indisponível');
  const payload=user+'.'+(Math.floor(now/1000)+lifetime);
  return payload+'.'+signature(payload,user,env);
}
export function sessionUser(token,env,now=Date.now()){
  const parts=token?.split('.');
  if(parts?.length!==3)return null;
  const [user,expiry,mac]=parts;
  if(!password(user,env)||!/^\d+$/.test(expiry)||Number(expiry)<=now/1000||!/^[a-f0-9]{64}$/.test(mac))return null;
  return timingSafeEqual(Buffer.from(mac,'hex'),Buffer.from(signature(user+'.'+expiry,user,env),'hex'))?user:null;
}
