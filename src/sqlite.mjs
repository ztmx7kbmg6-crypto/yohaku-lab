
import {DatabaseSync} from 'node:sqlite';
export function database(path){const raw=new DatabaseSync(path);raw.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');return {raw,prepare(sql){return {bind(...args){const s=raw.prepare(sql);return {async all(){return {results:s.all(...args)}},async first(){return s.get(...args)||null},async run(){return s.run(...args)}}}}},async batch(statements){raw.exec('BEGIN IMMEDIATE');try{const r=[];for(const s of statements)r.push(await s.all());raw.exec('COMMIT');return r}catch(e){raw.exec('ROLLBACK');throw e}}};}
