import { buildPushPayload } from '@block65/webcrypto-web-push';
import { unseal } from './crypto';
import { allowedPushEndpoint, nextOccurrence, type ReminderData, type StoredSubscription } from './validation';
export async function sendPush(env:Env,subscription:StoredSubscription,tag:string):Promise<number>{
  if(!allowedPushEndpoint(subscription.endpoint))throw new Error('Invalid push destination');
  const payload=await buildPushPayload({data:JSON.stringify({title:'Oasis · um momento para você',body:'Você tem um cuidado agendado. Abra a Oasis para conferir.',tag,url:'/#lembretes'}),options:{ttl:300}},subscription,{subject:env.VAPID_SUBJECT,publicKey:env.VAPID_PUBLIC_KEY,privateKey:env.VAPID_PRIVATE_KEY});
  const response=await fetch(subscription.endpoint,{...payload,redirect:'error',signal:AbortSignal.timeout(10000)});await response.body?.cancel();return response.status;
}
export async function dispatchReminders(env:Env,now=Date.now()){
  if(!env.VAPID_PRIVATE_KEY||!env.VAPID_PUBLIC_KEY)return;
  const rows=await env.DB.prepare('SELECT id,user_id,cipher,next_at FROM reminder WHERE enabled=1 AND next_at<=? ORDER BY next_at LIMIT 50').bind(now).all<{id:string;user_id:string;cipher:string;next_at:number}>();
  for(let start=0;start<rows.results.length;start+=5)await Promise.all(rows.results.slice(start,start+5).map(async row=>{
    try{
      const r=await unseal<ReminderData>(row.cipher,env.DATA_ENCRYPTION_KEY,`reminder:${row.user_id}:${row.id}`);
      // Do not flood the person with notifications after a long outage.
      if(now-row.next_at<10*60000){
        const subs=await env.DB.prepare('SELECT id,cipher FROM push_subscription WHERE user_id=? LIMIT 5').bind(row.user_id).all<{id:string;cipher:string}>();
        let pending=false;
        for(const sub of subs.results){
          const id=`${row.id}:${sub.id}:${row.next_at}`;
          await env.DB.prepare('INSERT OR IGNORE INTO delivery(id,reminder_id,subscription_id,due_at,status,attempts,lease_until) VALUES(?,?,?,?,\'pending\',0,0)').bind(id,row.id,sub.id,row.next_at).run();
          const claim=await env.DB.prepare('UPDATE delivery SET lease_until=?,attempts=attempts+1 WHERE id=? AND status=\'pending\' AND attempts<3 AND lease_until<=? RETURNING id').bind(now+60000,id,now).first();
          if(!claim){const item=await env.DB.prepare('SELECT status,attempts FROM delivery WHERE id=?').bind(id).first<{status:string;attempts:number}>();if(item?.status==='pending'&&item.attempts<3)pending=true;continue;}
          try{
            const subscription=await unseal<StoredSubscription>(sub.cipher,env.DATA_ENCRYPTION_KEY,`push:${row.user_id}:${sub.id}`);
            const status=await sendPush(env,subscription,id);
            if(status===404||status===410){await env.DB.prepare('DELETE FROM push_subscription WHERE id=? AND user_id=?').bind(sub.id,row.user_id).run();}
            else if(status>=200&&status<300){await env.DB.prepare('UPDATE delivery SET status=\'sent\' WHERE id=?').bind(id).run();}
            else{pending=true;console.error(JSON.stringify({event:'push_delivery_rejected',status}));}
          }catch{pending=true;console.error(JSON.stringify({event:'push_delivery_failed'}));}
        }
        if(pending)return;
      }
      const next=nextOccurrence(r,Math.max(now,row.next_at)+60000);
      await env.DB.prepare('UPDATE reminder SET next_at=? WHERE id=? AND next_at=? AND enabled=1').bind(next,row.id,row.next_at).run();
    }catch{console.error(JSON.stringify({event:'reminder_dispatch_failed'}));}
  }));
}
