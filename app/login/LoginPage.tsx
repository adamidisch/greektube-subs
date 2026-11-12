"use client";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/pro-auth/client";
import { tr, useAppLanguage } from "../app-language";
import { SESSION_ENDED_KEY } from "../session-client";

type Step = "choose" | "code" | "finishing";

function GoogleMark() {
  return <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3a7.2 7.2 0 0 1-10.7-3.78H1.34v3.09A12 12 0 0 0 12 24Z"/>
    <path fill="#FBBC05" d="M5.36 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.34a12 12 0 0 0 0 10.8l4.02-3.09Z"/>
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.34 6.6l4.02 3.09C6.3 6.88 8.9 4.77 12 4.77Z"/>
  </svg>;
}

export default function LoginPage() {
  useAppLanguage();
  const [step, setStep] = useState<Step>("choose");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const submittedCode = useRef("");

  async function finish() {
    setStep("finishing");
    const response = await fetch("/api/login/complete", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      try {
        localStorage.removeItem("greektube-personal-state:v1");
        // Other open tabs reload with the signed-in profile.
        localStorage.setItem(SESSION_ENDED_KEY, String(Date.now()));
      } catch {}
      location.assign("/");
      return;
    }
    const data = await response?.json().catch(() => ({})) as { error?: string } | undefined;
    setError(data?.error || tr("Η σύνδεση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.", "Sign-in was not completed. Try again."));
    setStep("choose");
    setBusy(false);
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      const response = await fetch("/api/login/status", { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => ({})) as { configured?: boolean } | undefined;
      if (!alive) return;
      setConfigured(Boolean(data?.configured));
      // Coming back from Google: the Neon session exists, now link it to this browser's profile.
      if (data?.configured && new URLSearchParams(location.search).get("done") === "1") {
        history.replaceState(null, "", "/login");
        void finish();
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (step === "code") codeRef.current?.focus();
  }, [step]);

  async function google() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/login?done=1" });
      if (result?.error) throw new Error(result.error.message || tr("Δεν ξεκίνησε η σύνδεση με Google."));
    } catch {
      setError(tr("Δεν ήταν δυνατή η σύνδεση με Google. Δοκιμάστε ξανά.", "Google sign-in was not available. Try again."));
      setBusy(false);
    }
  }

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: "sign-in" });
      if (result.error) throw new Error(result.error.message || tr("Δεν στάλθηκε ο κωδικός."));
      setCode("");
      submittedCode.current = "";
      setCooldown(120);
      setStep("code");
    } catch {
      setError(tr("Δεν ήταν δυνατή η αποστολή του κωδικού. Δοκιμάστε ξανά.", "The code could not be sent. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(value: string) {
    if (busy || value.length !== 6 || submittedCode.current === value) return;
    submittedCode.current = value;
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: value });
      if (result.error) throw new Error(result.error.message || tr("Λάθος κωδικός."));
      await finish();
    } catch {
      setError(tr("Ο κωδικός δεν είναι έγκυρος ή έχει λήξει.", "The code is invalid or has expired."));
      setBusy(false);
    }
  }

  function updateCode(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, 6);
    setCode(digits);
    if (digits.length < 6) submittedCode.current = "";
    if (digits.length === 6) void verifyCode(digits);
  }

  const unavailable = configured === false;

  return <main className="gts-login">
    <section className="gts-login-card" aria-labelledby="gts-login-title">
      <Link href="/" className="gts-login-brand" aria-label="GreekTube Subs">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gtslogo.svg" alt="" width={40} height={40}/>
        <span>GreekTube <em>Subs</em></span>
      </Link>

      {step === "choose" && <div className="gts-login-form">
        <h1 id="gts-login-title">{tr("Σύνδεση", "Sign in")}</h1>
        <p className="gts-login-lead">{tr("Συγχρονισμός αγαπημένων και ρυθμίσεων σε όλες τις συσκευές.", "Sync favorites and settings across all your devices.")}</p>
        {unavailable && <p className="gts-login-note" role="status">{tr("Η σύνδεση δεν είναι ακόμη διαθέσιμη. Η χρήση ως επισκέπτης συνεχίζεται κανονικά.", "Sign-in is not available yet. Guest use continues as normal.")}</p>}
        <button type="button" className="gts-login-google" onClick={() => void google()} disabled={busy || configured !== true}>
          <GoogleMark/>{tr("Συνέχεια με Google", "Continue with Google")}
        </button>
        <div className="gts-login-or" aria-hidden="true"><span>{tr("ή", "or")}</span></div>
        <form onSubmit={requestCode} className="gts-login-emailform">
          <label htmlFor="gts-login-email">Email</label>
          <input id="gts-login-email" type="email" inputMode="email" autoComplete="email" required placeholder="name@email.com" value={email} onChange={event => setEmail(event.target.value)} disabled={configured !== true}/>
          {error && <p className="gts-login-error" role="alert">{error}</p>}
          <button type="submit" className="gts-login-primary" disabled={busy || configured !== true || !email.includes("@")}>{busy ? tr("Αποστολή…", "Sending…") : tr("Συνέχεια", "Continue")}</button>
        </form>
        <p className="gts-login-hint">{tr("Κωδικός μίας χρήσης 6 ψηφίων μέσω email. Δεν απαιτείται κωδικός πρόσβασης.", "A 6-digit one-time code by email. No password required.")}</p>
        <Link href="/" className="gts-login-guest">{tr("Συνέχεια ως επισκέπτης", "Continue as guest")}</Link>
      </div>}

      {step === "code" && <form onSubmit={event => { event.preventDefault(); void verifyCode(code); }} className="gts-login-form">
        <h1 id="gts-login-title">{tr("Επιβεβαίωση email", "Verify email")}</h1>
        <p className="gts-login-lead">{tr("Ο κωδικός 6 ψηφίων στάλθηκε στο", "The 6-digit code was sent to")} <strong>{email}</strong></p>
        <label htmlFor="gts-login-code" className="sr-only">{tr("Κωδικός", "Code")}</label>
        <input id="gts-login-code" ref={codeRef} className="gts-login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} placeholder="••••••" value={code} onChange={event => updateCode(event.target.value)}/>
        {error && <p className="gts-login-error" role="alert">{error}</p>}
        <p className="gts-login-hint">{tr("Σημείωση: έλεγχος και του φακέλου Ανεπιθύμητα (Spam).", "Note: also check the Spam/Junk folder.")}</p>
        <button type="submit" className="gts-login-primary" disabled={busy || code.length !== 6}>{busy ? tr("Επαλήθευση…", "Verifying…") : tr("Σύνδεση", "Sign in")}</button>
        <div className="gts-login-row">
          <button type="button" className="gts-login-link" onClick={() => { setStep("choose"); setError(""); }}>{tr("Αλλαγή email", "Change email")}</button>
          <button type="button" className="gts-login-link" disabled={cooldown > 0 || busy} onClick={() => void requestCode()}>{cooldown > 0 ? tr(`Νέα αποστολή σε ${cooldown}″`, `Resend in ${cooldown}s`) : tr("Αποστολή νέου κωδικού", "Send a new code")}</button>
        </div>
      </form>}

      {step === "finishing" && <div className="gts-login-form gts-login-status" role="status">
        <span className="gts-login-spinner" aria-hidden="true"/>
        <h1 id="gts-login-title">{tr("Σύνδεση…", "Signing in…")}</h1>
      </div>}
    </section>
  </main>;
}
