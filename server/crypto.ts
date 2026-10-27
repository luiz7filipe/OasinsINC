export function encode(bytes:Uint8Array):string{let result='';for(let i=0;i<bytes.length;i+=8192)result+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(result);}
export function decode(value:string):Uint8Array<ArrayBuffer>{return Uint8Array.from(atob(value),c=>c.charCodeAt(0));}
async function key(secret:string){const bytes=decode(secret);if(bytes.length!==32)throw new Error('Invalid encryption configuration');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
export async function seal(value:unknown,secret:string,context:string):Promise<string>{
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(context)},await key(secret),new TextEncoder().encode(JSON.stringify(value)));
  return `v1.${encode(iv)}.${encode(new Uint8Array(ciphertext))}`;
}
export async function unseal<T>(value:string,secret:string,context:string):Promise<T>{
  const [version,iv,data]=value.split('.');if(version!=='v1'||!iv||!data)throw new Error('Invalid encrypted record');
  const plaintext=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(iv),additionalData:new TextEncoder().encode(context)},await key(secret),decode(data));
  return JSON.parse(new TextDecoder().decode(plaintext)) as T;
}
export async function digest(value:string){return encode(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))));}
