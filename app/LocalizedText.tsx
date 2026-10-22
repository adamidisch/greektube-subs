"use client";
import {useAppLanguage} from "./app-language";
export default function LocalizedText({el,en}:{el:string;en:string}){
  const greek=el+(/\s$/u.test(en)&&!/\s$/u.test(el)?" ":"");
  return <>{useAppLanguage()==="en"?en:greek}</>;
}
