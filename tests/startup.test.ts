import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createContext,runInContext} from 'node:vm';
import {examplePlan} from './plan-fixture';
import {emptyState} from '../client/guest';

function harness(stalled=false){
  const listeners=new Map<string,Array<(event:any)=>void>>();
  const elements=new Map<string,any>(),scripts:any[]=[],timers=new Map<number,{fn:()=>void;ms:number}>();let timerId=0;
  const element=(key:string)=>{if(!elements.has(key)){const classes=new Set<string>();elements.set(key,{innerHTML:'',textContent:'',hidden:key==='#splash-screen',value:'100',valueAsNumber:100,validity:{valid:true},classList:{add:(v:string)=>classes.add(v),remove:(v:string)=>classes.delete(v),contains:(v:string)=>classes.has(v)},addEventListener(){},focus(){},replaceChildren(){},showModal(){this.open=true;},close(){this.open=false;}});}return elements.get(key);};
  const location={hash:'',search:'',origin:'https://app.example.com'};
  const document={getElementById:(id:string)=>element('#'+id),querySelector:element,querySelectorAll:()=>[],addEventListener(type:string,listener:(event:any)=>void){listeners.set(type,[...(listeners.get(type)||[]),listener]);},body:element('body'),createElement:()=>({}),head:{append:(script:any)=>scripts.push(script)}};
  const window={document,location,addEventListener(){},scrollTo(){}} as any;
  const context=createContext({window,document,location,history:{replaceState(){}},localStorage:{getItem:()=>null,removeItem(){}},navigator:{},structuredClone,Date,Intl,Promise,AbortController,AbortSignal,URL,URLSearchParams,TextEncoder,TextDecoder,Headers,Request,Response,crypto,performance,console,
    fetch:async(input:any)=>stalled?new Promise(()=>{}):new Response(JSON.stringify(String(input).includes('get-session')?null:{googleEnabled:true,emailEnabled:false})),
    setInterval(){},setTimeout(fn:()=>void,ms:number){timers.set(++timerId,{fn,ms});return timerId;},clearTimeout(id:number){timers.delete(id);},
  });
  const run=(file:string,module=false)=>runInContext((module?'(()=>{':'')+readFileSync(file,'utf8')+(module?'})()':''),context);
  run('dist/startup.js');
  const tick=()=>new Promise(resolve=>setImmediate(resolve));
  async function application(){const app=scripts.find(s=>s.src.includes('/app.js'));assert.ok(app);assert.ok(!scripts.some(s=>s.src.includes('/account.js')));run('dist/app.js');app.onload();await tick();const account=scripts.find(s=>s.src.includes('/account.js'));assert.equal(account.type,'module');run('dist/account.js',true);account.onload();await tick();}
  return {window,context,element,scripts,timers,application,tick,emit(type:string,event:any){for(const listener of listeners.get(type)||[])listener(event);},fire(ms:number){for(const [id,t]of [...timers])if(t.ms===ms){timers.delete(id);t.fn();}}};
}

