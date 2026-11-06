"use client";
import Link from "next/link";
import {useState,type FormEvent} from "react";
import {authClient} from "@/lib/pro-auth/client";

export default function RecoveryScreen({mode}:{mode:"forgot-password"|"reset-password"}){
  const recovering=mode==="reset-password";
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      if(recovering){
        const token=new URLSearchParams(location.search).get("token")||"";
        if(!token)throw new Error("Ο σύνδεσμος επαναφοράς είναι άκυρος ή λείπει.");
        if(password.length<12)throw new Error("Χρειάζονται τουλάχιστον 12 χαρακτήρες.");
        const result=await authClient.resetPassword({newPassword:password,token});
        if(result.error)throw new Error(result.error.message||"Η επαναφορά απέτυχε.");
        setNotice("Ο κωδικός άλλαξε. Οι προηγούμενες συνεδρίες ανακλήθηκαν. Μπορείς να συνδεθείς.");
      }else{
        const result=await authClient.requestPasswordReset({
          email:email.trim().toLowerCase(),
          redirectTo:location.origin+"/auth/reset-password"
        });
        if(result.error)throw new Error(result.error.message||"Δεν στάλθηκε το αίτημα.");
        setNotice("Αν υπάρχει λογαριασμός με αυτό το email, θα σταλούν οδηγίες επαναφοράς.");
      }
    }catch(err){setError(err instanceof Error?err.message:"Δεν ολοκληρώθηκε η ενέργεια.")}
    finally{setBusy(false);}
  }
  return <main className="gt-auth-page">
    <header className="gt-auth-header"><Link href="/" className="gt-auth-brand"><span aria-hidden="true">▶</span> GreekTube <b>Subs</b></Link><Link href="/" className="gt-auth-back">‹ Βιβλιοθήκη</Link></header>
    <section className="gt-auth-card">
      <div className="gt-auth-icon" aria-hidden="true">◇</div>
      <div className="gt-auth-eyebrow">ΑΝΑΚΤΗΣΗ ΛΟΓΑΡΙΑΣΜΟΥ</div>
      <h1>{recovering?"Νέος κωδικός":"Ξέχασες τον κωδικό;"}</h1>
      <p className="gt-auth-intro">{recovering?"Όρισε νέο κωδικό πρόσβασης.":"Θα στείλουμε οδηγίες επαναφοράς στο επαληθευμένο email."}</p>
      <form onSubmit={event=>void submit(event)} className="gt-auth-form">
        {recovering?<label>Νέος κωδικός<input type="password" autoComplete="new-password" minLength={12} required value={password} onChange={e=>setPassword(e.target.value)}/></label>
          :<label>Email<input type="email" inputMode="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>}
        {error&&<p className="gt-auth-error" role="alert">{error}</p>}
        {notice&&<p className="gt-auth-notice" role="status">{notice}</p>}
        <button type="submit" className="gt-auth-submit" disabled={busy}>{busy?"Επεξεργασία…":recovering?"Αλλαγή κωδικού":"Αποστολή οδηγιών"}</button>
      </form>
      <p className="gt-auth-switch"><Link href="/auth/sign-in">Επιστροφή στη σύνδεση</Link></p>
    </section>
  </main>;
}
