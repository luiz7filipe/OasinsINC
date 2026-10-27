import {wellnessInput} from '../shared/wellness';

export const GUEST_KEY='oasis-guest-v1',GUEST_TTL=24*60*60*1000;
export const emptyState=()=>({water:0,waterGoal:2000,calorieGoal:2100,goalWeight:75,meals:[],habits:[false,false,false,false],weights:[],exercises:[],workoutStarted:false,workoutDone:false,startedAt:null,finishedAt:null});
export const resetDay=(state:ReturnType<typeof wellnessInput.parse>['state'])=>({...state,water:0,meals:[],habits:[false,false,false,false],exercises:[],workoutStarted:false,workoutDone:false,startedAt:null,finishedAt:null});
type Record={version:1;startedAt:number;expiresAt:number;day:string;state:ReturnType<typeof wellnessInput.parse>['state']};
export function guestStore(storage:Pick<Storage,'getItem'|'setItem'|'removeItem'>,now=Date.now){
  let memory:Record|null=null,available=true;
  const clear=()=>{memory=null;try{storage.removeItem(GUEST_KEY);}catch{available=false;}};
  function read():Record|null{
    let raw:string|null=null;try{raw=storage.getItem(GUEST_KEY);}catch{available=false;}
    try{
      const value=!available?memory:(raw?JSON.parse(raw.length<=250000?raw:'invalid'):null);
      if(!value)return null;
      if(value.version!==1||!Number.isSafeInteger(value.startedAt)||!Number.isSafeInteger(value.expiresAt)||value.startedAt>now()||value.expiresAt-value.startedAt!==GUEST_TTL||now()>=value.expiresAt)throw Error('expired');
      const parsed=wellnessInput.parse({state:value.state,day:value.day,revision:0});
      memory={version:1,startedAt:value.startedAt,expiresAt:value.expiresAt,day:parsed.day,state:parsed.state};return structuredClone(memory);
    }catch{clear();return null;}
  }
  function write(value:Record){memory=structuredClone(value);try{storage.setItem(GUEST_KEY,JSON.stringify(value));available=true;}catch{available=false;}return structuredClone(value);}
  return {read,clear,get persistent(){return available;},
    start(day:string){const value=read(),startedAt=now();return write(value?{...value,day,state:value.day===day?value.state:resetDay(value.state)}:{version:1,startedAt,expiresAt:startedAt+GUEST_TTL,day,state:emptyState()});},
    save(state:unknown,day:string){const value=read();if(!value)throw Error('Sua sessão de visitante expirou.');const parsed=wellnessInput.parse({state,day,revision:0});return write({...value,day:parsed.day,state:parsed.state});},
  };
}
