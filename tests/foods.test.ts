import {test} from 'node:test';
import assert from 'node:assert/strict';
import {foods,foodName,searchFoods,foodPortion} from '../client/food-model';
import {mealSchema} from '../shared/wellness';
import {guestStore} from '../client/guest';
test('food search accepts Portuguese accents, alternate word order and common names',()=>{
 assert.equal(foods.length,582);assert.equal(new Set(foods.map(f=>f.id)).size,582);
 assert.equal(searchFoods('arroz branco cozido')[0].id,'taco:3');
 assert.equal(searchFoods('COZIDO BRANCO arroz')[0].id,'taco:3');
 assert.ok(searchFoods('pao de forma').some(f=>f.id==='taco:52'));
 assert.ok(searchFoods('carne moida').length>0);
 assert.deepEqual(searchFoods('alimento inexistente xyz'),[]);
 assert.equal(foodName(foods.find(f=>f.id==='taco:3')!),'Arroz branco, cozido');
});
test('gram calculations distinguish raw and cooked rice, scale macros, and reject invalid portions',()=>{
 const cooked=foods.find(f=>f.id==='taco:3')!,raw=foods.find(f=>f.id==='taco:4')!;
 assert.deepEqual(foodPortion(cooked,100),{kcal:128.26,p:2.52,c:28.06,f:0.23});
 assert.equal(foodPortion(cooked,250).kcal,320.65);assert.equal(foodPortion(cooked,50).c,14.03);
 assert.ok(foodPortion(raw,100).kcal>350);
 for(const value of [0,-1,NaN,Infinity,5001])assert.throws(()=>foodPortion(cooked,value));
 assert.throws(()=>foodPortion(foods.find(f=>f.kcal>800)!,5000));
 for(const food of foods){const p=foodPortion(food,100);assert.ok(Object.values(p).every(v=>Number.isFinite(v)&&v>=0));}
});
test('food portions remain local for guests and preserve the fixed expiry',()=>{
 const storage=new Map();const adapter={getItem:(k:string)=>storage.get(k)||null,setItem:(k:string,v:string)=>{storage.set(k,v);},removeItem:(k:string)=>{storage.delete(k);}};
 const guest=guestStore(adapter,()=>10000),start=guest.start('2026-09-11');
 const food=foods.find(f=>f.id==='taco:3')!,meal=mealSchema.parse({id:1,name:foodName(food)+' · 100 g',type:'Almoço',...foodPortion(food,100),foodId:food.id,grams:100});
 guest.save({...start.state,meals:[meal]},start.day);
 const reloaded=guestStore(adapter,()=>20000).read()!;
 assert.deepEqual(reloaded.state.meals,[meal]);assert.equal(reloaded.expiresAt,start.expiresAt);
 assert.equal(mealSchema.safeParse({...meal,grams:undefined}).success,false);
 assert.equal(mealSchema.safeParse({...meal,kcal:-1}).success,false);
});
