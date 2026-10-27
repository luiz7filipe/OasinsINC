import {test} from 'node:test';
import assert from 'node:assert/strict';
import {guestStore,GUEST_KEY,GUEST_TTL} from '../client/guest';

test('guest records survive reload, expire after 24h without renewal, and clear only their own storage',()=>{
  const entries=new Map<string,string>([['unrelated','keep']]);
  const storage={getItem:(key:string)=>entries.get(key)||null,setItem:(key:string,value:string)=>{entries.set(key,value);},removeItem:(key:string)=>{entries.delete(key);}};
  let now=100000;const store=guestStore(storage,()=>now);const started=store.start('2026-09-11');
  assert.deepEqual(started.state.meals,[]);assert.deepEqual(started.state.weights,[]);
  now+=GUEST_TTL/2;store.save({...started.state,water:500},'2026-09-11');
  const reloaded=guestStore(storage,()=>now);assert.equal(reloaded.read()!.state.water,500);
  assert.equal(reloaded.read()!.expiresAt,started.expiresAt);
  const newDay=reloaded.start('2026-09-12');assert.equal(newDay.state.water,0);assert.equal(newDay.expiresAt,started.expiresAt);
  now=started.expiresAt;assert.equal(reloaded.read(),null);assert.equal(entries.has(GUEST_KEY),false);assert.equal(entries.get('unrelated'),'keep');
  assert.throws(()=>store.save(started.state,'2026-09-12'));
  entries.set(GUEST_KEY,JSON.stringify({...started,expiresAt:now+GUEST_TTL}));assert.equal(store.read(),null);
  entries.set(GUEST_KEY,'{invalid');assert.equal(store.read(),null);
  store.start('2026-09-12');entries.delete(GUEST_KEY);assert.equal(store.read(),null);
});

test('blocked storage stays in memory, validates records and still expires',()=>{
  let now=1000;const store=guestStore({getItem(){throw Error();},setItem(){throw Error();},removeItem(){throw Error();}},()=>now);
  const record=store.start('2026-09-11');assert.equal(store.persistent,false);
  store.save({...record.state,water:250},record.day);assert.equal(store.read()!.state.water,250);
  assert.throws(()=>store.save({...record.state,water:Infinity},record.day));
  now+=GUEST_TTL;assert.equal(store.read(),null);
});
