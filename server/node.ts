import {createServer} from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import nodemailer from 'nodemailer';
import worker from './index';
import {SQLiteStore} from './sqlite';

if(!process.env.APP_ORIGIN||!process.env.DATABASE_PATH)throw new Error('Configure APP_ORIGIN and DATABASE_PATH for this deployment');
const origin=new URL(process.env.APP_ORIGIN);
const store=new SQLiteStore(process.env.DATABASE_PATH);
store.migrate(resolve('drizzle'));
const assets=resolve('dist');
const mime:Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const smtpReady=!!(process.env.SMTP_HOST&&process.env.SMTP_USER&&process.env.SMTP_PASSWORD);
const transport=smtpReady?nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:process.env.SMTP_PORT!=='587',requireTLS:true,auth:{user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD},tls:{minVersion:'TLSv1.2',rejectUnauthorized:true},connectionTimeout:10000,socketTimeout:20000}):null;
const env={...process.env,APP_ORIGIN:origin.origin,APP_ENV:'production',EMAIL_FROM:process.env.EMAIL_FROM||'Oasis <conta@example.com>',EMAIL_ENABLED:smtpReady&&process.env.EMAIL_ENABLED==='true'?'true':'false',TURNSTILE_SITE_KEY:process.env.TURNSTILE_SITE_KEY||'',VAPID_PUBLIC_KEY:process.env.VAPID_PUBLIC_KEY||'',VAPID_SUBJECT:origin.origin,DB:store.asD1(),EMAIL:{async send(mail:Parameters<NonNullable<typeof transport>['sendMail']>[0]){if(!transport)throw new Error('Email unavailable');return transport.sendMail(mail);}},ASSETS:{async fetch(request:Request){
  const path=new URL(request.url).pathname;const file=resolve(assets,path==='/'?'index.html':'.'+decodeURIComponent(path));
  if(!file.startsWith(assets+sep)||!mime[extname(file)])return new Response('Not found',{status:404});
  try{if(!(await stat(file)).isFile())return new Response('Not found',{status:404});return new Response(await readFile(file),{headers:{'Content-Type':mime[extname(file)],'Cache-Control':extname(file)==='.html'?'no-store':'public, max-age=300'}});}catch{return new Response('Not found',{status:404});}
}}} as unknown as Env;
if(!env.BETTER_AUTH_SECRET||env.BETTER_AUTH_SECRET.length<32||Buffer.from(env.DATA_ENCRYPTION_KEY||'','base64').length!==32)throw new Error('Missing production secrets');
const pending=new Set<Promise<unknown>>();
const ctx={waitUntil(p:Promise<unknown>){const tracked=p.catch(()=>console.error('background_operation_failed')).finally(()=>pending.delete(tracked));pending.add(tracked);},passThroughOnException(){},props:{}} as ExecutionContext;
const server=createServer({maxHeaderSize:16384},async(req,res)=>{
  try{
    if(req.headers.host!==origin.host){res.writeHead(421).end();return;}
    const chunks:Buffer[]=[];let bytes=0;for await(const chunk of req){bytes+=chunk.length;if(bytes>128000){res.writeHead(413,{'Connection':'close'}).end();return;}chunks.push(chunk);}
    const headers=new Headers();for(const [key,value] of Object.entries(req.headers))if(value!==undefined)headers.set(key,Array.isArray(value)?value.join(','):value);
    // Nginx overwrites this header with its socket peer; never trust a client-supplied CF header.
    headers.set('cf-connecting-ip',String(req.headers['x-oasis-client-ip']||req.socket.remoteAddress));headers.delete('x-oasis-client-ip');
    const request=new Request(origin.origin+(req.url||'/'),{method:req.method,headers,...(bytes?{body:Buffer.concat(chunks)}:{})});
    const response=await worker.fetch(request,env,ctx);
    res.statusCode=response.status;response.headers.forEach((v,k)=>{if(k!=='set-cookie')res.setHeader(k,v);});const cookies=response.headers.getSetCookie();if(cookies.length)res.setHeader('Set-Cookie',cookies);
    res.end(req.method==='HEAD'?undefined:Buffer.from(await response.arrayBuffer()));
  }catch{if(!res.headersSent)res.writeHead(500,{'Cache-Control':'no-store'});res.end('Não foi possível concluir.');console.error('request_failed');}
});
server.requestTimeout=30000;server.headersTimeout=15000;server.keepAliveTimeout=5000;
let ticking=false;
const timer=setInterval(async()=>{if(ticking)return;ticking=true;try{await worker.scheduled({} as ScheduledController,env,ctx);await Promise.allSettled([...pending]);}finally{ticking=false;}},60000);
server.listen(Number(process.env.PORT||4187),'127.0.0.1',()=>console.log('Oasis listening on loopback'));
process.on('SIGTERM',()=>{clearInterval(timer);server.close(async()=>{await Promise.allSettled([...pending]);store.close();process.exit(0);});setTimeout(()=>process.exit(1),25000).unref();});
