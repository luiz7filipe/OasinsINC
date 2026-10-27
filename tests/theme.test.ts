import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync('dist/theme.js','utf8');
function theme(saved:string|null=null,dark=false,blocked=false){
  const events=new Map<string,Function>(),system={matches:dark,addEventListener:(_:string,fn:Function)=>events.set('system',fn)};
  const root={dataset:{} as any,style:{} as any},meta=new Map<string,string>();let stored=saved;
  const document={documentElement:root,querySelector:(selector:string)=>({setAttribute:(_:string,value:string)=>meta.set(selector,value)}),querySelectorAll:()=>[],addEventListener:(name:string,fn:Function)=>events.set(name,fn)};
  const window={matchMedia:(query:string)=>query.includes('prefers-color-scheme')?system:{matches:false},addEventListener:(name:string,fn:Function)=>events.set(name,fn)} as any;
  runInNewContext(source,{window,document,navigator:{},localStorage:{getItem(){if(blocked)throw Error();return stored;},setItem(_:string,value:string){if(blocked)throw Error();stored=value;}}});
  return {api:window.OasisPreferences,root,meta,events,system,get stored(){return stored;}};
}
test('Automatic follows device changes and manual Light/Dark overrides persist across reloads',()=>{
  const h=theme(null,true);assert.equal(h.api.value,'automatic');assert.equal(h.root.dataset.theme,'dark');
  h.system.matches=false;h.events.get('system')!();assert.equal(h.root.dataset.theme,'light');
  h.api.select('dark');assert.equal(h.stored,'dark');assert.equal(h.root.style.colorScheme,'dark');
  h.events.get('system')!();assert.equal(h.root.dataset.theme,'dark');
  const reload=theme(h.stored,false);assert.equal(reload.root.dataset.theme,'dark');
  reload.api.select('light');reload.system.matches=true;reload.events.get('system')!();assert.equal(reload.root.dataset.theme,'light');
  reload.api.select('automatic');assert.equal(reload.root.dataset.theme,'dark');
  assert.equal(reload.meta.get('meta[name="theme-color"]'),'#101b17');
});
test('theme tolerates blocked storage and invalid values, and updates between tabs',()=>{
  const blocked=theme(null,false,true);blocked.api.select('dark');assert.equal(blocked.root.dataset.theme,'dark');
  const h=theme('unexpected',true);assert.equal(h.api.value,'automatic');h.api.select('unexpected');assert.equal(h.api.value,'automatic');
  h.events.get('storage')!({key:'oasis-theme',newValue:'light'});assert.equal(h.root.dataset.theme,'light');
  h.events.get('storage')!({key:null,newValue:null});assert.equal(h.root.dataset.theme,'dark');
  assert.match(h.api.panel(),/Light/);assert.match(h.api.panel(),/Dark/);assert.match(h.api.panel(),/Automatic/);assert.match(h.api.panel(),/data-oasis-install/);
});
