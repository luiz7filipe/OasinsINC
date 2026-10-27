import {DatabaseSync,type SQLInputValue} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

// The narrow D1-compatible surface used by Drizzle and the application.
// Each statement runs synchronously; a batch commits atomically on one connection.
export class SQLiteStore {
  readonly connection:DatabaseSync;
  constructor(path:string){this.connection=new DatabaseSync(path);this.connection.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');}
  prepare(sql:string){return new SQLiteStatement(this,sql);}
  async batch(statements:SQLiteStatement[]){this.connection.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.result());this.connection.exec('COMMIT');return results;}catch(error){this.connection.exec('ROLLBACK');throw error;}}
  async exec(sql:string){this.connection.exec(sql);return {count:1,duration:0};}
  asD1(){return this as unknown as D1Database;}
  close(){this.connection.close();}
  migrate(directory:string){
    this.connection.exec('CREATE TABLE IF NOT EXISTS oasis_migration(name TEXT PRIMARY KEY, digest TEXT NOT NULL, applied_at INTEGER NOT NULL)');
    for(const name of readdirSync(directory).filter(n=>/^\d+_.+\.sql$/.test(n)).sort()){
      const source=readFileSync(join(directory,name),'utf8'),digest=createHash('sha256').update(source).digest('hex');
      const prior=this.connection.prepare('SELECT digest FROM oasis_migration WHERE name=?').get(name);
      if(prior){if(prior.digest!==digest)throw new Error('Applied migration checksum mismatch');continue;}
      this.connection.exec('BEGIN IMMEDIATE');try{this.connection.exec(source);this.connection.prepare('INSERT INTO oasis_migration VALUES(?,?,?)').run(name,digest,Date.now());this.connection.exec('COMMIT');}catch(error){this.connection.exec('ROLLBACK');throw error;}
    }
  }
}
class SQLiteStatement {
  constructor(private store:SQLiteStore,private sql:string,private values:SQLInputValue[]=[]){ }
  bind(...values:SQLInputValue[]){return new SQLiteStatement(this.store,this.sql,values);}
  result(){const statement=this.store.connection.prepare(this.sql);if(statement.columns().length){const results=statement.all(...this.values);return {success:true,results,meta:{changes:results.length,duration:0}};}const info=statement.run(...this.values);return {success:true,results:[],meta:{changes:Number(info.changes),last_row_id:Number(info.lastInsertRowid),duration:0}};}
  async run(){return this.result();}
  async all(){return this.result();}
  async first(column?:string){const row=this.store.connection.prepare(this.sql).get(...this.values);return row?(column?row[column]:row):null;}
  async raw(options?:{columnNames?:boolean}){const s=this.store.connection.prepare(this.sql);s.setReturnArrays(true);const rows=s.all(...this.values);return options?.columnNames?[s.columns().map(c=>c.name),...rows]:rows;}
}
