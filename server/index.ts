import { z } from 'zod';
import { authFor } from './auth';
import { seal, unseal, digest } from './crypto';
import { wellnessInput, reminderInput, subscriptionInput, nextOccurrence, type ReminderData, type StoredSubscription } from './validation';
import { HttpError, boundedJson, checkOrigin, secured, json, apiRateLimit } from './security';
import { dispatchReminders, sendPush } from './push';
import { flushMail } from './mail';

export async function appFetch(request:Request,env:Env,ctx:ExecutionContext):Promise<Response>{
  const url=new URL(request.url),path=url.pathname;
  const origin=env.APP_ORIGIN;
  if(url.origin!==origin)return json({error:'Endereço não autorizado.'},403);
  if(path.startsWith('/api/')&&(path.endsWith('/')||path.includes('//')||path.includes('%')))throw new HttpError(400,'Endereço inválido.');
  if(path==='/api/status')return json({googleEnabled:!!(env.GOOGLE_CLIENT_ID&&env.GOOGLE_CLIENT_SECRET),emailEnabled:env.EMAIL_ENABLED==='true',turnstileSiteKey:env.TURNSTILE_SITE_KEY,pushEnabled:!!env.VAPID_PUBLIC_KEY,vapidPublicKey:env.VAPID_PUBLIC_KEY});
  if(!path.startsWith('/api/')){
    if(request.method!=='GET'&&request.method!=='HEAD')throw new HttpError(405,'Método não permitido.');
    const asset=await env.ASSETS.fetch(request);
    const response=new Response(asset.body,asset);if(path==='/'||path.endsWith('.html')||path==='/sw.js')response.headers.set('Cache-Control','no-store');return response;
  }
  checkOrigin(request,origin);
  if(path.startsWith('/api/auth/')){
    if(!['GET','POST'].includes(request.method))throw new HttpError(405,'Método não permitido.');
    // Never accept a registration that cannot be verified, or silently disable bot protection in production.
    if(env.APP_ENV==='production'&&(!env.TURNSTILE_SECRET_KEY||!env.TURNSTILE_SITE_KEY))throw new HttpError(503,'O acesso está sendo configurado. Tente novamente mais tarde.');
    if(['/api/auth/sign-up/email','/api/auth/send-verification-email','/api/auth/request-password-reset'].includes(path)&&env.EMAIL_ENABLED!=='true')throw new HttpError(503,'O envio de e-mail ainda está sendo ativado.');
    let forwarded=request;
    if(request.method==='POST'){
      const input=await boundedJson(request,20000);
      if(!input||typeof input!=='object'||Array.isArray(input))throw new HttpError(400,'Dados inválidos.');
      const body=input as Record<string,unknown>;
      if(path==='/api/auth/sign-in/social'&&(body.provider!=='google'||!env.GOOGLE_CLIENT_ID||!env.GOOGLE_CLIENT_SECRET))throw new HttpError(503,'O login com Google ainda está sendo ativado.');
      if(path==='/api/auth/sign-up/email'&&(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>80))throw new HttpError(400,'Informe um nome de até 80 caracteres.');
      for(const field of ['callbackURL','redirectTo','errorCallbackURL','newUserCallbackURL'])if(body[field]!==undefined){if(typeof body[field]!=='string'||new URL(body[field],origin).origin!==origin)throw new HttpError(400,'Destino inválido.');}
      forwarded=new Request(request,{body:JSON.stringify(body)});
    }
    return authFor(env,ctx).handler(forwarded);
  }
  const auth=authFor(env,ctx),session=await auth.api.getSession({headers:request.headers});
  if(!session?.user?.emailVerified)throw new HttpError(401,'Entre com sua conta e confirme seu e-mail.');
  const userId=session.user.id;await apiRateLimit(env.DB,userId);
  if(path==='/api/state'){
    if(request.method==='GET'){
      const row=await env.DB.prepare('SELECT cipher,revision FROM wellness WHERE user_id=?').bind(userId).first<{cipher:string;revision:number}>();
      return json(row?{...await unseal<object>(row.cipher,env.DATA_ENCRYPTION_KEY,`wellness:${userId}`),revision:row.revision}:{state:null,revision:0});
    }
    if(request.method==='PUT'){
      const input=wellnessInput.parse(await boundedJson(request));
      // Preserve the account's plan when an older client sends only daily records.
      if(!input.state.personalPlan&&input.revision>0){
        const previous=await env.DB.prepare('SELECT cipher FROM wellness WHERE user_id=? AND revision=?').bind(userId,input.revision).first<{cipher:string}>();
        if(previous){const saved=await unseal<{state:{personalPlan?:typeof input.state.personalPlan}}>(previous.cipher,env.DATA_ENCRYPTION_KEY,`wellness:${userId}`);if(saved.state.personalPlan)input.state.personalPlan=saved.state.personalPlan;}
      }
      const cipher=await seal({day:input.day,state:input.state},env.DATA_ENCRYPTION_KEY,`wellness:${userId}`);
      const row=input.revision===0?await env.DB.prepare('INSERT INTO wellness(user_id,cipher,revision,updated_at) VALUES(?,?,1,?) ON CONFLICT(user_id) DO NOTHING RETURNING revision').bind(userId,cipher,Date.now()).first<{revision:number}>():await env.DB.prepare('UPDATE wellness SET cipher=?,revision=revision+1,updated_at=? WHERE user_id=? AND revision=? RETURNING revision').bind(cipher,Date.now(),userId,input.revision).first<{revision:number}>();
      if(!row)throw new HttpError(409,'Sua rotina mudou em outro dispositivo. Recarregue antes de salvar.');return json(row);
    }
  }
  if(path==='/api/reminders'){
    if(request.method==='GET'){
      const rows=await env.DB.prepare('SELECT id,cipher,next_at,enabled FROM reminder WHERE user_id=? ORDER BY next_at LIMIT 30').bind(userId).all<{id:string;cipher:string;next_at:number;enabled:number}>();
      return json({reminders:await Promise.all(rows.results.map(async r=>({...await unseal<ReminderData>(r.cipher,env.DATA_ENCRYPTION_KEY,`reminder:${userId}:${r.id}`),id:r.id,nextAt:r.next_at,enabled:!!r.enabled})))});
    }
    if(request.method==='POST'){
      const input=reminderInput.parse(await boundedJson(request,5000));const id=crypto.randomUUID(),nextAt=nextOccurrence(input,Date.now());
      const result=await env.DB.prepare('INSERT INTO reminder(id,user_id,cipher,next_at,enabled,created_at) SELECT ?,?,?,?,?,? WHERE (SELECT count(*) FROM reminder WHERE user_id=?)<30').bind(id,userId,await seal(input,env.DATA_ENCRYPTION_KEY,`reminder:${userId}:${id}`),nextAt,Number(input.enabled),Date.now(),userId).run();
      if(!result.meta.changes)throw new HttpError(409,'Você pode manter até 30 lembretes.');return json({id,nextAt},201);
    }
  }
  const reminderMatch=path.match(/^\/api\/reminders\/([a-f0-9-]{36})$/);
  if(reminderMatch&&request.method==='DELETE'){await env.DB.prepare('DELETE FROM reminder WHERE id=? AND user_id=?').bind(reminderMatch[1],userId).run();return json({ok:true});}
  if(reminderMatch&&request.method==='PUT'){
    const input=reminderInput.parse(await boundedJson(request,5000)),id=reminderMatch[1];
    const result=await env.DB.prepare('UPDATE reminder SET cipher=?,next_at=?,enabled=? WHERE id=? AND user_id=?').bind(await seal(input,env.DATA_ENCRYPTION_KEY,`reminder:${userId}:${id}`),nextOccurrence(input,Date.now()),Number(input.enabled),id,userId).run();
    if(!result.meta.changes)throw new HttpError(404,'Lembrete não encontrado.');return json({ok:true});
  }
  if(path==='/api/push/subscription'&&request.method==='POST'){
    const sub=subscriptionInput.parse(await boundedJson(request,5000)),hash=await digest(sub.endpoint);
    const existing=await env.DB.prepare('SELECT id,user_id FROM push_subscription WHERE endpoint_hash=?').bind(hash).first<{id:string;user_id:string}>();
    if(existing&&existing.user_id!==userId)throw new HttpError(409,'Desative e reative as notificações neste dispositivo.');
    const id=existing?.id??crypto.randomUUID(),cipher=await seal(sub,env.DATA_ENCRYPTION_KEY,`push:${userId}:${id}`);
    if(existing)await env.DB.prepare('UPDATE push_subscription SET cipher=? WHERE id=? AND user_id=?').bind(cipher,id,userId).run();
    else{const saved=await env.DB.prepare('INSERT INTO push_subscription(id,user_id,endpoint_hash,cipher,created_at) SELECT ?,?,?,?,? WHERE (SELECT count(*) FROM push_subscription WHERE user_id=?)<5').bind(id,userId,hash,cipher,Date.now(),userId).run();if(!saved.meta.changes)throw new HttpError(409,'Limite de cinco dispositivos atingido.');}
    return json({ok:true});
  }
  if(path==='/api/push/subscription'&&request.method==='DELETE'){const input=z.object({endpoint:z.string().max(2048)}).strict().parse(await boundedJson(request,5000));await env.DB.prepare('DELETE FROM push_subscription WHERE endpoint_hash=? AND user_id=?').bind(await digest(input.endpoint),userId).run();return json({ok:true});}
  if(path==='/api/push/test'&&request.method==='POST'){
    const input=z.object({endpoint:z.string().max(2048)}).strict().parse(await boundedJson(request,5000));
    const row=await env.DB.prepare('SELECT id,cipher FROM push_subscription WHERE user_id=? AND endpoint_hash=?').bind(userId,await digest(input.endpoint)).first<{id:string;cipher:string}>();if(!row)throw new HttpError(404,'Ative as notificações neste dispositivo.');
    const status=await sendPush(env,await unseal<StoredSubscription>(row.cipher,env.DATA_ENCRYPTION_KEY,`push:${userId}:${row.id}`),'oasis-test');
    if(status<200||status>=300)throw new HttpError(502,'O dispositivo não aceitou a notificação.');return json({ok:true});
  }
  throw new HttpError(404,'Recurso não encontrado.');
}
export default {
  async fetch(request:Request,env:Env,ctx:ExecutionContext){try{return secured(await appFetch(request,env,ctx),env.APP_ENV==='production');}catch(error){const status=error instanceof HttpError?error.status:error instanceof z.ZodError?400:500;const message=error instanceof HttpError?error.message:status===400?'Revise os dados informados.':'Não foi possível concluir. Tente novamente.';if(status===500)console.error(JSON.stringify({event:'request_failed'}));return secured(json({error:message},status),env.APP_ENV==='production');}},
  async scheduled(_event,env,ctx){ctx.waitUntil(Promise.all([dispatchReminders(env),flushMail(env),env.DB.batch([env.DB.prepare('DELETE FROM rate_limit WHERE last_request<?').bind(Date.now()-86400000),env.DB.prepare('DELETE FROM mail_outbox WHERE expires_at<?').bind(Date.now()),env.DB.prepare('DELETE FROM delivery WHERE due_at<?').bind(Date.now()-7*86400000),env.DB.prepare('DELETE FROM session WHERE expires_at<?').bind(Date.now()),env.DB.prepare('DELETE FROM verification WHERE expires_at<?').bind(Date.now())])]).then(()=>undefined));},
} satisfies ExportedHandler<Env>;
