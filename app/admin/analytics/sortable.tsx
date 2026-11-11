"use client";

export type Sort={key:string;dir:"asc"|"desc"}|null;
export type SortCol={key:string;label:string;numeric?:boolean};

/** Click cycle: first click = natural order (text A→Z, numbers high→low), second = reverse, third = clear. */
export function nextSort(current:Sort,key:string,numeric?:boolean):Sort{
  const first=numeric?"desc":"asc";
  if(!current||current.key!==key)return {key,dir:first};
  if(current.dir===first)return {key,dir:numeric?"asc":"desc"};
  return null;
}

export function sortRows<T>(rows:T[],sort:Sort,accessors:Record<string,(row:T)=>string|number>):T[]{
  const get=sort?accessors[sort.key]:undefined;
  if(!sort||!get)return rows;
  const sign=sort.dir==="asc"?1:-1;
  return [...rows].sort((a,b)=>{
    const x=get(a),y=get(b);
    const result=typeof x==="number"&&typeof y==="number"?x-y:String(x).localeCompare(String(y),undefined,{numeric:true,sensitivity:"base"});
    return result*sign;
  });
}

export function SortHead({cols,sort,onSort,className=""}:{cols:SortCol[];sort:Sort;onSort:(next:Sort)=>void;className?:string}){
  return <div className={"ad-tr head "+className} role="row">{cols.map(col=>{
    const active=sort?.key===col.key;
    return <span key={col.key} role="columnheader" aria-sort={active?(sort?.dir==="asc"?"ascending":"descending"):"none"}>
      <button type="button" className={"ad-sort"+(active?" active":"")} onClick={()=>onSort(nextSort(sort,col.key,col.numeric))}>
        {col.label}<i aria-hidden="true">{active?(sort?.dir==="asc"?"▲":"▼"):"↕"}</i>
      </button>
    </span>;
  })}</div>;
}
