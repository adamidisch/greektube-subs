"use client";
import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { authClient } from "@/lib/pro-auth/client";
import { tr, useAppLanguage } from "../app-language";
import { SESSION_ENDED_KEY } from "../session-client";

type Step = "choose" | "code" | "finishing";
type Problem = "google" | "send" | "limit" | "code" | "complete" | "unavailable" | null;

const RESEND_SECONDS = 120;
const CODE_LENGTH = 6;

function GoogleMark() {
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M23.5 12.27c0-.85-.08-1.67-.22-2.45H12v4.64h6.45a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.27-2.09 3.57-5.17 3.57-8.81Z"/>
    <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.88-3a7.2 7.2 0 0 1-10.7-3.78H1.34v3.09A12 12 0 0 0 12 24Z"/>
    <path fill="#FBBC05" d="M5.36 14.31a7.2 7.2 0 0 1 0-4.62V6.6H1.34a12 12 0 0 0 0 10.8l4.02-3.09Z"/>
    <path fill="#EA4335" d="M12 4.77c1.76 0 3.34.6 4.58 1.8l3.44-3.44A11.5 11.5 0 0 0 12 0 12 12 0 0 0 1.34 6.6l4.02 3.09C6.3 6.88 8.9 4.77 12 4.77Z"/>
  </svg>;
}

function problemText(problem: Problem) {
  switch (problem) {
    case "google": return tr("Η σύνδεση με Google δεν ολοκληρώθηκε. Δοκιμάστε ξανά ή χρησιμοποιήστε κωδικό μέσω email.", "Google sign-in was not completed. Try again or use a code by email.");
    case "send": return tr("Η αποστολή του κωδικού απέτυχε. Ελέγξτε τη διεύθυνση email και δοκιμάστε ξανά.", "The code could not be sent. Check the email address and try again.");
    case "limit": return tr("Πολλές προσπάθειες σε σύντομο χρόνο. Δοκιμάστε ξανά σε λίγα λεπτά.", "Too many attempts. Try again in a few minutes.");
    case "code": return tr("Ο κωδικός δεν είναι σωστός ή έχει λήξει. Ελέγξτε τα ψηφία ή ζητήστε νέο κωδικό.", "The code is incorrect or has expired. Check the digits or request a new code.");
    case "complete": return tr("Η σύνδεση δεν ολοκληρώθηκε. Δοκιμάστε ξανά.", "Sign-in was not completed. Try again.");
    case "unavailable": return tr("Η σύνδεση δεν είναι διαθέσιμη αυτή τη στιγμή. Η χρήση χωρίς σύνδεση συνεχίζεται κανονικά.", "Sign-in is not available right now. You can keep using the site without signing in.");
    default: return "";
  }
}

function isRateLimited(error: { status?: number; message?: string } | null | undefined) {
  return error?.status === 429 || /too many|rate/i.test(error?.message || "");
}

