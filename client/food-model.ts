import rows from '../data/foods.json';
export type Food=typeof rows[number];
export const foods:readonly Food[]=rows;
export const normalize=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const popular=['taco:3','taco:410','taco:1'];
export const foodName=(food:Food)=>food.name.replace(/^Arroz, tipo 1,/, 'Arroz branco,');
const indexed=foods.map(food=>({food,text:normalize([food.name,...food.aliases].join(' ')),name:normalize(food.name)}));
export function searchFoods(query:string){
 const words=normalize(query).split(' ').filter(Boolean);
 return indexed.filter(row=>words.every(word=>row.text.includes(word))).sort((a,b)=>{
   const score=(row:typeof a)=>(popular.includes(row.food.id)?20:0)+(row.name.includes('cozido')||row.name.includes('grelhado')?5:0)+(row.name.startsWith(words.join(' '))?10:0);
   return score(b)-score(a)||a.food.name.localeCompare(b.food.name,'pt-BR');
 }).map(row=>row.food);
}
export function foodPortion(food:Food,grams:number){
 if(!Number.isFinite(grams)||grams<0.1||grams>5000)throw Error('Informe uma quantidade entre 0,1 e 5.000 g.');
 const scaled=(value:number)=>Math.round(value*grams)/100;
 const values={kcal:scaled(food.kcal),p:scaled(food.p),c:scaled(food.c),f:scaled(food.f)};
 if(values.kcal>10000||Math.max(values.p,values.c,values.f)>1000)throw Error('Porção muito grande para um registro. Reduza a quantidade.');
 return values;
}
