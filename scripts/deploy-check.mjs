import {readFile} from 'node:fs/promises';
const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
const missing=[];
if(config.vars.APP_ENV!=='production')missing.push('definir APP_ENV=production');
if(!/^https:\/\//.test(config.vars.APP_ORIGIN||'')||/example\.com|localhost/.test(config.vars.APP_ORIGIN||''))missing.push('configurar uma origem HTTPS própria');
if(config.d1_databases?.some(db=>db.database_id==='00000000-0000-0000-0000-000000000000'))missing.push('configurar um banco D1 próprio');
if(config.vars.EMAIL_ENABLED!=='true')missing.push('ativar e validar Email Sending');
if(!config.vars.TURNSTILE_SITE_KEY)missing.push('configurar Turnstile para o domínio');
if(!config.vars.VAPID_PUBLIC_KEY)missing.push('configurar as chaves Web Push');
const hostname=(()=>{try{return new URL(config.vars.APP_ORIGIN).hostname;}catch{return '';}})();
if(!config.routes?.some(r=>r.pattern===hostname&&r.custom_domain))missing.push('configurar o domínio próprio após revisar o DNS');
if(missing.length){console.error('Publicação pendente: '+missing.join('; ')+'.');process.exitCode=1;}
