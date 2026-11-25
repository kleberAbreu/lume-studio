import { DatabaseSync } from 'node:sqlite';
import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';

export const MONTHLY = 10_000_000; // microdollars
export const reserve = {image: 1_000_000, prompt: 60_000};
export class PublicError extends Error {
  constructor(status,message) {super(message); this.status=status}
}
export function visitor(ip, pepper) {
  if (!isIP(ip || '')) throw new PublicError(403,'Origem de rede indisponível.');
  let canonical = ip;
  if (isIP(ip) === 6) {
    canonical = new URL('http://[' + ip + ']').hostname.slice(1,-1);
    const mapped = /^::ffff:([0-9a-f]+):([0-9a-f]+)$/.exec(canonical);
    if (mapped) canonical = mapped.slice(1).flatMap(h => [parseInt(h,16)>>8,parseInt(h,16)&255]).join('.');
  }
  return createHmac('sha256',pepper).update(canonical).digest('hex');
}
export function ledger(path, now=()=>new Date()) {
  const db=new DatabaseSync(path);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
    CREATE TABLE IF NOT EXISTS calls(network TEXT NOT NULL, id TEXT NOT NULL, bucket TEXT NOT NULL,
      month TEXT NOT NULL, amount INTEGER NOT NULL, state TEXT NOT NULL, PRIMARY KEY(network,id));
    CREATE INDEX IF NOT EXISTS calls_month ON calls(month);
    CREATE INDEX IF NOT EXISTS calls_bucket ON calls(network,bucket);`);
  const month=()=>now().toISOString().slice(0,7);
  const available=db.prepare("SELECT COALESCE(SUM(amount),0) AS amount FROM calls WHERE month=? OR state='pending'");
  const count=db.prepare('SELECT COUNT(*) AS n FROM calls WHERE network=? AND bucket=?');
  function status(network) {
    const left=MONTHLY-available.get(month()).amount;
    return Object.fromEntries(Object.keys(reserve).map(k=>[k,{remaining:Math.max(0,5-count.get(network,k).n),funded:left>=reserve[k]}]));
  }
  function start(network,id,bucket) {
    db.exec('BEGIN IMMEDIATE');
    try {
      if (db.prepare('SELECT 1 FROM calls WHERE network=? AND id=?').get(network,id)) throw new PublicError(409,'Este pedido já foi enviado. Confira o saldo antes de repetir.');
      const gate=status(network)[bucket];
      if (!gate.remaining) throw new PublicError(429,'Esta rede já utilizou as cinco chamadas desta categoria.');
      if (!gate.funded) throw new PublicError(429,'O saldo mensal da demonstração se esgotou para esta operação.');
      db.prepare("INSERT INTO calls VALUES(?,?,?,?,?,'pending')").run(network,id,bucket,month(),reserve[bucket]);
      db.exec('COMMIT');
    } catch(e) {db.exec('ROLLBACK'); throw e}
  }
  function finish(network,id,cost) {
    // Missing/ambiguous receipts retain the entire reservation. Mark completion in
    // its UTC month as well if the call straddles a billing boundary.
    db.prepare("UPDATE calls SET amount=COALESCE(?,amount),state='complete',month=? WHERE network=? AND id=? AND state='pending'")
      .run(Number.isSafeInteger(cost)&&cost>=0?cost:null,month(),network,id);
  }
  return {status,start,finish,close:()=>db.close()};
}
