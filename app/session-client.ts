"use client";
export const SESSION_ENDING_EVENT="greektube:session-ending";
export const SESSION_ENDED_KEY="greektube-session-ended:v1";
export async function logoutProfile(){
  window.dispatchEvent(new Event(SESSION_ENDING_EVENT));
  try{
    // Provider sessions must be revoked before clearing the local device cookie.
    const {authClient}=await import("@/lib/pro-auth/client");
    const session=await authClient.getSession();
    if(session.error)throw new Error("Δεν επιβεβαιώθηκε η σύνδεση. Η αποσύνδεση ακυρώθηκε για προστασία του ιστορικού.");
    if(session.data?.session){
      const check=await fetch("/api/account/link-history",{credentials:"same-origin",cache:"no-store"});
      if(!check.ok)throw new Error("Δεν ελέγχθηκε η ασφάλεια του ιστορικού.");
      const identity=await check.json() as {authenticated?:boolean;linked?:boolean};
      if(!identity.authenticated||!identity.linked)throw new Error("Σύνδεσε πρώτα το ιστορικό με τον επαληθευμένο λογαριασμό από τη σελίδα Account.");
      // Session audit is best effort. Neon Auth revocation is authoritative.
      await fetch("/api/account/auth-session",{method:"DELETE",credentials:"same-origin"}).catch(()=>{});
      const result=await authClient.signOut();
      if(result.error)throw new Error(result.error.message||"Δεν ολοκληρώθηκε η ασφαλής αποσύνδεση.");
    }
    const response=await fetch("/api/logout",{method:"POST",credentials:"same-origin",cache:"no-store"});
    if(!response.ok){const data=await response.json().catch(()=>null);throw new Error(data?.error||"Δεν ολοκληρώθηκε η αποσύνδεση.");}
  }catch(error){window.dispatchEvent(new Event("greektube:session-resume"));throw error;}
  for(const key of Object.keys(localStorage))if(key==="greektube-personal-state:v1"||key.startsWith("greektube-cue-overrides:"))localStorage.removeItem(key);
  localStorage.setItem(SESSION_ENDED_KEY,String(Date.now()));
  location.assign("/");
}
