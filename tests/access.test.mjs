import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyPassword,issueSession,sessionUser,lifetime} from '../lib/access.mjs';
const env={LUME_KLEBER_PASSWORD:'fixtureK',LUME_RENATO_PASSWORD:'fixtureR',LUME_SESSION_SECRET:'x'.repeat(42)};
test('contas independentes e sessões assinadas',()=>{
 for(const [name,pass] of [['kleber','fixtureK'],['renato','fixtureR']]){
  assert.equal(verifyPassword(name,pass,env),true);
  assert.equal(verifyPassword(name,'errada',env),false);
  const token=issueSession(name,env);assert.equal(sessionUser(token,env),name);
  assert.equal(sessionUser(token,env,Date.now()+(lifetime+1)*1000),null);
  assert.equal(sessionUser(token.slice(0,-5),env),null);assert.equal(sessionUser(token,{}),null);
 }
 assert.equal(verifyPassword('kleber','fixtureR',env),false);
 assert.equal(verifyPassword('toString','x',env),false);
 assert.equal(verifyPassword('kleber','fixtureK',{}),false);
});
