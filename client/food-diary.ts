import {foods,searchFoods,foodPortion,foodName,type Food} from './food-model';
import {mealSchema} from '../shared/wellness';
import type {z} from 'zod';
type Meal=z.infer<typeof mealSchema>;
type App={modal:(title:string,description:string,body:string)=>void;escapeHtml:(value:unknown)=>string;icon:(name:string)=>string;addMeal:(meal:Meal)=>void;openManualMeal:()=>void};
const mealTypes=['Café da manhã','Almoço','Lanche da tarde','Jantar','Outra refeição'] as const;
const source='https://nepa.unicamp.br/publicacoes/tabela-taco-excel/';
const fmt=(v:number,d=1)=>v.toLocaleString('pt-BR',{maximumFractionDigits:d});
export function createFoodDiary(app:App){
 const esc=app.escapeHtml,icon=app.icon;
 let query='',limit=25,selected:Food|null=null,lastType:typeof mealTypes[number]='Almoço';
 const el=<T=HTMLElement>(id:string)=>document.getElementById(id) as T|null;
 const footer=()=>`<p class="food-source">Fonte: <a href="${source}" target="_blank" rel="noopener noreferrer">TACO · NEPA/Unicamp</a>. Valores médios por 100 g da parte comestível; o preparo e a marca podem alterar a composição.</p>`;
 function renderResults(){
  const matches=searchFoods(query),visible=matches.slice(0,limit),root=el('food-results');if(!root)return;
  root.innerHTML=visible.length?visible.map(food=>`<button type="button" class="food-result" data-food-id="${food.id}"><span class="food-result-icon">${icon('utensils')}</span><span class="food-result-name"><strong>${esc(foodName(food))}</strong><small>${esc(food.category)}</small></span><span class="food-result-energy"><strong>${fmt(food.kcal,0)}</strong><small>kcal / 100 g</small></span>${icon('chevron-right')}</button>`).join(''):`<div class="food-empty">${icon('search')}<h3>Nenhum alimento encontrado</h3><p>Tente um nome mais simples, como “arroz” ou “frango”. Para um produto específico, use os valores do rótulo.</p><button type="button" class="secondary-button full-width" data-food-manual>Informar manualmente</button></div>`;
  const count=el('food-count');if(count)count.textContent=`${matches.length} alimento${matches.length===1?'':'s'}${query?' encontrado'+(matches.length===1?'':'s'): ' na base'} · mostrando ${visible.length}`;
  const more=el<HTMLButtonElement>('food-more');if(more)more.hidden=visible.length>=matches.length;
  (window as any).lucide?.createIcons();
 }
 function open(reset=true){
  if(reset){query='';limit=25;}selected=null;
  app.modal('Registrar alimento','Escolha o alimento e informe quanto você comeu.',`<div class="food-tabs"><span class="food-tab-active">${icon('search')}Buscar alimento</span><button type="button" data-food-manual>Informar manualmente</button></div><label class="field food-search-label" for="food-query">Buscar na lista<span class="food-search-wrap">${icon('search')}<input id="food-query" type="search" inputmode="search" maxlength="100" autocomplete="off" placeholder="Ex.: arroz branco, frango, pão…" value="${esc(query)}"></span></label><p class="food-search-hint">Escolha o mesmo preparo que você pesou: cru, cozido, assado ou grelhado.</p><p id="food-count" class="food-count" role="status"></p><div id="food-results" class="food-results"></div><button id="food-more" class="secondary-button full-width" type="button" data-food-more>Mostrar mais alimentos</button>${footer()}`);
  renderResults();el<HTMLInputElement>('food-query')?.focus();
 }
 function select(id:string){
  selected=foods.find(food=>food.id===id)||null;if(!selected)return;
  app.modal('Sua porção','Pese somente a parte que você consumiu.',`<form id="food-portion-form"><button class="food-back" type="button" data-food-back>${icon('arrow-left')}Trocar alimento</button><div class="food-selected"><span class="food-result-icon">${icon('utensils')}</span><div><h3>${esc(foodName(selected))}</h3><p>${fmt(selected.kcal,0)} kcal por 100 g · TACO</p></div></div><label class="field" for="food-grams">Quantidade em gramas<div class="food-grams-wrap"><input id="food-grams" name="grams" type="number" inputmode="decimal" min="0.1" max="5000" step="0.1" value="100" required><span>g</span></div></label><div class="food-presets" aria-label="Porções rápidas">${[50,100,150,200].map(g=>`<button type="button" data-food-grams="${g}">${g} g</button>`).join('')}</div><label class="field" for="food-meal-type">Refeição<select id="food-meal-type" name="type">${mealTypes.map(type=>`<option ${type===lastType?'selected':''}>${type}</option>`).join('')}</select></label><div id="food-preview" class="food-preview" aria-live="polite" aria-atomic="true"></div><p id="food-error" class="form-error" role="alert"></p><p class="food-search-hint">Use o peso no preparo indicado acima. Óleo, molhos e outros ingredientes devem ser registrados à parte quando não estiverem incluídos nesse preparo.</p>${selected.trace?'<p class="food-search-hint">Nutrientes em traços são aproximados como zero no cálculo.</p>':''}<div class="modal-actions food-save"><button type="button" class="secondary-button" data-action="close">Cancelar</button><button id="food-submit" type="submit" class="primary-button">${icon('plus')}Registrar alimento</button></div>${footer()}</form>`);
  preview();
 }
 function preview(){
  const form=el<HTMLFormElement>('food-portion-form');if(!form||!selected)return;
  const input=el<HTMLInputElement>('food-grams')!,button=el<HTMLButtonElement>('food-submit')!,error=el('food-error')!,box=el('food-preview')!;
  try{
   const grams=input.valueAsNumber;if(!input.validity.valid)throw Error('Informe uma quantidade entre 0,1 e 5.000 g.');
   const portion=foodPortion(selected,grams);button.disabled=false;error.textContent='';
   box.innerHTML=`<div class="food-calories"><span>Na sua porção de ${fmt(grams)} g</span><strong>${fmt(portion.kcal)} <small>kcal</small></strong></div><div class="food-macros">${[['Proteínas',portion.p],['Carboidratos',portion.c],['Gorduras',portion.f]].map(([name,value])=>`<div><strong>${fmt(Number(value))} g</strong><span>${name}</span></div>`).join('')}</div>`;
  }catch(err){button.disabled=true;box.innerHTML='';error.textContent=(err as Error).message;}
 }
 document.addEventListener('input',event=>{
  const target=event.target as HTMLInputElement;
  if(target.id==='food-query'){query=target.value;limit=25;renderResults();}
  if(target.id==='food-grams')preview();
 });
 document.addEventListener('click',event=>{
  const target=(event.target as Element).closest<HTMLElement>('button');if(!target)return;
  if(target.hasAttribute('data-food-manual')){selected=null;app.openManualMeal();}
  else if(target.hasAttribute('data-food-back'))open(false);
  else if(target.hasAttribute('data-food-more')){limit+=25;renderResults();}
  else if(target.dataset.foodId)select(target.dataset.foodId);
  else if(target.dataset.foodGrams){const input=el<HTMLInputElement>('food-grams');if(input){input.value=target.dataset.foodGrams;preview();}}
 });
 document.addEventListener('submit',event=>{
  const form=event.target as HTMLFormElement;if(form.id!=='food-portion-form')return;event.preventDefault();if(!selected||!form.reportValidity())return;
  const error=el('food-error')!;
  try{
   const grams=el<HTMLInputElement>('food-grams')!.valueAsNumber,type=el<HTMLSelectElement>('food-meal-type')!.value;
   const suffix=` · ${fmt(grams)} g`,name=foodName(selected).slice(0,100-suffix.length)+suffix;
   const meal=mealSchema.parse({id:Date.now(),name,type,...foodPortion(selected,grams),foodId:selected.id,grams});
   app.addMeal(meal);lastType=meal.type;selected=null;
  }catch(err){error.textContent=err instanceof Error&&err.name!=='ZodError'?err.message:'Não foi possível registrar. Confira a porção e a refeição.';}
 });
 return {open:()=>open()};
}
