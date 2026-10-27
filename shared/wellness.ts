import { z } from 'zod';
const finite=(min:number,max:number)=>z.number().finite().min(min).max(max);
export const day=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v=>!Number.isNaN(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v);
const note=z.string().trim().min(1).max(2000);
export const personalPlanSchema=z.object({
  updatedOn:day,weightGoalPending:z.boolean(),
  profile:z.object({age:z.number().int().min(18).max(120),heightCm:finite(100,250),reportedWeightKg:finite(20,500),goal:note,injury:note,activity:note}).strict(),
  nutrition:z.object({targetKcal:finite(1,10000),meals:z.array(z.object({title:note,description:note,kcal:finite(1,10000)}).strict()).min(1).max(10),notes:z.array(note).max(12)}).strict(),
  training:z.object({status:z.literal('awaiting_assessment'),summary:note,days:z.array(z.object({day:z.number().int().min(0).max(6),title:note,details:note}).strict()).min(1).max(7).refine(v=>new Set(v.map(d=>d.day)).size===v.length),notes:z.array(note).max(12)}).strict(),
}).strict();
export const mealSchema=z.object({
  id:z.number().int().nonnegative(),name:z.string().trim().min(1).max(100),type:z.enum(['Café da manhã','Almoço','Lanche da tarde','Jantar','Outra refeição']),
  kcal:finite(0,10000),p:finite(0,1000),c:finite(0,1000),f:finite(0,1000),
  foodId:z.string().regex(/^taco:\d{1,3}$/).optional(),grams:finite(0.1,5000).optional(),
}).strict().refine(v=>(v.foodId===undefined)===(v.grams===undefined),'Alimento e porção devem ser informados juntos.');
export const wellnessInput=z.object({
  day,revision:z.number().int().min(0),state:z.object({
    water:finite(0,30000),waterGoal:finite(250,10000),calorieGoal:finite(1,10000),goalWeight:finite(20,500),personalPlan:personalPlanSchema.optional(),
    meals:z.array(mealSchema).max(100),
    weights:z.array(z.object({date:day,value:finite(20,500)}).strict()).max(2000),habits:z.array(z.boolean()).length(4),
    exercises:z.array(z.number().int().min(0).max(5)).max(6).refine(v=>new Set(v).size===v.length),workoutStarted:z.boolean(),workoutDone:z.boolean(),startedAt:z.number().nullable().optional(),finishedAt:z.number().nullable().optional(),
  }).strict(),
}).strict();
