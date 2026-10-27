import {test} from 'node:test';
import assert from 'node:assert/strict';
import {wellnessInput} from '../shared/wellness';
import {emptyState,resetDay} from '../client/guest';
import {planViews} from '../client/plans.js';
import {examplePlan} from './plan-fixture';
test('plans remain separate from consumed meals and survive the next day',()=>{
 const state={...emptyState(),personalPlan:structuredClone(examplePlan)};
 const parsed=wellnessInput.parse({day:'2026-09-11',revision:1,state});
 assert.deepEqual(resetDay(parsed.state).personalPlan,examplePlan);assert.deepEqual(parsed.state.meals,[]);
 assert.equal(wellnessInput.safeParse({day:'2026-09-11',revision:1,state:{...state,personalPlan:{...examplePlan,training:{...examplePlan.training,days:[examplePlan.training.days[0],examplePlan.training.days[0]]}}}}).success,false);
});
test('plan rendering escapes private text and never offers an unapproved workout',()=>{
 const state={...emptyState(),personalPlan:structuredClone(examplePlan)};state.personalPlan.profile.goal='<img src=x onerror=alert(1)>';
 const views=planViews({getState:()=>structuredClone(state),icon:()=>'',escapeHtml:(s:string)=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')});
 assert.match(views.profile(),/&lt;img/);assert.doesNotMatch(views.profile(),/<img/);
 assert.doesNotMatch(views.training()+views.workout(),/data-action="(?:start|finish)-workout"|data-exercise=/);
 assert.match(views.nutrition(),/Planejamento diário/);assert.deepEqual(state.meals,[]);
});
