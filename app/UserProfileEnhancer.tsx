"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Profile = { username: string; anonymous: boolean; createdAt?: string };
type Availability = "idle" | "checking" | "available" | "taken" | "invalid";
type ProfileLoad = "loading" | "ready" | "error";

const PROFILE_CHANNEL = "greektube-profile:v1";

function UserIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12.2a4.1 4.1 0 1 0 0-8.2 4.1 4.1 0 0 0 0 8.2Z"/><path d="M4.4 20c.8-4 3.2-6 7.6-6s6.8 2 7.6 6"/></svg>;
}
function EditIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 16.7-.8 3.1 3.1-.8L18.5 7.8a2.1 2.1 0 0 0-3-3L5 16.7Z"/><path d="m13.9 6.3 3.8 3.8"/></svg>;
}
function DevicesIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.2" y="4.5" width="12.5" height="9" rx="1.8"/><path d="M7.4 18.3h4.1M9.5 13.6v4.7"/><rect x="16.9" y="9" width="4" height="8.8" rx="1.1"/></svg>;
}

function validUsername(value: string) {
  const username = value.normalize("NFKC").trim();
  return username.length >= 3 && username.length <= 24 && /^[\p{L}\p{N}_-]+$/u.test(username);
}

export default function UserProfileEnhancer() {
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoad, setProfileLoad] = useState<ProfileLoad>("loading");
  const [profileLoadMessage, setProfileLoadMessage] = useState("Φόρτωση προφίλ…");
  const [menuOpen, setMenuOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [availability, setAvailability] = useState<Availability>("idle");
  const [availableUsername, setAvailableUsername] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const profileRequest = useRef(0);
  const profileAbort = useRef<AbortController | null>(null);
  const availabilityRequest = useRef(0);
  const profileChannel = useRef<BroadcastChannel | null>(null);

  useEffect(() => {
    const syncTarget = () => {
      setTarget(document.querySelector<HTMLElement>("main.app-shell:not(.viewer) > header.app-header"));
    };
    syncTarget();
    const observer = new MutationObserver(syncTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const loadProfile = useCallback(() => {
    const request = ++profileRequest.current;
    profileAbort.current?.abort();
    const controller = new AbortController();
    profileAbort.current = controller;
    const delay = (ms: number) => new Promise(resolve => window.setTimeout(resolve, ms));
    setProfileLoad("loading");
    setProfileLoadMessage("Φόρτωση προφίλ…");
    void (async () => {
      for (let attempt = 0; attempt < 6 && !controller.signal.aborted; attempt += 1) {
        try {
          const response = await fetch("/api/profile", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
          if (response.status === 409) {
            if (request === profileRequest.current) setProfileLoadMessage("Προετοιμασία ασφαλούς ταυτότητας…");
            await delay(450 + attempt * 350);
            continue;
          }
          const data = await response.json().catch(() => ({})) as { profile?: Profile; error?: string };
          if (!response.ok) throw new Error(data.error || "Δεν φορτώθηκε το προφίλ.");
          if (!data.profile?.username) throw new Error("Δεν επιστράφηκε έγκυρο προφίλ.");
          if (request === profileRequest.current && !controller.signal.aborted) {
            setProfile(data.profile);
            setProfileLoad("ready");
            setProfileLoadMessage("");
          }
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          if (attempt < 5) {
            await delay(700 + attempt * 250);
            continue;
          }
          if (request === profileRequest.current) {
            setProfileLoad("error");
            setProfileLoadMessage(error instanceof Error ? error.message : "Δεν φορτώθηκε το προφίλ.");
          }
          return;
        }
      }
      if (request === profileRequest.current && !controller.signal.aborted) {
        setProfileLoad("error");
        setProfileLoadMessage("Η ταυτότητα δεν ήταν ακόμη διαθέσιμη. Πάτησε για επανάληψη.");
      }
    })();
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(loadProfile, 0);
    return () => {
      window.clearTimeout(timer);
      profileAbort.current?.abort();
    };
  }, [loadProfile]);

  useEffect(() => {
    if (!("BroadcastChannel" in window)) return;
    const channel = new BroadcastChannel(PROFILE_CHANNEL);
    profileChannel.current = channel;
    channel.onmessage = event => {
      const next = (event.data as { type?: unknown; profile?: Profile } | null)?.profile;
      if (event.data?.type === "profile-updated" && next?.username) setProfile(next);
    };
    return () => {
      channel.close();
      if (profileChannel.current === channel) profileChannel.current = null;
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: MouseEvent) => {
      if (shellRef.current && !shellRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!editorOpen || !profile) return;
    const candidate = draft.normalize("NFKC").trim();
    if (!candidate || candidate === profile.username || !validUsername(candidate)) return;
    const request = ++availabilityRequest.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(`/api/profile?check=${encodeURIComponent(candidate)}`, { credentials: "same-origin", cache: "no-store", signal: controller.signal })
        .then(async response => {
          const data = await response.json().catch(() => ({})) as { available?: boolean; reserved?: boolean; error?: string };
          if (!response.ok) throw new Error(data.error || "Δεν έγινε ο έλεγχος.");
          if (request !== availabilityRequest.current || controller.signal.aborted) return;
          if (data.available) {
            setAvailability("available");
            setAvailableUsername(candidate);
            setMessage("✓ Διαθέσιμο");
          } else {
            setAvailability("taken");
            setAvailableUsername(null);
            setMessage(data.reserved ? "Αυτό το όνομα είναι δεσμευμένο." : "Το όνομα χρησιμοποιείται ήδη.");
          }
        })
        .catch(() => {
          if (controller.signal.aborted || request !== availabilityRequest.current) return;
          setAvailability("invalid");
          setAvailableUsername(null);
          setMessage("Δεν έγινε ο έλεγχος. Δοκίμασε ξανά.");
        });
    }, 320);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [draft, editorOpen, profile]);

  function openUsernameEditor() {
    if (!profile) return;
    setDraft(profile.username);
    setAvailability("idle");
    setAvailableUsername(null);
    setMessage("");
    setEditorOpen(true);
  }

  function updateDraft(value: string) {
    setDraft(value);
    const candidate = value.normalize("NFKC").trim();
    setAvailableUsername(null);
    if (!candidate || candidate === profile?.username) {
      setAvailability("idle");
      setMessage("");
    } else if (!validUsername(candidate)) {
      setAvailability("invalid");
      setMessage("3–24 χαρακτήρες. Γράμματα, αριθμοί, _ ή -.");
    } else {
      setAvailability("checking");
      setMessage("Έλεγχος διαθεσιμότητας…");
    }
  }

  async function saveUsername(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profile || saving) return;
    const candidate = draft.normalize("NFKC").trim();
    if (candidate === profile.username) {
      setEditorOpen(false);
      return;
    }
    if (!validUsername(candidate) || availability !== "available" || availableUsername !== candidate) return;
    setSaving(true);
    try {
      const response = await fetch("/api/profile", {
        method: "PATCH",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: candidate, currentUsername: profile.username }),
      });
      const data = await response.json().catch(() => ({})) as { profile?: Profile; error?: string; code?: string };
      if (!response.ok || !data.profile) {
        if (data.code === "profile_changed" && data.profile?.username) {
          setProfile(data.profile);
          setAvailability("idle");
          setAvailableUsername(null);
          setMessage(data.error || "Το προφίλ άλλαξε σε άλλη καρτέλα.");
          return;
        }
        setAvailability(response.status === 409 ? "taken" : "invalid");
        setAvailableUsername(null);
        setMessage(data.error || "Δεν αποθηκεύτηκε το όνομα.");
        return;
      }
      setProfile(data.profile);
      profileChannel.current?.postMessage({ type: "profile-updated", profile: data.profile });
      setEditorOpen(false);
      setMenuOpen(false);
    } finally {
      setSaving(false);
    }
  }

  if (!target) return null;

  if (!profile) {
    const recoveryUi = <div className="user-profile-shell">
      <button
        className={`user-profile-trigger user-profile-recovery ${profileLoad}`}
        type="button"
        onClick={loadProfile}
        disabled={profileLoad === "loading"}
        aria-label={profileLoad === "loading" ? "Φόρτωση προφίλ" : "Επανάληψη φόρτωσης προφίλ"}
        title={profileLoadMessage}
      >
        <span className="user-avatar"><UserIcon/></span>
        <span className="user-profile-name">{profileLoad === "loading" ? "Προφίλ…" : "Επανάληψη"}</span>
        <span className="sr-only" role="status" aria-live="polite">{profileLoadMessage}</span>
      </button>
    </div>;
    return createPortal(recoveryUi, target);
  }

  const profileUi = <div className="user-profile-shell" ref={shellRef}>
    <button className="user-profile-trigger" type="button" aria-label={`Προφίλ ${profile.username}`} aria-expanded={menuOpen} onClick={() => setMenuOpen(open => !open)}>
      <span className="user-avatar"><UserIcon/></span>
      <span className="user-profile-name">{profile.username}</span>
      <span className="user-profile-chevron" aria-hidden="true">⌄</span>
    </button>
    {menuOpen && <div className="user-profile-menu" role="menu">
      <div className="user-profile-summary">
        <span className="user-avatar user-avatar-large"><UserIcon/></span>
        <div><strong>{profile.username}</strong><small>{profile.anonymous ? "Ανώνυμο προφίλ" : "Προφίλ χρήστη"}</small></div>
      </div>
      <button type="button" className="user-menu-row" role="menuitem" onClick={openUsernameEditor}>
        <span className="user-menu-icon"><EditIcon/></span>
        <span><strong>Αλλαγή ονόματος</strong><small>Διάλεξε ένα μοναδικό username</small></span>
      </button>
      <button type="button" className="user-menu-row" role="menuitem" disabled>
        <span className="user-menu-icon"><DevicesIcon/></span>
        <span><strong>Σύνδεση συσκευής</strong><small>Σύντομα · ίδιο προφίλ σε mobile και desktop</small></span>
      </button>
    </div>}
  </div>;

  const editor = editorOpen ? createPortal(<div className="profile-editor-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !saving) setEditorOpen(false); }}>
    <section className="profile-editor" role="dialog" aria-modal="true" aria-label="Αλλαγή ονόματος χρήστη">
      <header><div><span>ΠΡΟΦΙΛ ΧΡΗΣΤΗ</span><h2>Αλλαγή ονόματος</h2></div><button type="button" aria-label="Κλείσιμο" onClick={() => setEditorOpen(false)} disabled={saving}>×</button></header>
      <form onSubmit={saveUsername}>
        <label htmlFor="greektube-username">Username</label>
        <div className={`profile-name-field ${availability}`}>
          <span className="user-avatar"><UserIcon/></span>
          <input id="greektube-username" autoFocus autoComplete="off" maxLength={24} value={draft} onChange={event => updateDraft(event.target.value)} />
        </div>
        <div className={`profile-availability ${availability}`} aria-live="polite">{message || "Μπορείς να το αλλάξεις οποιαδήποτε στιγμή."}</div>
        <p>Το username είναι μοναδικό για το GreekTube Subs. Το πραγματικό anonymous ID του προφίλ σου δεν αλλάζει.</p>
        <div className="profile-editor-actions"><button type="button" className="secondary" onClick={() => setEditorOpen(false)} disabled={saving}>Ακύρωση</button><button type="submit" className="primary" disabled={saving || (draft.trim() !== profile.username && (availability !== "available" || availableUsername !== draft.normalize("NFKC").trim()))}>{saving ? "Αποθήκευση…" : "Αποθήκευση"}</button></div>
      </form>
    </section>
  </div>, document.body) : null;

  return <>{createPortal(profileUi, target)}{editor}</>;
}
