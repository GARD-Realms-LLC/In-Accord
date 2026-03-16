"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";

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

export function SignInForm({ forcedNextPath, contextMessage = null }: SignInFormProps) {
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

    try {
      const storedLanguage = window.localStorage.getItem(SIGN_IN_LANGUAGE_STORAGE_KEY);
      if (storedLanguage && languageOptions.some((option) => option.value === storedLanguage)) {
        setLanguagePreference(storedLanguage);
      }
    } catch {
      // ignore local storage failures
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
        body: JSON.stringify({ email, password }),
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
    <form onSubmit={onSubmit} suppressHydrationWarning className="w-full max-w-md space-y-4 rounded-xl border border-black/20 bg-[#232428] p-6 text-white">
      <div className="flex justify-center">
        <Image
          src="/in-accord-steampunk-logo.png"
          alt="In-Accord"
          width={432}
          height={216}
          className="h-54 w-108 rounded-lg"
          suppressHydrationWarning
          priority
        />
      </div>
      <div className="space-y-1">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-xl font-bold">{copy.title}</h1>
          <label className="flex min-w-37.5 flex-col gap-1 text-xs text-zinc-300">
            <span>{copy.language}</span>
            <select
              value={languagePreference}
              onChange={(event) => setLanguagePreference(event.target.value)}
              className="rounded-md border border-black/20 bg-[#1e1f22] px-2 py-1 text-xs text-white"
            >
              {languageOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {contextMessage ? (
        <div className="rounded-md border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm text-sky-100">
          {contextMessage}
        </div>
      ) : null}
      {authStatus ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          {authStatus}
        </div>
      ) : null}
      <input
        className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2"
        placeholder={copy.email}
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />
      <div className="relative">
        <input
          className="w-full rounded-md border border-black/20 bg-[#1e1f22] px-3 py-2 pr-10"
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
          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center text-zinc-300 transition hover:text-white"
          aria-label={showPassword ? copy.hidePassword : copy.showPassword}
          title={showPassword ? copy.hidePassword : copy.showPassword}
        >
          {isMounted ? (showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />) : null}
        </button>
      </div>
      {error ? <p className="text-sm text-rose-400">{error}</p> : null}
      <button disabled={loading} className="w-full rounded-md bg-emerald-600 px-3 py-2 font-semibold hover:bg-emerald-500 disabled:opacity-60">
        {loading ? copy.signingIn : copy.signIn}
      </button>
      <p className="text-xs text-zinc-300">
        {copy.needAccount} <Link href="/sign-up" className="underline">{copy.signUp}</Link>
      </p>
    </form>
  );
}
