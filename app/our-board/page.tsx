import { redirect } from "next/navigation";

type LegacySearchParams = {
  token?: string | string[];
};

export default async function LegacyOurBoardPage({
  searchParams,
}: {
  searchParams?: Promise<LegacySearchParams>;
}) {
  const resolvedSearchParams = await searchParams;
  const tokenParam = resolvedSearchParams?.token;
  const token = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const normalizedToken = String(token ?? "").trim();

  if (normalizedToken) {
    redirect(`/in-aboard?token=${encodeURIComponent(normalizedToken)}`);
  }

  redirect("/in-aboard");
}
