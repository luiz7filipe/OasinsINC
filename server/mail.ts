import { seal, unseal } from './crypto';
type Mail={to:string;subject:string;text:string};
export async function queueMail(env:Env,mail:Mail){
  const id=crypto.randomUUID(),now=Date.now();
  await env.DB.prepare('INSERT INTO mail_outbox(id,cipher,attempts,next_at,expires_at) VALUES(?,?,0,?,?)').bind(id,await seal(mail,env.DATA_ENCRYPTION_KEY,`mail:${id}`),now,now+15*60000).run();
  await flushMail(env,id);
}
export async function flushMail(env:Env,onlyId?:string){
  if(env.EMAIL_ENABLED!=='true')return;
  const now=Date.now();
  const rows=await env.DB.prepare('SELECT id,cipher,attempts FROM mail_outbox WHERE next_at<=? AND expires_at>? AND attempts<4 AND (? IS NULL OR id=?) LIMIT 20').bind(now,now,onlyId??null,onlyId??null).all<{id:string;cipher:string;attempts:number}>();
  for(const row of rows.results){
    const lease=await env.DB.prepare('UPDATE mail_outbox SET next_at=?,attempts=attempts+1 WHERE id=? AND next_at<=? RETURNING id').bind(now+120000,row.id,now).first();if(!lease)continue;
    try{const mail=await unseal<Mail>(row.cipher,env.DATA_ENCRYPTION_KEY,`mail:${row.id}`);await env.EMAIL.send({...mail,from:env.EMAIL_FROM});await env.DB.prepare('DELETE FROM mail_outbox WHERE id=?').bind(row.id).run();}
    catch{console.error(JSON.stringify({event:'email_delivery_failed',attempt:row.attempts+1}));}
  }
}
