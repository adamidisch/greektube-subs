export type SkipRange = {start:number;end:number};

export const SKIP_RANGES_UPDATED_EVENT="gts:skip-ranges-updated";

const MIN_RANGE_SECONDS=.15;
const OVERLAP_TOLERANCE=.01;

function numericRanges(input:unknown):SkipRange[]{
  if(!Array.isArray(input))return [];
  return input.map(item=>{
    const value=item as {start?:unknown;end?:unknown};
    return {start:Number(value?.start),end:Number(value?.end)};
  }).sort((left,right)=>{
    if(!Number.isFinite(left.start))return 1;
    if(!Number.isFinite(right.start))return -1;
    return left.start-right.start;
  });
}

export function validateSkipRanges(input:unknown,duration=0){
  const ranges=numericRanges(input);
  const errors:string[]=[];
  ranges.forEach((range,index)=>{
    if(!Number.isFinite(range.start)||!Number.isFinite(range.end))errors.push(`Range ${index+1}: μη έγκυρο timestamp.`);
    else if(range.start<0)errors.push(`Range ${index+1}: η αρχή δεν μπορεί να είναι αρνητική.`);
    else if(range.end<=range.start+MIN_RANGE_SECONDS)errors.push(`Range ${index+1}: το τέλος πρέπει να είναι μετά την αρχή.`);
    else if(duration>0&&range.end>duration+.25)errors.push(`Range ${index+1}: το τέλος είναι έξω από τη διάρκεια του βίντεο.`);
    const previous=ranges[index-1];
    if(previous&&Number.isFinite(previous.end)&&Number.isFinite(range.start)&&range.start<previous.end-OVERLAP_TOLERANCE)errors.push(`Range ${index+1}: επικαλύπτεται με το προηγούμενο range.`);
  });
  return {ranges,errors};
}

export function normalizeSkipRanges(input:unknown):SkipRange[]{
  return numericRanges(input).filter(range=>Number.isFinite(range.start)&&Number.isFinite(range.end)&&range.start>=0&&range.end>range.start+MIN_RANGE_SECONDS);
}

export function activeSkipTarget(input:unknown,currentTime:number,duration=0):number|null{
  if(!Number.isFinite(currentTime)||currentTime<0)return null;
  let target:number|null=null;
  for(const range of normalizeSkipRanges(input)){
    if(currentTime>=range.start&&currentTime<range.end-OVERLAP_TOLERANCE)target=target===null?range.end:Math.max(target,range.end);
  }
  if(target===null)return null;
  return duration>0?Math.min(duration,target):target;
}

export function formatSkipTimecode(seconds:number){
  const totalTenths=Math.max(0,Math.round((Number(seconds)||0)*10));
  const tenths=totalTenths%10;
  const wholeSeconds=Math.floor(totalTenths/10);
  const hours=Math.floor(wholeSeconds/3600);
  const minutes=Math.floor((wholeSeconds%3600)/60);
  const remainingSeconds=wholeSeconds%60;
  const minuteText=String(minutes).padStart(2,"0");
  const base=`${minuteText}:${String(remainingSeconds).padStart(2,"0")}.${tenths}`;
  return hours?`${hours}:${base}`:base;
}

export function parseSkipTimecode(input:string):number|null{
  const clean=input.trim().replace(",", ".");
  if(!clean)return null;
  const parts=clean.split(":");
  if(parts.length<1||parts.length>3||parts.some(part=>part.trim()===""))return null;
  const values=parts.map(Number);
  if(values.some(value=>!Number.isFinite(value)||value<0))return null;
  let total=0;
  if(values.length===1)total=values[0];
  else if(values.length===2){
    const [minutes,seconds]=values;
    if(!Number.isInteger(minutes)||seconds>=60)return null;
    total=minutes*60+seconds;
  }else{
    const [hours,minutes,seconds]=values;
    if(!Number.isInteger(hours)||!Number.isInteger(minutes)||minutes>=60||seconds>=60)return null;
    total=hours*3600+minutes*60+seconds;
  }
  return Math.round(total*10)/10;
}
