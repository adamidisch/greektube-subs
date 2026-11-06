"use client";
import Link from "next/link";
import {useState,type FormEvent} from "react";
import {authClient} from "@/lib/pro-auth/client";

export default function AuthScreen({mode}:{mode:"sign-in"|"sign-up"|"verify-email"}){
  const [step,setStep]=useState<"sign-in"|"sign-up"|"verify-email">(mode);
  const [username,setUsername]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [otp,setOtp]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const signup=step==="sign-up",verify=step==="verify-email";
  async function submit(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      if(verify){
        if(!/^\d{6,8}$/.test(otp))throw new Error("Πληκτρολόγησε τον κωδικό που έλαβες.");
        const result=await authClient.emailOtp.verifyEmail({email:email.trim().toLowerCase(),otp});
        if(result.error)throw new Error(result.error.message||"Η επαλήθευση απέτυχε.");
        setNotice("Το email επιβεβαιώθηκε. Μπορείς πλέον να συνδεθείς.");
        setStep("sign-in");
        return;
      }
      if(signup){
        if(username.trim().length<3)throw new Error("Το όνομα πρέπει να έχει τουλάχιστον 3 χαρακτήρες.");
        if(password.length<12)throw new Error("Ο κωδικός πρέπει να έχει τουλάχιστον 12 χαρακτήρες.");
        const result=await authClient.signUp.email({
          name:username.trim(),email:email.trim().toLowerCase(),password
        });
        if(result.error)throw new Error(result.error.message||"Η εγγραφή απέτυχε.");
        setStep("verify-email");
        setNotice("Στάλθηκε κωδικός επαλήθευσης στο email σου.");
        return;
      }
      const result=await authClient.signIn.email({
        email:email.trim().toLowerCase(),password
      });
      if(result.error)throw new Error(result.error.message||"Η σύνδεση απέτυχε.");
      // Server reads the verified Auth session and records a hashed session identifier.
      await fetch("/api/account/auth-session",{method:"POST",credentials:"same-origin"}).catch(()=>{});
      window.location.assign("/account");
    }catch(err){
      setError(err instanceof Error?err.message:"Δεν ήταν δυνατή η ολοκλήρωση.");
    }finally{setBusy(false);}
  }
  return <main className="gt-auth-page"><header className="gt-auth-header"><Link href="/" className="gt-auth-brand"><span aria-hidden="true">▶</span> GreekTube <b>Subs</b></Link><Link href="/" className="gt-auth-back">‹ Βιβλιοθήκη</Link></header>
    <section className="gt-auth-card">
      <div className="gt-auth-icon" aria-hidden="true">◇</div>
      <div className="gt-auth-eyebrow">ΑΣΦΑΛΗΣ ΛΟΓΑΡΙΑΣΜΟΣ</div>
      <h1>{verify?"Επαλήθευση email":signup?"Δημιουργία λογαριασμού":"Σύνδεση"}</h1>
      <p className="gt-auth-intro">{verify?"Πληκτρολόγησε τον κωδικό που έλαβες στο email σου.":signup?"Ένας λογαριασμός για να έχεις πρόσβαση από πολλές συσκευές.":"Σύνδεση σε επαληθευμένο προσωπικό λογαριασμό."}</p>
      <form onSubmit={event=>void submit(event)} className="gt-auth-form">
        {signup&&<label>Όνομα χρήστη<input autoComplete="name" value={username} onChange={e=>setUsername(e.target.value)} placeholder="Εμφανιζόμενο όνομα" minLength={3} maxLength={40} required/></label>}
        <label>Email<input autoComplete="email" inputMode="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com" required disabled={verify}/></label>
        {verify?<label>Κωδικός επαλήθευσης<input value={otp} onChange={e=>setOtp(e.target.value.replace(/[^0-9]/g,"").slice(0,8))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" minLength={6} maxLength={8} required/></label>
        :<label>Κωδικός πρόσβασης<input type="password" autoComplete={signup?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={signup?"Τουλάχιστον 12 χαρακτήρες":"Ο κωδικός σου"} minLength={signup?12:1} required/></label>}
        {error&&<p role="alert" className="gt-auth-error">{error}</p>}
        {notice&&<p role="status" className="gt-auth-notice">{notice}</p>}
        <button type="submit" className="gt-auth-submit" disabled={busy}>{busy?"Επεξεργασία…":verify?"Επιβεβαίωση":signup?"Δημιουργία λογαριασμού":"Σύνδεση"}</button>
      </form>
      {!verify&&<p className="gt-auth-switch">{signup?"Έχεις ήδη λογαριασμό;":"Δεν έχεις λογαριασμό;"} <Link href={signup?"/auth/sign-in":"/auth/sign-up"}>{signup?"Σύνδεση":"Εγγραφή"}</Link></p>}
      {verify&&<button type="button" className="gt-auth-text-link" onClick={()=>{setStep("sign-in");setError("");setNotice("")}}>Επιστροφή στη σύνδεση</button>}
      <p className="gt-auth-help">Οι υπάρχουσες προβολές αυτής της συσκευής δεν μεταφέρονται αυτόματα σε νέο λογαριασμό. Χρειάζεται ξεχωριστή ασφαλής σύνδεση ιστορικού.</p>
      <p className="gt-auth-legal"><Link href="/privacy">Απόρρητο</Link><span>·</span><Link href="/terms">Όροι</Link></p>
    </section>
  </main>;
}
