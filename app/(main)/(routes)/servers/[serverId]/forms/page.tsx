"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

type PromptItem = {
  id: string;
  question: string;
  options: string[];
  required: boolean;
  multiple: boolean;
};

type OnboardingConfig = {
  enabled: boolean;
  welcomeMessage: string;
  bannerPreset: string;
  bannerUrl: string;
  checklistChannelIds: string[];
  resourceChannelIds: string[];
  prompts: PromptItem[];
  updatedAt: string;
};

type ExistingSubmission = {
  id: string;
  reviewStatus?: "PENDING" | "APPROVED" | "REJECTED" | "NEEDS_REVIEW";
  reviewNote?: string;
  reviewedAt?: string | null;
  submittedAt: string;
  updatedAt: string;
  answers: Array<{
    promptId: string;
    values: string[];
  }>;
};

const BANNER_PRESETS: Record<string, string> = {
  aurora: "linear-gradient(135deg, #4f46e5 0%, #0ea5e9 45%, #22d3ee 100%)",
  sunset: "linear-gradient(135deg, #f97316 0%, #ef4444 45%, #ec4899 100%)",
  midnight: "linear-gradient(135deg, #0f172a 0%, #1e293b 45%, #334155 100%)",
  forest: "linear-gradient(135deg, #166534 0%, #15803d 45%, #22c55e 100%)",
};

