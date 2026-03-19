export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  void (async () => {
    try {
      const { ensureTemplateMeBotAutoStartOnBoot } = await import("@/lib/template-me-bot-autostart");
      await ensureTemplateMeBotAutoStartOnBoot();
    } catch (error) {
      console.error("[TEMPLATE_ME_AUTOSTART_REGISTER] Template Me auto-start failed without taking down site startup.", error);
    }
  })();
}