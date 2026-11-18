import {createHash} from 'node:crypto';
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64');
export const imageId=createHash('sha256').update(png).digest('hex');
export const images=[{id:imageId,alt:'検証用の画像'}];
export function seedMedia(store){store.db.raw.prepare('INSERT OR IGNORE INTO media(id,mime,data,bytes) VALUES(?,?,?,?)').run(imageId,'image/png',png.toString('base64'),png.length);}
