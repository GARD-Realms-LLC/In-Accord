import { CloudflareHostLockPanel } from "@/components/auth/cloudflare-host-lock-panel";

type CloudflareRequiredPageProps = {
  searchParams?: Promise<{
    next?: string | string[];
  }>;
};

export default async function CloudflareRequiredPage({
  searchParams,
}: CloudflareRequiredPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const requestedNextValue = resolvedSearchParams?.next;
  const requestedNext = Array.isArray(requestedNextValue)
    ? requestedNextValue[0]
    : requestedNextValue;
  const normalizedNext = String(requestedNext ?? "").trim();
  const nextTarget = normalizedNext.startsWith("/") ? normalizedNext : "/";

  return <CloudflareHostLockPanel nextTarget={nextTarget} />;
}