test('startup waits for the dashboard before the account module and leaves the splash for login',async()=>{
  const h=harness();assert.equal(h.element('#splash-screen').hidden,false);await h.application();
  assert.match(h.element('#auth-content').innerHTML,/Criar conta/);
  assert.ok(![...h.timers.values()].some(t=>t.ms===20000));
  for(const t of [...h.timers.values()])t.fn();h.fire(250);
  assert.equal(h.element('#splash-screen').hidden,true);
});
test('a failed script shows a retry action instead of an endless spinner',async()=>{
  const h=harness();h.scripts.find(s=>s.src.includes('/app.js')).onerror(new Error('network'));await h.tick();
  assert.equal(h.element('#splash-screen').hidden,true);assert.match(h.element('#auth-content').innerHTML,/Tentar novamente/);
});
test('a stalled authentication request cannot trap the user on the splash',async()=>{
  const h=harness(true);await h.application();h.fire(20000);
  assert.equal(h.element('#splash-screen').hidden,true);assert.match(h.element('#auth-content').innerHTML,/Tentar novamente/);
});
test('the built dashboard uses the private plan and prevents starting its pending sessions',async()=>{
  const h=harness();await h.application();
  h.window.OasisApp.load({...emptyState(),personalPlan:examplePlan,weights:[{date:'2026-09-11',value:80}]});
  const home=runInContext('home()',h.context);assert.match(home,/Registrar comida/);assert.match(home,/250 ml de água/);assert.match(home,/Registrar peso/);assert.doesNotMatch(home,/Refeição planejada|Semana de cuidado|Hora de ficar/);
  const training=runInContext('training()',h.context);assert.match(training,/Agenda semanal provisória/);assert.doesNotMatch(training,/data-exercise=/);
  assert.doesNotMatch(runInContext('nutrition()',h.context),/Refeição planejada/);
  runInContext("action('food-plan')",h.context);assert.match(runInContext('nutrition()',h.context),/Refeição planejada/);
  runInContext("action('food-diary')",h.context);assert.match(runInContext('nutrition()',h.context),/Nenhum alimento registrado hoje/);
  assert.match(h.window.OasisUI.account(),/Minhas metas/);assert.match(h.window.OasisUI.account(),/Tema e instalação no celular/);
  assert.match(runInContext('evolution()',h.context),/Histórico de peso/);
  assert.doesNotMatch(runInContext('evolution()',h.context),/75,0/);
  runInContext("action('start-workout')",h.context);assert.equal(h.window.OasisApp.getState().workoutStarted,false);
  h.window.OasisApp.load(emptyState());assert.doesNotMatch(runInContext('nutrition()',h.context),/Refeição planejada/);
});
test('built food picker searches, previews grams and saves the selected portion once',async()=>{
 const h=harness();await h.application();h.window.OasisApp.load(emptyState());const saves:any[]=[];h.window.oasisSave=(snapshot:any)=>saves.push(snapshot);
 runInContext("action('meal')",h.context);assert.match(h.element('#modal-body').innerHTML,/food-query/);assert.match(h.element('#food-count').textContent,/582/);
 h.emit('input',{target:{id:'food-query',value:'arroz branco cozido',matches:()=>false}});
 assert.match(h.element('#food-results').innerHTML,/Arroz branco, cozido/);assert.doesNotMatch(h.element('#food-results').innerHTML,/Arroz branco, cru/);
 const button={dataset:{foodId:'taco:3'},hasAttribute:()=>false};h.emit('click',{target:{closest:(s:string)=>s==='button'?button:null}});
 assert.match(h.element('#modal-body').innerHTML,/id="food-grams"/);assert.match(h.element('#food-preview').innerHTML,/128,3/);
 h.element('#food-grams').valueAsNumber=250;h.emit('input',{target:{id:'food-grams',matches:()=>false}});assert.match(h.element('#food-preview').innerHTML,/320,7/);
 h.element('#food-grams').valueAsNumber=-1;h.emit('input',{target:{id:'food-grams',matches:()=>false}});assert.equal(h.element('#food-submit').disabled,true);
 h.element('#food-grams').valueAsNumber=250;h.emit('input',{target:{id:'food-grams',matches:()=>false}});h.element('#food-meal-type').value='Almoço';
 const event={target:{id:'food-portion-form',dataset:{},closest:()=>null,reportValidity:()=>true},preventDefault(){}};
 h.emit('submit',event);h.emit('submit',event);
 assert.equal(saves.length,1);assert.equal(saves[0].meals[0].grams,250);assert.equal(saves[0].meals[0].kcal,320.65);assert.equal(saves[0].meals[0].foodId,'taco:3');assert.equal(saves[0].habits[0],true);
 assert.equal(h.element('#modal').open,false);
});
