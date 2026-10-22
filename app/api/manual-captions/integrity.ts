import {numberTokensMatch} from "../captions/numeric-integrity.ts";
type Cue={start:number;duration:number;text:string};
const text=(value:string)=>value.normalize("NFC").replace(/\s+/gu," ").trim();
export function matchesCanonicalManualSource(supplied:Cue[],existing:Cue[]){
  return supplied.length===existing.length&&supplied.every((cue,index)=>Math.abs(cue.start-existing[index].start)<=.002&&Math.abs(cue.duration-existing[index].duration)<=.002&&text(cue.text)===text(existing[index].text));
}
export function manualNumericMismatches(source:Cue[],translation:Cue[]){
  return source.flatMap((cue,index)=>!translation[index]||!numberTokensMatch(cue.text,translation[index].text)?[index+1]:[]);
}
