import "server-only";

type SchemaInitState = "ready" | Promise<void>;

declare global {
  // eslint-disable-next-line no-var
  var inAccordSchemaInitRegistry: Map<string, SchemaInitState> | undefined;
}

const getSchemaInitRegistry = () => {
  if (!globalThis.inAccordSchemaInitRegistry) {
    globalThis.inAccordSchemaInitRegistry = new Map<string, SchemaInitState>();
  }

  return globalThis.inAccordSchemaInitRegistry;
};

export const ensureSchemaInitialized = async (
  key: string,
  initialize: () => Promise<void>
) => {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) {
    throw new Error("Schema initialization key is required.");
  }

  const registry = getSchemaInitRegistry();
  const existing = registry.get(normalizedKey);

  if (existing === "ready") {
    return;
  }

  if (existing) {
    await existing;
    return;
  }

  const pending = (async () => {
    await initialize();
    registry.set(normalizedKey, "ready");
  })().catch((error) => {
    registry.delete(normalizedKey);
    throw error;
  });

  registry.set(normalizedKey, pending);
  await pending;
};