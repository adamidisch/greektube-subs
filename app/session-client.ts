"use client";
export const SESSION_ENDING_EVENT="greektube:session-ending";
export const SESSION_ENDED_KEY="greektube-session-ended:v1";
export async function logoutProfile(){
  window.dispatchEvent(new Event(SESSION_ENDING_EVENT));
  try{
    const response=await fetch("/api/logout",{method:"POST",credentials:"same-origin",cache:"no-store"});
    if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error||"Δεν ολοκληρώθηκε η αποσύνδεση.");}
  }catch(error){window.dispatchEvent(new Event("greektube:session-resume"));throw error;}
  for(const key of Object.keys(localStorage))if(key==="greektube-personal-state:v1"||key.startsWith("greektube-cue-overrides:"))localStorage.removeItem(key);
  localStorage.setItem(SESSION_ENDED_KEY,String(Date.now()));
  location.assign("/");
}
