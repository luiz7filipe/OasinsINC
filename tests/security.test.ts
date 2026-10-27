import {test} from 'node:test';
import assert from 'node:assert/strict';
import {seal,unseal,encode} from '../server/crypto';
import {allowedPushEndpoint,nextOccurrence,reminderInput,day} from '../server/validation';
import {boundedJson,checkOrigin,secured} from '../server/security';

test('encrypted data is random, authenticated and bound to its owner',async()=>{
  const key=encode(crypto.getRandomValues(new Uint8Array(32))),value={record:'x'.repeat(120000)};
  const a=await seal(value,key,'user:A'),b=await seal(value,key,'user:A');assert.notEqual(a,b);
  assert.deepEqual(await unseal(a,key,'user:A'),value);
  await assert.rejects(unseal(a,key,'user:B'));
  await assert.rejects(unseal(a,encode(crypto.getRandomValues(new Uint8Array(32))),'user:A'));
  const parts=a.split('.');parts[2]=(parts[2][0]==='A'?'B':'A')+parts[2].slice(1);
  await assert.rejects(unseal(parts.join('.'),key,'user:A'));
});
test('push destinations cannot target private servers or lookalike hosts',()=>{
  for(const url of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://fcm.googleapis.com.evil.test/x','https://evil.test@fcm.googleapis.com/x','https://fcm.googleapis.com:8443/x'])assert.equal(allowedPushEndpoint(url),false,url);
  for(const url of ['https://fcm.googleapis.com/x','https://updates.push.services.mozilla.com/x','https://web.push.apple.com/x'])assert.equal(allowedPushEndpoint(url),true,url);
});
test('reminders honor local weekdays and DST gaps without repeating a fold',()=>{
  const r=reminderInput.parse({title:'Água',kind:'agua',time:'09:00',days:[1],timezone:'America/Sao_Paulo',enabled:true});
  assert.equal(new Date(nextOccurrence(r,Date.parse('2026-09-11T12:00:00Z'))).toISOString(),'2026-09-14T12:00:00.000Z');
  assert.equal(new Date(nextOccurrence({...r,time:'02:30',days:[0],timezone:'America/New_York'},Date.parse('2026-03-08T00:00:00Z'))).toISOString(),'2026-03-15T06:30:00.000Z');
  assert.equal(new Date(nextOccurrence({...r,time:'01:30',days:[0],timezone:'America/New_York'},Date.parse('2026-11-01T05:31:00Z'))).toISOString(),'2026-11-08T06:30:00.000Z');
  assert.equal(day.safeParse('2026-02-30').success,false);
});
test('request body limits, cross-site rejection and browser protections',async()=>{
  await assert.rejects(boundedJson(new Request('https://app.example.com/api/state',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({x:'a'.repeat(100)})}),30),{status:413});
  assert.throws(()=>checkOrigin(new Request('https://app.example.com/api/state',{method:'PUT',headers:{origin:'https://evil.test'}}),'https://app.example.com'),{status:403});
  assert.doesNotThrow(()=>checkOrigin(new Request('https://app.example.com/api/auth/verify-email?token=example',{headers:{'sec-fetch-site':'cross-site'}}),'https://app.example.com'));
  const res=secured(new Response('ok'),true);assert.match(res.headers.get('Content-Security-Policy')!,/frame-ancestors 'none'/);assert.ok(res.headers.get('Strict-Transport-Security'));
});
