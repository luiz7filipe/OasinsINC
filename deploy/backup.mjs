import {DatabaseSync,backup} from 'node:sqlite';
import {mkdir,readdir,copyFile,chmod,rm} from 'node:fs/promises';
import {join} from 'node:path';
const root='/var/backups/oasinsinc';await mkdir(root,{recursive:true,mode:0o700});
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const db=new DatabaseSync('/var/lib/oasinsinc/oasis.sqlite',{readOnly:true});
try{await backup(db,join(root,stamp+'.sqlite'));}finally{db.close();}
await chmod(join(root,stamp+'.sqlite'),0o600);
await copyFile('/etc/oasinsinc/app.env',join(root,stamp+'.env'));await chmod(join(root,stamp+'.env'),0o600);
const records=(await readdir(root)).filter(n=>/^\d{4}-\d\d-\d\dT[\d-]+Z\.sqlite$/.test(n)).sort().reverse();
for(const name of records.slice(14)){await rm(join(root,name));await rm(join(root,name.replace(/\.sqlite$/,'.env')),{force:true});}
console.log('Oasis backup completed');
