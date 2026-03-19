"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { CLIENT_PERSISTENCE_DISABLED } from "@/lib/client-persistence-policy";

const SIGN_IN_LANGUAGE_STORAGE_KEY = "inaccord:sign-in-language";

const languageOptions = [
  { value: "system", label: "System Default" },
  { value: "en-US", label: "English (US)" },
  { value: "es-ES", label: "Español" },
  { value: "fr-FR", label: "Français" },
  { value: "de-DE", label: "Deutsch" },
  { value: "it-IT", label: "Italiano" },
  { value: "pt-BR", label: "Português (Brasil)" },
  { value: "ja-JP", label: "日本語" },
  { value: "ko-KR", label: "한국어" },
  { value: "zh-CN", label: "中文（简体）" },
] as const;

const signInCopy = {
  "en-US": {
    title: "Sign in",
    email: "Email",
    password: "Password",
    signIn: "Sign in",
    signingIn: "Signing in...",
    language: "Language",
    needAccount: "Need an account?",
    signUp: "Sign up",
    hidePassword: "Hide password",
    showPassword: "Show password",
  },
  "es-ES": {
    title: "Iniciar sesión",
    email: "Correo electrónico",
    password: "Contraseña",
    signIn: "Iniciar sesión",
    signingIn: "Iniciando sesión...",
    language: "Idioma",
    needAccount: "¿Necesitas una cuenta?",
    signUp: "Regístrate",
    hidePassword: "Ocultar contraseña",
    showPassword: "Mostrar contraseña",
  },
  "fr-FR": {
    title: "Se connecter",
    email: "E-mail",
    password: "Mot de passe",
    signIn: "Se connecter",
    signingIn: "Connexion...",
    language: "Langue",
    needAccount: "Besoin d’un compte ?",
    signUp: "S’inscrire",
    hidePassword: "Masquer le mot de passe",
    showPassword: "Afficher le mot de passe",
  },
  "de-DE": {
    title: "Anmelden",
    email: "E-Mail",
    password: "Passwort",
    signIn: "Anmelden",
    signingIn: "Anmeldung läuft...",
    language: "Sprache",
    needAccount: "Noch kein Konto?",
    signUp: "Registrieren",
    hidePassword: "Passwort ausblenden",
    showPassword: "Passwort anzeigen",
  },
  "it-IT": {
    title: "Accedi",
    email: "Email",
    password: "Password",
    signIn: "Accedi",
    signingIn: "Accesso in corso...",
    language: "Lingua",
    needAccount: "Hai bisogno di un account?",
    signUp: "Registrati",
    hidePassword: "Nascondi password",
    showPassword: "Mostra password",
  },
  "pt-BR": {
    title: "Entrar",
    email: "E-mail",
    password: "Senha",
    signIn: "Entrar",
    signingIn: "Entrando...",
    language: "Idioma",
    needAccount: "Precisa de uma conta?",
    signUp: "Cadastre-se",
    hidePassword: "Ocultar senha",
    showPassword: "Mostrar senha",
  },
  "ja-JP": {
    title: "サインイン",
    email: "メールアドレス",
    password: "パスワード",
    signIn: "サインイン",
    signingIn: "サインイン中...",
    language: "言語",
    needAccount: "アカウントが必要ですか？",
    signUp: "新規登録",
    hidePassword: "パスワードを隠す",
    showPassword: "パスワードを表示",
  },
  "ko-KR": {
    title: "로그인",
    email: "이메일",
    password: "비밀번호",
    signIn: "로그인",
    signingIn: "로그인 중...",
    language: "언어",
    needAccount: "계정이 필요하신가요?",
    signUp: "회원가입",
    hidePassword: "비밀번호 숨기기",
    showPassword: "비밀번호 표시",
  },
  "zh-CN": {
    title: "登录",
    email: "电子邮箱",
    password: "密码",
    signIn: "登录",
    signingIn: "正在登录...",
    language: "语言",
    needAccount: "需要账号？",
    signUp: "注册",
    hidePassword: "隐藏密码",
    showPassword: "显示密码",
  },
} as const;

const resolveLanguagePreference = (value: string) => {
  if (value === "system") {
    if (typeof navigator === "undefined") {
      return "en-US";
    }

    const browserLanguage = String(navigator.language || "en-US").trim();
    const exactMatch = languageOptions.find((option) => option.value === browserLanguage);
    if (exactMatch) {
      return exactMatch.value;
    }

    const languageFamilyMatch = languageOptions.find((option) => option.value.startsWith(browserLanguage.split("-")[0] || ""));
    return languageFamilyMatch?.value ?? "en-US";
  }

  return languageOptions.some((option) => option.value === value) ? value : "en-US";
};

type SignInFormProps = {
  forcedNextPath?: string;
  contextMessage?: string | null;
  buildNumber?: string | null;
  versionLabel?: string | null;
};

type SessionDiagnosticsPayload = {
  ok?: boolean;
  code?: string;
  message?: string;
};