const FormsPage = () => {
  const routeParams = useParams<{ serverId: string }>();
  const [serverId, setServerId] = useState<string>("");
  const [config, setConfig] = useState<OnboardingConfig | null>(null);
  const [submission, setSubmission] = useState<ExistingSubmission | null>(null);
  const [canManageForms, setCanManageForms] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const resolvedServerId = String(routeParams?.serverId ?? "").trim();
        if (!resolvedServerId) {
          throw new Error("Missing server ID.");
        }

        if (cancelled) {
          return;
        }

        setServerId(resolvedServerId);

        const response = await fetch(`/api/servers/${resolvedServerId}/forms`, {
          method: "GET",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
        });

        if (!response.ok) {
          throw new Error((await response.text()) || `Unable to load forms (${response.status})`);
        }

        const payload = (await response.json()) as {
          config?: OnboardingConfig;
          submission?: ExistingSubmission | null;
          canManageForms?: boolean;
        };

        if (cancelled) {
          return;
        }

        const nextConfig = payload.config ?? null;
        const nextSubmission = payload.submission ?? null;

        setConfig(nextConfig);
        setSubmission(nextSubmission);
        setCanManageForms(Boolean(payload.canManageForms));

        const nextAnswers: Record<string, string[]> = {};
        if (nextConfig?.prompts?.length) {
          for (const promptItem of nextConfig.prompts) {
            const existingAnswer = nextSubmission?.answers.find((answerItem) => answerItem.promptId === promptItem.id);
            nextAnswers[promptItem.id] = existingAnswer?.values ?? [];
          }
        }
        setAnswers(nextAnswers);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Could not load forms.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [routeParams?.serverId]);

  const isEnabled = Boolean(config?.enabled);
  const prompts = config?.prompts ?? [];

  const bannerStyle = useMemo(() => {
    if (config?.bannerUrl) {
      return undefined;
    }

    const fallback = BANNER_PRESETS[config?.bannerPreset ?? "aurora"] ?? BANNER_PRESETS.aurora;
    return { background: fallback };
  }, [config?.bannerPreset, config?.bannerUrl]);

  const onToggleAnswer = (prompt: PromptItem, option: string) => {
    setSuccess(null);
    setError(null);

    setAnswers((previous) => {
      const current = previous[prompt.id] ?? [];
      if (prompt.multiple) {
        const next = current.includes(option)
          ? current.filter((item) => item !== option)
          : [...current, option];
        return { ...previous, [prompt.id]: next };
      }

      return { ...previous, [prompt.id]: current.includes(option) ? [] : [option] };
    });
  };

  const onSubmit = async () => {
    if (!config || !serverId || isSaving) {
      return;
    }

    setError(null);
    setSuccess(null);

    for (const prompt of prompts) {
      const selected = answers[prompt.id] ?? [];
      if (prompt.required && selected.length === 0) {
        setError(`Please answer required question: ${prompt.question}`);
        return;
      }

      if (!prompt.multiple && selected.length > 1) {
        setError(`Only one option is allowed for: ${prompt.question}`);
        return;
      }
    }

    try {
      setIsSaving(true);

      const response = await fetch(`/api/servers/${serverId}/forms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          answers: prompts.map((prompt) => ({
            promptId: prompt.id,
            values: answers[prompt.id] ?? [],
          })),
        }),
      });

      if (!response.ok) {
        throw new Error((await response.text()) || `Unable to submit form (${response.status})`);
      }

      const payload = (await response.json()) as { submission?: ExistingSubmission };
      if (payload.submission) {
        setSubmission(payload.submission);
      }

      setSuccess(submission ? "Form updated successfully." : "Form submitted successfully.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to submit form.");
    } finally {
      setIsSaving(false);
    }
  };

  const onEnableForms = async () => {
    if (!serverId || isEnabling) {
      return;
    }

    try {
      setError(null);
      setSuccess(null);
      setIsEnabling(true);

      const response = await fetch(`/api/servers/${serverId}/onboarding`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: true }),
      });

      if (!response.ok) {
        throw new Error((await response.text()) || `Unable to enable forms (${response.status})`);
      }

      const payload = (await response.json()) as {
        config?: OnboardingConfig;
      };

      if (payload.config) {
        setConfig(payload.config);
      } else {
        setConfig((previous) =>
          previous
            ? {
                ...previous,
                enabled: true,
              }
            : previous
        );
      }

      setSuccess("Forms enabled. You can now submit responses.");
    } catch (enableError) {
      setError(enableError instanceof Error ? enableError.message : "Unable to enable forms.");
    } finally {
      setIsEnabling(false);
    }
  };

  return (
    <div className="theme-server-chat-surface flex h-full flex-col overflow-hidden rounded-3xl border border-border bg-background shadow-xl shadow-black/35">
      <div className="border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-black dark:text-white">Server Forms</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Discord-style onboarding form for member preferences and screening.
            </p>
          </div>
          {serverId ? (
            <Link
              href={`/servers/${serverId}`}
              className="inline-flex items-center rounded-md border border-zinc-300 px-2 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              Back to server
            </Link>
          ) : null}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading form...
          </div>
        ) : error ? (
          <p className="rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">{error}</p>
        ) : !config ? (
          <p className="text-sm text-zinc-500 dark:text-zinc-400">No form configuration found.</p>
        ) : !isEnabled ? (
          <div className="space-y-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-3 text-sm text-amber-200">
            <p>Forms are currently disabled by the server owner.</p>
            {canManageForms ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void onEnableForms()}
                  disabled={isEnabling}
                  className="rounded-md bg-amber-500/80 px-3 py-1.5 text-xs font-semibold text-zinc-950 transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isEnabling ? "Enabling..." : "Enable Forms"}
                </button>
                <span className="text-xs text-amber-100/90">Owner quick action</span>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative overflow-hidden rounded-xl border border-zinc-700 bg-[#1e1f22]">
              <div className="relative h-36 w-full">
                {config.bannerUrl ? (
                  <Image src={config.bannerUrl} alt="Forms banner" fill className="object-cover" unoptimized />
                ) : (
                  <div className="absolute inset-0" style={bannerStyle} />
                )}
                <div className="absolute inset-0 bg-black/35" />
              </div>
              <div className="space-y-1 p-4">
                <p className="text-lg font-semibold text-zinc-100">Server Intake Form</p>
                <p className="text-sm text-zinc-300">{config.welcomeMessage || "Tell us about yourself so we can tailor your experience."}</p>
                {submission ? (
                  <div className="space-y-1">
                    <p className="text-xs text-emerald-300">
                      Last submitted: {new Date(submission.updatedAt || submission.submittedAt).toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-300">
                      Review status: {submission.reviewStatus ?? "PENDING"}
                      {submission.reviewedAt
                        ? ` • Reviewed ${new Date(submission.reviewedAt).toLocaleString()}`
                        : ""}
                    </p>
                    {submission.reviewNote ? (
                      <p className="text-xs text-zinc-200">
                        Moderator note: {submission.reviewNote}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {prompts.length === 0 ? (
              <p className="rounded-md border border-zinc-700 bg-[#2B2D31] px-3 py-2 text-sm text-zinc-300">
                This server has no form questions yet.
              </p>
            ) : (
              prompts.map((prompt, index) => {
                const selected = answers[prompt.id] ?? [];
                return (
                  <section key={prompt.id} className="rounded-lg border border-zinc-700 bg-[#2B2D31] p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-zinc-100">
                        {index + 1}. {prompt.question}
                      </p>
                      <span className="rounded bg-black/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-zinc-300">
                        {prompt.multiple ? "Multi-select" : "Single-select"}
                        {prompt.required ? " • Required" : ""}
                      </span>
                    </div>

                    <div className="grid gap-2 sm:grid-cols-2">
                      {(prompt.options.length > 0 ? prompt.options : ["No options configured"]).map((option) => {
                        const isSelected = selected.includes(option);
                        return (
                          <button
                            key={`${prompt.id}-${option}`}
                            type="button"
                            onClick={() => onToggleAnswer(prompt, option)}
                            disabled={option === "No options configured"}
                            className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                              isSelected
                                ? "border-indigo-400 bg-indigo-500/20 text-indigo-100"
                                : "border-zinc-700 bg-[#1e1f22] text-zinc-300 hover:bg-[#282a30]"
                            }`}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                );
              })
            )}

            {success ? (
              <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
                {success}
              </p>
            ) : null}

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => void onSubmit()}
                disabled={isSaving || prompts.length === 0}
                className="rounded-md bg-[#5865f2] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#4752c4] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSaving ? "Submitting..." : submission ? "Update Form" : "Submit Form"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default FormsPage;
