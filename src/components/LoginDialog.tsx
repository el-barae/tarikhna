"use client";

import { useEffect, useRef, useState } from "react";
import type { User } from "./Studio";
import "./studio.css";

export function useDialogFocus(onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  const closeHandler = useRef(onClose);
  closeHandler.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>("input, button, select, textarea, [tabindex='0']")?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); closeHandler.current(); }
      if (event.key !== "Tab" || !ref.current) return;
      const activeDialog = ref.current.querySelector<HTMLElement>('[role="alertdialog"]') || ref.current;
      const focusable = Array.from(activeDialog.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')).filter(element => element.getClientRects().length > 0);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", listener);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", listener); previous?.focus(); };
  }, []);
  return ref;
}

export default function LoginDialog({ onClose, onLogin, locale }: { onClose: () => void; onLogin: (user: User) => void; locale: "fr" | "en" | "ar" }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useDialogFocus(onClose);
  const text = locale === "fr" ? { eyebrow: "ESPACE CONTRIBUTEUR", title: "L’histoire se construit ensemble.", description: "Connectez-vous pour enrichir les données et préparer une nouvelle version de l’atlas.", email: "Adresse e-mail", password: "Mot de passe", submit: "Se connecter", pending: "Connexion…", close: "Fermer", error: "Connexion impossible. Vérifiez vos identifiants.", setup: "Première installation ? Créez votre compte administrateur depuis le terminal :" } : locale === "ar" ? { eyebrow: "مساحة المساهمين", title: "نكتب التاريخ معًا.", description: "سجّل الدخول لإثراء البيانات وإعداد إصدار جديد من الأطلس.", email: "البريد الإلكتروني", password: "كلمة المرور", submit: "تسجيل الدخول", pending: "جارٍ الاتصال…", close: "إغلاق", error: "تعذر تسجيل الدخول. تحقق من بياناتك.", setup: "التثبيت الأول؟ أنشئ حساب المسؤول من الطرفية:" } : { eyebrow: "CONTRIBUTOR SPACE", title: "History, built together.", description: "Sign in to enrich the data and prepare the next edition of the atlas.", email: "Email address", password: "Password", submit: "Sign in", pending: "Signing in…", close: "Close", error: "Unable to sign in. Check your credentials.", setup: "First installation? Create your administrator account in the terminal:" };
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || text.error);
      onLogin(body.user);
    } catch (cause) { setError(cause instanceof Error ? cause.message : text.error); }
    finally { setBusy(false); }
  }
  return <div className="studio-backdrop">
    <div ref={ref} className="login-dialog" role="dialog" aria-modal="true" aria-labelledby="login-title" dir={locale === "ar" ? "rtl" : "ltr"}>
      <button className="studio-close" onClick={onClose} aria-label={text.close}>×</button>
      <div className="login-symbol" aria-hidden="true">✧</div><span className="studio-eyebrow">{text.eyebrow}</span>
      <h2 id="login-title">{text.title}</h2><p>{text.description}</p>
      <form onSubmit={submit}>
        <label>{text.email}<input type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="vous@exemple.fr" dir="ltr" /></label>
        <label>{text.password}<input type="password" autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} /></label>
        {error && <div className="studio-message error" role="alert">{error}</div>}
        <button className="studio-primary login-submit" disabled={busy}>{busy ? text.pending : text.submit}<span aria-hidden="true">↗</span></button>
      </form>
      <div className="login-setup">{text.setup}<code>npm run setup</code></div>
    </div>
  </div>;
}
