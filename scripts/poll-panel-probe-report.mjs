const endpoint = "http://127.0.0.1:3000/api/socket/panel-probe-report";
const timeoutMs = 90_000;
const startedAt = Date.now();
const expectedCount = 5;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

while (Date.now() - startedAt < timeoutMs) {
  const response = await fetch(endpoint, { cache: "no-store" });
  const payload = await response.json();
  console.log(JSON.stringify(payload, null, 2));

  const reports = payload?.reports ?? {};
  const roleEntries = Object.values(reports);
  const hasFreshReports =
    roleEntries.length >= expectedCount &&
    roleEntries.every((entry) => Number(entry?.receivedAt ?? 0) >= startedAt);

  if (payload?.ok && hasFreshReports) {
    process.exit(0);
  }

  await sleep(2000);
}

console.error(`Timed out waiting for meeting panel probe success from ${endpoint}`);
process.exit(1);