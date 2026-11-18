export const DAILY_LIMIT=3,MIN_GAP=7200000;
export const ACTIVE_STATUSES=['scheduled','preparing','prepared','uncertain','published'];
export const ACTIVE_SQL="status IN('scheduled','preparing','prepared','uncertain','published')";
export const TIME_SQL="CASE WHEN status='published' THEN COALESCE(scheduled_at,updated_at) ELSE scheduled_at END";
export const WINDOWS=[[10,12],[15,18],[19,22]];
export function dayBounds(date){if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date))return null;const start=new Date(date+'T00:00:00+09:00');if(!Number.isFinite(+start)||start.toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})!==date)return null;return {start:start.toISOString(),end:new Date(+start+86400000).toISOString()};}
const timestamp=(date,h)=>Date.parse(date+'T'+String(h).padStart(2,'0')+':00:00+09:00');
function subtract(segments,lo,hi){return segments.flatMap(([a,b])=>hi<a||lo>b?[[a,b]]:[[a,Math.min(b,lo-1)],[Math.max(a,hi+1),b]].filter(([x,y])=>x<=y));}
export function plans(date,count,reservations,clock=new Date()){
 const bounds=dayBounds(date);if(!bounds||!Number.isInteger(count)||count<1||count>DAILY_LIMIT)return [];
 const day=reservations.filter(r=>r.at&&r.at>=bounds.start&&r.at<bounds.end);if(day.length+count>DAILY_LIMIT)return [];
 const busy=reservations.map(r=>Date.parse(r.at)).filter(Number.isFinite);
 const slots=WINDOWS.map(([a,b],index)=>{const start=timestamp(date,a),end=timestamp(date,b);let segments=[[Math.max(start,+clock+60000),end-1]].filter(([lo,hi])=>lo<=hi);if(busy.some(t=>t>=start&&t<end))segments=[];for(const t of busy)segments=subtract(segments,t-MIN_GAP+1,t+MIN_GAP-1);return {index,start,end,segments};});
 const options=[];
 function visit(next,chosen){if(chosen.length===count){const latest=chosen.map(p=>p.hi);for(let i=count-2;i>=0;i--)latest[i]=Math.min(latest[i],latest[i+1]-MIN_GAP);if(chosen.every((p,i)=>p.lo<=latest[i]))options.push(chosen.map((p,i)=>({...p,latest:latest[i]})));return;}for(let i=next;i<slots.length;i++){const slot=slots[i];for(const [lo,hi]of slot.segments)visit(i+1,[...chosen,{index:slot.index,start:slot.start,end:slot.end,lo,hi}]);}}
 visit(0,[]);return options;
}
export function planTimes(date,count,reservations,clock=new Date(),random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296){const options=plans(date,count,reservations,clock);if(!options.length)return null;const chosen=options[Math.floor(random()*options.length)],result=[];for(const p of chosen){const lo=Math.max(p.lo,result.length?result.at(-1).ms+MIN_GAP:0),ms=lo+Math.floor(random()*(p.latest-lo+1));result.push({at:new Date(ms).toISOString(),ms,windowStart:new Date(p.start).toISOString(),windowEnd:new Date(p.end).toISOString()});}return result;}
export function dateAvailability(date,reservations,clock=new Date()){const bounds=dayBounds(date);if(!bounds)return null;const used=reservations.filter(r=>r.at&&r.at>=bounds.start&&r.at<bounds.end).length;let maxSelectable=0;for(let n=1;n<=DAILY_LIMIT-used;n++)if(plans(date,n,reservations,clock).length)maxSelectable=n;return {date,used,remaining:Math.max(0,DAILY_LIMIT-used),maxSelectable,reason:used>=DAILY_LIMIT?'満枠':!maxSelectable?'予約できる時間枠なし':''};}