function formatWait(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** Clears the guest cache and tells other open tabs to reload with the signed-in profile. */
function announceSignedIn() {
  try {
    localStorage.removeItem("greektube-personal-state:v1");
    localStorage.setItem(SESSION_ENDED_KEY, String(Date.now()));
  } catch {}
}

export default function LoginPage() {
  useAppLanguage();
  const [step, setStep] = useState<Step>("choose");
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"google" | "send" | "verify" | null>(null);
  const [problem, setProblem] = useState<Problem>(null);
  const [cooldown, setCooldown] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);
  const submittedCode = useRef("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const params = new URLSearchParams(location.search);
      if (params.get("signed_in") === "1") {
        announceSignedIn();
        location.replace("/");
        return;
      }
      const returnedWithError = params.get("error") === "google";
      if (returnedWithError) history.replaceState(null, "", "/login");
      const response = await fetch("/api/login/status", { cache: "no-store" }).catch(() => null);
      const data = await response?.json().catch(() => ({})) as { configured?: boolean } | undefined;
      if (!alive) return;
      const ready = Boolean(data?.configured);
      setConfigured(ready);
      if (!ready) setProblem("unavailable");
      else if (returnedWithError) setProblem("google");
    })();
    return () => { alive = false; };
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
    setBusy("google");
    setProblem(null);
    try {
      const result = await authClient.signIn.social({ provider: "google", callbackURL: "/auth/callback" });
      if (result?.error) throw result.error;
    } catch {
      setProblem("google");
      setBusy(null);
    }
  }

  async function requestCode(event?: FormEvent) {
    event?.preventDefault();
    if (busy) return;
    setBusy("send");
    setProblem(null);
    const result = await authClient.emailOtp.sendVerificationOtp({ email: email.trim().toLowerCase(), type: "sign-in" }).catch(() => null);
    setBusy(null);
    if (!result || result.error) {
      setProblem(isRateLimited(result?.error) ? "limit" : "send");
      return;
    }
    setCode("");
    submittedCode.current = "";
    setCooldown(RESEND_SECONDS);
    setStep("code");
  }

  async function verifyCode(value: string) {
    if (busy || value.length !== CODE_LENGTH || submittedCode.current === value) return;
    submittedCode.current = value;
    setBusy("verify");
    setProblem(null);
    const result = await authClient.signIn.emailOtp({ email: email.trim().toLowerCase(), otp: value }).catch(() => null);
    if (!result || result.error) {
      setProblem(isRateLimited(result?.error) ? "limit" : "code");
      setBusy(null);
      return;
    }
    setStep("finishing");
    const response = await fetch("/api/login/complete", { method: "POST", credentials: "same-origin", cache: "no-store" }).catch(() => null);
    if (response?.ok) {
      announceSignedIn();
      location.replace("/");
      return;
    }
    setProblem("complete");
    setStep("code");
    setBusy(null);
  }

  function updateCode(raw: string) {
    const digits = raw.replace(/\D/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (problem === "code") setProblem(null);
    if (digits.length < CODE_LENGTH) submittedCode.current = "";
    if (digits.length === CODE_LENGTH) void verifyCode(digits);
  }

  const disabled = configured !== true;
  const message = problemText(problem);
  const alert = message ? <p className={`gts-login-alert${problem === "unavailable" ? " is-info" : ""}`} role={problem === "unavailable" ? "status" : "alert"}>{message}</p> : null;

  return <main className="gts-login">
    <section className="gts-login-card" aria-labelledby="gts-login-title">
      <Link href="/" className="gts-login-brand" aria-label={tr("GreekTube Subs, αρχική σελίδα", "GreekTube Subs, home")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gtslogo.svg" alt="" width={30} height={30}/>
        <span>GreekTube <em>Subs</em></span>
      </Link>

      {step === "choose" && <div className="gts-login-body">
        <header className="gts-login-head">
          <h1 id="gts-login-title">{tr("Σύνδεση", "Sign in")}</h1>
          <p>{tr("Με τη σύνδεση, τα αγαπημένα, οι στιγμές και οι ρυθμίσεις αποθηκεύονται στον λογαριασμό και είναι διαθέσιμα σε κάθε συσκευή.", "Signing in stores favorites, moments and settings in your account, so they are available on every device.")}</p>
          <p className="gts-login-keep">{tr("Η σύνδεση παραμένει ενεργή σε αυτόν τον browser μέχρι την αποσύνδεση.", "You stay signed in on this browser until you sign out.")}</p>
        </header>

        {alert}

        <div className="gts-login-section">
        <button type="button" className="gts-login-google" onClick={() => void google()} disabled={disabled || busy !== null} aria-busy={busy === "google"}>
          <GoogleMark/><span>{busy === "google" ? tr("Μετάβαση στη Google…", "Opening Google…") : tr("Συνέχεια με Google", "Continue with Google")}</span>
        </button>

        </div>

        <div className="gts-login-or" role="separator"><span>{tr("ή με email", "or with email")}</span></div>

        <form onSubmit={requestCode} className="gts-login-form gts-login-section">
          <label htmlFor="gts-login-email">{tr("Διεύθυνση email", "Email address")}</label>
          <input id="gts-login-email" type="email" inputMode="email" autoComplete="email" enterKeyHint="send" required placeholder="name@example.com" value={email} onChange={event => setEmail(event.target.value)} disabled={disabled}/>
          <button type="submit" className="gts-login-primary" disabled={disabled || busy !== null || !/^\S+@\S+\.\S+$/.test(email.trim())}>
            {busy === "send" ? tr("Αποστολή…", "Sending…") : tr("Αποστολή κωδικού", "Send code")}
          </button>
          <p className="gts-login-hint">{tr("Θα σταλεί κωδικός 6 ψηφίων στη διεύθυνση email. Ελέγξτε τα εισερχόμενα και εισαγάγετε τον κωδικό στο επόμενο βήμα. Δεν απαιτείται κωδικός πρόσβασης.", "A 6-digit code will be sent to the email address. Check your inbox and enter the code in the next step. No password is required.")}</p>
        </form>

        <footer className="gts-login-guest">
          <div>
            <strong>{tr("Χωρίς λογαριασμό", "Without an account")}</strong>
            <p>{tr("Τα δεδομένα αποθηκεύονται μόνο σε αυτόν τον browser.", "Data is stored in this browser only.")}</p>
          </div>
          <Link href="/" className="gts-login-secondary">{tr("Συνέχεια χωρίς σύνδεση", "Continue without signing in")}</Link>
        </footer>
      </div>}

      {step === "code" && <form className="gts-login-body" onSubmit={event => { event.preventDefault(); void verifyCode(code); }}>
        <header className="gts-login-head">
          <h1 id="gts-login-title">{tr("Κωδικός επιβεβαίωσης", "Verification code")}</h1>
          <p>{tr("Ο κωδικός 6 ψηφίων στάλθηκε στο", "The 6-digit code was sent to")} <strong>{email.trim()}</strong>.</p>
        </header>

        <div className={`gts-login-otp${problem === "code" ? " is-invalid" : ""}`}>
          <input
            ref={codeRef}
            id="gts-login-code"
            aria-label={tr("Κωδικός 6 ψηφίων", "6-digit code")}
            aria-invalid={problem === "code"}
            inputMode="numeric"
            autoComplete="one-time-code"
            enterKeyHint="done"
            pattern="[0-9]*"
            maxLength={CODE_LENGTH}
            value={code}
            onChange={event => updateCode(event.target.value)}
            disabled={busy === "verify"}
          />
          {Array.from({ length: CODE_LENGTH }, (_, index) => <span key={index} aria-hidden="true" className={`gts-login-cell${index === Math.min(code.length, CODE_LENGTH - 1) ? " is-current" : ""}${code[index] ? " is-filled" : ""}`}>{code[index] || ""}</span>)}
        </div>

        {alert}

        <button type="submit" className="gts-login-primary" disabled={busy !== null || code.length !== CODE_LENGTH}>
          {busy === "verify" ? tr("Επαλήθευση…", "Verifying…") : tr("Σύνδεση", "Sign in")}
        </button>

        <p className="gts-login-note">{tr("Ελέγξτε τα εισερχόμενα του email. Αν το μήνυμα δεν εμφανίζεται, ελέγξτε τον φάκελο Ανεπιθύμητα (Spam).", "Check your email inbox. If the message is not there, check the Spam/Junk folder.")}</p>

        <footer className="gts-login-row">
          <button type="button" className="gts-login-quiet" onClick={() => { setStep("choose"); setProblem(null); setCode(""); }}>{tr("Αλλαγή email", "Change email")}</button>
          <button type="button" className="gts-login-quiet" disabled={cooldown > 0 || busy !== null} onClick={() => void requestCode()}>
            {cooldown > 0 ? tr(`Νέος κωδικός σε ${formatWait(cooldown)}`, `New code in ${formatWait(cooldown)}`) : tr("Αποστολή νέου κωδικού", "Send a new code")}
          </button>
        </footer>
      </form>}

      {step === "finishing" && <div className="gts-login-body gts-login-finishing" role="status" aria-live="polite">
        <span className="gts-login-spinner" aria-hidden="true"/>
        <h1 id="gts-login-title">{tr("Σύνδεση…", "Signing in…")}</h1>
      </div>}
    </section>
  </main>;
}
