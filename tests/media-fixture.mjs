import {createHash} from 'node:crypto';import {deflateSync} from 'node:zlib';
export const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII=','base64');
export const imageId=createHash('sha256').update(png).digest('hex');
export const images=[{id:imageId,alt:'検証用の画像'}];
function crc32(bytes){let crc=0xffffffff;for(const b of bytes){crc^=b;for(let i=0;i<8;i++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1}return(crc^0xffffffff)>>>0}
function chunk(type,data){const t=Buffer.from(type),n=Buffer.alloc(4),crc=Buffer.alloc(4);n.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([t,data])));return Buffer.concat([n,t,data,crc])}
const header=Buffer.alloc(13);header.writeUInt32BE(1,0);header.writeUInt32BE(1,4);header[8]=8;header[9]=6;
export const coverPng=Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,50,180,220,255]))),chunk('IEND',Buffer.alloc(0))]);
export const coverId=createHash('sha256').update(coverPng).digest('hex');
export const cover={id:coverId,alt:'本文とは別の見出し画像'};
export function seedMedia(store){for(const [id,data]of [[imageId,png],[coverId,coverPng]])store.db.raw.prepare('INSERT OR IGNORE INTO media(id,mime,data,bytes) VALUES(?,?,?,?)').run(id,'image/png',data.toString('base64'),data.length);}