const isSafeInternalPath = (value: string) => {
  const normalized = String(value || "").trim();
  return normalized.startsWith("/") && !normalized.startsWith("//") && !normalized.startsWith("/\\");
};

const readResponsePayload = async (response: Response, fallback: string): Promise<SessionDiagnosticsPayload> => {
  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const payload = (await response.json().catch(() => null)) as SessionDiagnosticsPayload | null;
    return {
      ok: payload?.ok,
      code: typeof payload?.code === "string" ? payload.code : undefined,
      message: String(payload?.message || "").trim() || fallback,
    };
  }

  const text = await response.text().catch(() => "");
  return { message: String(text || "").trim() || fallback };
};

const readResponseMessage = async (response: Response, fallback: string) => {
  const payload = await readResponsePayload(response, fallback);
  return payload.message || fallback;
};

export function SignInForm({
  forcedNextPath,
  contextMessage = null,
  buildNumber = null,
  versionLabel = null,
}: SignInFormProps) {
  const router = useRouter();
  const search = useSearchParams();

  const searchNextPath = useMemo(() => {
    const raw = String(search?.get("next") || "").trim();
    return isSafeInternalPath(raw) ? raw : "";
  }, [search]);

  const resolvedFallbackPath = useMemo(() => {
    if (forcedNextPath && isSafeInternalPath(forcedNextPath)) {
      return forcedNextPath;
    }

    if (searchNextPath) {
      return searchNextPath;
    }

    if (typeof window !== "undefined") {
      const currentPath = `${window.location.pathname || ""}${window.location.search || ""}`.trim();
      if (currentPath.startsWith("/") && !currentPath.startsWith("/sign-in")) {
        return currentPath;
      }
    }

    return "/users";
  }, [forcedNextPath, searchNextPath]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [stayLoggedIn, setStayLoggedIn] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [authStatus, setAuthStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [languagePreference, setLanguagePreference] = useState<string>("system");

  const copy = useMemo(() => {
    return signInCopy[resolveLanguagePreference(languagePreference) as keyof typeof signInCopy] ?? signInCopy["en-US"];
  }, [languagePreference]);

  useEffect(() => {
    setIsMounted(true);

    if (!CLIENT_PERSISTENCE_DISABLED) {
      try {
        const storedLanguage = window.localStorage.getItem(SIGN_IN_LANGUAGE_STORAGE_KEY);
        if (storedLanguage && languageOptions.some((option) => option.value === storedLanguage)) {
          setLanguagePreference(storedLanguage);
        }
      } catch {
        // ignore local storage failures
      }
    }

    let cancelled = false;

    void fetch(`/api/auth/session?diagnostics=1&_t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
        Pragma: "no-cache",
      },
    })
      .then(async (response) => {
        if (cancelled) {
          return;
        }

        if (response.ok) {
          setAuthStatus(null);
          return;
        }

        const payload = await readResponsePayload(response, "Session validation failed. Please sign in again.");
        if (payload.code === "no-session-cookie") {
          setAuthStatus(null);
          return;
        }

        setAuthStatus(payload.message || "Session validation failed. Please sign in again.");
      })
      .catch(() => {
        if (!cancelled) {
          setAuthStatus("Session validation could not be completed. Please sign in again.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (CLIENT_PERSISTENCE_DISABLED) {
      return;
    }

    try {
      window.localStorage.setItem(SIGN_IN_LANGUAGE_STORAGE_KEY, languagePreference);
    } catch {
      // ignore local storage failures
    }
  }, [languagePreference]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setAuthStatus(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, stayLoggedIn }),
      });

      if (!response.ok) {
        setError(await readResponseMessage(response, "Invalid credentials"));
        return;
      }

      const payload = (await response.json().catch(() => null)) as
        | { redirectTo?: string }
        | null;
      const redirectTo =
        payload?.redirectTo && isSafeInternalPath(payload.redirectTo)
          ? payload.redirectTo
          : resolvedFallbackPath;

      const sessionResponse = await fetch(`/api/auth/session?diagnostics=1&_t=${Date.now()}`, {
        method: "GET",
        cache: "no-store",
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          Pragma: "no-cache",
        },
      });

      if (!sessionResponse.ok) {
        setError(await readResponseMessage(sessionResponse, "Session validation failed after sign-in."));
        return;
      }

      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError("Unable to sign in right now.");
    } finally {
      setLoading(false);
    }
  };

  return (
      <div className="relative w-full max-w-xl perspective-[1800px] text-white">
          <form
            onSubmit={onSubmit}
            suppressHydrationWarning
            className="relative mx-auto w-full rounded-4xl border border-white/12 bg-[linear-gradient(180deg,rgba(36,40,51,0.94),rgba(18,20,28,0.98))] p-6 shadow-[0_40px_100px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_-1px_0_rgba(255,255,255,0.04)] backdrop-blur-2xl lg:p-8"
          >
            <div className="absolute inset-x-6 top-0 h-px bg-linear-to-r from-transparent via-cyan-300/50 to-transparent" />

            <div className="relative space-y-5">
              <div className="flex justify-center">
                <Image
                  src="/in-accord-steampunk-logo.png"
                  alt="In-Accord"
                  width={432}
                  height={216}
                  className="h-auto w-72 rounded-2xl border border-white/10 shadow-[0_20px_44px_rgba(0,0,0,0.35)]"
                  suppressHydrationWarning
                  priority
                />
              </div>

              <div className="space-y-4 text-center">
                <div className="flex justify-center">
                  <div className="inline-flex items-center rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-cyan-100 shadow-[0_10px_30px_rgba(6,182,212,0.2)]">
                    Secure access
                  </div>
                </div>
                <div>
                  <h1 className="mt-4 text-3xl font-black tracking-tight text-white drop-shadow-[0_10px_24px_rgba(0,0,0,0.45)]">
                    {copy.title}
                  </h1>
                </div>

                <label className="mx-auto flex w-full max-w-56 flex-col gap-1 text-left text-xs text-zinc-300">
                  <span className="text-center">{copy.language}</span>
                  <select
                    value={languagePreference}
                    onChange={(event) => setLanguagePreference(event.target.value)}
                    className="rounded-xl border border-white/10 bg-[#16181f] px-3 py-2 text-xs text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_12px_28px_rgba(0,0,0,0.22)] outline-none"
                  >
                    {languageOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              {contextMessage ? (
                <div className="rounded-2xl border border-sky-500/35 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 shadow-[0_18px_40px_rgba(14,165,233,0.15)]">
                  {contextMessage}
                </div>
              ) : null}
              {authStatus ? (
                <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 shadow-[0_18px_40px_rgba(245,158,11,0.12)]">
                  {authStatus}
                </div>
              ) : null}

              <div className="space-y-4">
                <div className="rounded-[1.4rem] border border-white/10 bg-[#14161c] p-1 shadow-[0_24px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <input
                    className="w-full rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,#1b1e26,#12141a)] px-4 py-3.5 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)] outline-none placeholder:text-zinc-500"
                    placeholder={copy.email}
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="relative rounded-[1.4rem] border border-white/10 bg-[#14161c] p-1 shadow-[0_24px_48px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.04)]">
                  <input
                    className="w-full rounded-[1.1rem] border border-white/8 bg-[linear-gradient(180deg,#1b1e26,#12141a)] px-4 py-3.5 pr-12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.06),inset_0_-1px_0_rgba(0,0,0,0.25)] outline-none placeholder:text-zinc-500"
                    placeholder={copy.password}
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((current) => !current)}
                    className="absolute inset-y-0 right-2 inline-flex w-10 items-center justify-center rounded-xl text-zinc-300 transition hover:bg-white/5 hover:text-white"
                    aria-label={showPassword ? copy.hidePassword : copy.showPassword}
                    title={showPassword ? copy.hidePassword : copy.showPassword}
                  >
                    {isMounted ? (showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />) : null}
                  </button>
                </div>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-white/10 bg-white/4 px-4 py-3 text-sm text-zinc-200 shadow-[0_16px_34px_rgba(0,0,0,0.22)]">
                <input
                  type="checkbox"
                  checked={stayLoggedIn}
                  onChange={(event) => setStayLoggedIn(event.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-white/20 bg-transparent"
                />
                <span>
                  <span className="block font-semibold text-white">Stay logged in</span>
                  <span className="mt-1 block text-xs text-zinc-400">
                    Keep this device signed in for up to 5 days so refreshes and reopen cycles do not force your credentials again.
                  </span>
                </span>
              </label>

              {error ? <p className="text-sm text-rose-400">{error}</p> : null}

              <button
                disabled={loading}
                className="group relative w-full overflow-hidden rounded-[1.35rem] border border-emerald-300/30 bg-[linear-gradient(180deg,#34d399,#059669)] px-4 py-3.5 font-semibold text-white shadow-[0_24px_44px_rgba(5,150,105,0.35),inset_0_1px_0_rgba(255,255,255,0.25),inset_0_-2px_0_rgba(0,0,0,0.18)] transition hover:-translate-y-0.5 hover:brightness-110 disabled:opacity-60"
              >
                <span className="absolute inset-x-6 top-0 h-px bg-white/60" />
                <span className="relative">{loading ? copy.signingIn : copy.signIn}</span>
              </button>

              <div className="flex items-center justify-between gap-4 border-t border-white/8 pt-2 text-xs text-zinc-300">
                <p>
                  {copy.needAccount} <Link href="/sign-up" className="font-semibold text-cyan-300 underline underline-offset-4">{copy.signUp}</Link>
                </p>
                <span className="text-zinc-500">Refresh-safe auth enabled</span>
              </div>

              {(versionLabel || buildNumber) ? (
                <p className="pt-1 text-center text-[11px] uppercase tracking-[0.16em] text-zinc-500">
                  {versionLabel ? `Version ${versionLabel}` : "Version Live"}
                  {buildNumber ? ` • Build #${buildNumber}` : ""}
                </p>
              ) : null}
            </div>
          </form>
      </div>
  );
}
