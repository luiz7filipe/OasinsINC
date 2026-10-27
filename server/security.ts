export class HttpError extends Error{constructor(public status:number,message:string){super(message);}}
export async function boundedJson(request:Request,limit=128000):Promise<unknown>{
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new HttpError(415,'Use JSON.');
  const reader=request.body?.getReader();if(!reader)throw new HttpError(400,'Corpo ausente.');
  let size=0;const chunks:Uint8Array[]=[];while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw new HttpError(413,'Registro muito grande.');}chunks.push(value);}
  const bytes=new Uint8Array(size);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw new HttpError(400,'JSON inválido.');}
}
export function checkOrigin(request:Request,origin:string){
  const metadata=request.headers.get('sec-fetch-site');
  if(metadata==='cross-site'&&!['GET','HEAD'].includes(request.method))throw new HttpError(403,'Origem não autorizada.');
  if(!['GET','HEAD'].includes(request.method)&&request.headers.get('origin')!==origin)throw new HttpError(403,'Origem não autorizada.');
}
export function secured(response:Response,production:boolean):Response{
  const r=new Response(response.body,response);r.headers.set('X-Content-Type-Options','nosniff');r.headers.set('Referrer-Policy','no-referrer');r.headers.set('X-Frame-Options','DENY');
  r.headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=(), payment=()');
  r.headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; worker-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
  if(production)r.headers.set('Strict-Transport-Security','max-age=31536000');return r;
}
export function json(value:unknown,status=200){return Response.json(value,{status,headers:{'Cache-Control':'no-store'}});}
export async function apiRateLimit(db:D1Database,userId:string){
  const now=Date.now(),key=`app:${userId}:${Math.floor(now/60000)}`;
  const row=await db.prepare('INSERT INTO rate_limit(id,key,count,last_request) VALUES(?,?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1,last_request=excluded.last_request RETURNING count').bind(key,key,now).first<{count:number}>();
  if(!row||row.count>120)throw new HttpError(429,'Muitas solicitações. Aguarde um minuto.');
}
