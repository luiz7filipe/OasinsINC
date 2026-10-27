import { z } from 'zod';
import { Temporal } from '@js-temporal/polyfill';
export {wellnessInput,day} from '../shared/wellness';
export const reminderInput=z.object({
  title:z.string().trim().min(1).max(80),kind:z.enum(['agua','treino','refeicao','sono','outro']),
  time:z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),days:z.array(z.number().int().min(0).max(6)).min(1).max(7).refine(v=>new Set(v).size===v.length),
  timezone:z.string().max(80).refine(v=>{try{new Intl.DateTimeFormat('en',{timeZone:v});return true;}catch{return false;}}),enabled:z.boolean(),
}).strict();
export type ReminderData=z.infer<typeof reminderInput>;
export function allowedPushEndpoint(value:string){try{const u=new URL(value);const h=u.hostname;return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='push.services.mozilla.com'||h.endsWith('.push.apple.com')||h==='web.push.apple.com');}catch{return false;}}
export const subscriptionInput=z.object({endpoint:z.string().url().max(2048).refine(allowedPushEndpoint),expirationTime:z.number().nullable().default(null),keys:z.object({p256dh:z.string().regex(/^[A-Za-z0-9_-]{87}$/),auth:z.string().regex(/^[A-Za-z0-9_-]{22}$/)}).strict()}).strict();
export type StoredSubscription=z.infer<typeof subscriptionInput>;
export function nextOccurrence(r:ReminderData,after:number):number{
  const date=Temporal.Instant.fromEpochMilliseconds(after).toZonedDateTimeISO(r.timezone).toPlainDate();
  const [hour,minute]=r.time.split(':').map(Number);
  for(let i=0;i<15;i++){
    const d=date.add({days:i});if(!r.days.includes(d.dayOfWeek%7))continue;
    const candidate=Temporal.ZonedDateTime.from({timeZone:r.timezone,year:d.year,month:d.month,day:d.day,hour,minute},{disambiguation:'compatible'});
    // Skip nonexistent wall-clock times; choose the first occurrence on a DST fold.
    if(candidate.hour===hour&&candidate.minute===minute&&candidate.epochMilliseconds>after)return candidate.epochMilliseconds;
  }
  throw new Error('Unable to schedule reminder');
}
