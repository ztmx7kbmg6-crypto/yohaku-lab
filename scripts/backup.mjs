
import {backup,DatabaseSync} from 'node:sqlite';
import {mkdir,chmod} from 'node:fs/promises';
const dir='.state/backups';await mkdir(dir,{recursive:true,mode:0o700});
const file=`${dir}/${new Date().toISOString().replace(/[:.]/g,'-')}.sqlite`;
const db=new DatabaseSync('.state/local/yohaku.sqlite');await backup(db,file);await chmod(file,0o600);db.close();console.log('非公開のバックアップを保存しました');
