import {cookies} from 'next/headers';
import {basePath,cookieName,sessionUser} from '../lib/access.mjs';
import Studio from './studio';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|undefined>>}){
  const user=sessionUser((await cookies()).get(cookieName)?.value,process.env);
  if(user)return <Studio account={user}/>;
  const error=(await searchParams).erro;
  return <main className="login-wrap"><section className="card login-card"><span className="modeltag">Lume Studio</span><h1>Entrar no estúdio</h1>
  <form action={basePath+'/api/login'} method="post"><label>Usuário<input name="username" autoComplete="username" required autoFocus/></label><label>Senha<input name="password" type="password" autoComplete="current-password" required/></label>
  {error&&<p role="alert" className="error">{error==='limite'?'Aguarde dois minutos antes de tentar novamente.':'Confira seu usuário e senha.'}</p>}
  <button className="primary">Entrar</button></form></section></main>;
}
