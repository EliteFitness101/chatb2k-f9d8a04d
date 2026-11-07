import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const MASTER_TOKEN = Deno.env.get("CHATB2K_MASTER_TOKEN") ?? "";
const WEBHOOK_SECRET = Deno.env.get("TELEGRAM_MASTER_WEBHOOK_SECRET") ?? "";
const SERVICE_KEY = (() => {
  try {
    const parsed = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}");
    if (typeof parsed.default === "string") return parsed.default;
  } catch {}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
})();
const db = SUPABASE_URL && SERVICE_KEY
  ? createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } })
  : null;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

function constantTimeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
async function telegram(method: string, payload: Record<string, unknown>, token = MASTER_TOKEN) {
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");
  const r = await fetch("https://api.telegram.org/bot" + token + "/" + method, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data?.ok !== true) throw new Error("TELEGRAM_" + method.toUpperCase() + "_FAILED");
  return data.result;
}
async function callAssistant(message: string, conversationId: string): Promise<string> {
  const token = Deno.env.get("CHATB2K_INTERNAL_TOKEN") ?? "";
  if (!token) throw new Error("CHATB2K_INTERNAL_TOKEN_NOT_CONFIGURED");
  const response = await fetch(SUPABASE_URL + "/functions/v1/chatb2k-live-assistant", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-chatb2k-internal-token": token,
    },
    body: JSON.stringify({
      message: message.slice(0, 2000),
      channel: "telegram",
      conversation_id: conversationId,
      persona: "coach-b2k",
    }),
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.ok || typeof data?.reply !== "string" || !data.reply.trim()) {
    throw new Error("CHATB2K_ASSISTANT_REQUEST_FAILED");
  }
  return data.reply.trim().slice(0, 3800);
}

async function handleManagedBot(update: Record<string, unknown>) {
  const managed = update.managed_bot as Record<string, unknown> | undefined;
  const bot = managed?.bot as Record<string, unknown> | undefined;
  const owner = managed?.user as Record<string, unknown> | undefined;
  if (!bot || !Number.isSafeInteger(Number(bot.id))) throw new Error("MANAGED_BOT_PAYLOAD_INVALID");
  const botId = Number(bot.id);
  const ownerId = Number(owner?.id ?? 0) || null;
  const username = typeof bot.username === "string" ? bot.username.replace(/^@/, "") : null;
  const token = await telegram("getManagedBotToken", { user_id: botId });
  if (typeof token !== "string" || token.length < 20) throw new Error("MANAGED_BOT_TOKEN_NOT_RETURNED");
  const me = await telegram("getMe", {}, token);
  if (Number(me?.id) !== botId || (username && String(me?.username ?? "").toLowerCase() !== username.toLowerCase())) {
    throw new Error("MANAGED_BOT_IDENTITY_MISMATCH");
  }
  const secretName = "telegram_managed_bot_" + botId + "_token";
  const webhookSecretName = "telegram_managed_bot_" + botId + "_webhook_secret";
  const { data: existingToken, error: existingTokenError } = await db!.rpc("chatb2k_get_runtime_secret", { p_name: secretName });
  if (existingTokenError) throw new Error("EXISTING_CHILD_TOKEN_LOOKUP_FAILED");
  if (typeof existingToken === "string" && existingToken !== token) throw new Error("CHILD_TOKEN_ROTATION_REQUIRES_RECONCILIATION");
  if (typeof existingToken !== "string") {
    const { data: secretId, error: vaultError } = await db!.rpc("chatb2k_store_runtime_secret", {
      p_name: secretName,
      p_secret: token,
      p_description: "Managed Telegram bot credential; bot_id=" + botId,
    });
    if (vaultError || !secretId) throw new Error("VAULT_SECRET_WRITE_FAILED");
  }
  const { data: existingWebhookSecret, error: existingWebhookSecretError } = await db!.rpc("chatb2k_get_runtime_secret", { p_name: webhookSecretName });
  if (existingWebhookSecretError) throw new Error("EXISTING_CHILD_WEBHOOK_SECRET_LOOKUP_FAILED");
  const childWebhookSecret = typeof existingWebhookSecret === "string"
    ? existingWebhookSecret
    : crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "");
  if (typeof existingWebhookSecret !== "string") {
    const { data: webhookSecretId, error: webhookVaultError } = await db!.rpc("chatb2k_store_runtime_secret", {
      p_name: webhookSecretName,
      p_secret: childWebhookSecret,
      p_description: "Managed Telegram child webhook secret; bot_id=" + botId,
    });
    if (webhookVaultError || !webhookSecretId) throw new Error("CHILD_WEBHOOK_SECRET_WRITE_FAILED");
  }
  const { data: registryRow, error: registryError } = await db!.from("client_bot_registry").upsert({
    bot_id: botId,
    bot_username: username,
    client_name: String(bot.first_name ?? username ?? ("Telegram client " + botId)).slice(0, 120),
    owner_telegram_id: ownerId,
    bot_token_secret_ref: secretName,
    webhook_secret_ref: webhookSecretName,
    lifecycle_status: "vault_stored",
    managed_by_master: true,
    metadata: { telegram_managed_bot: true, telegram_bot_id: botId, vault_secret_id: secretId },
    updated_at: new Date().toISOString(),
    last_verified_at: new Date().toISOString(),
  }, { onConflict: "bot_id" }).select("id").single();
  if (registryError || !registryRow) throw new Error("CLIENT_REGISTRY_WRITE_FAILED");
  const { error: jobError } = await db!.from("client_bot_provisioning_jobs").upsert({
    idempotency_key: "telegram-managed-bot:" + botId,
    requested_by_telegram_id: ownerId,
    client_name: String(bot.first_name ?? username ?? ("Telegram client " + botId)).slice(0, 120),
    proposed_bot_username: username,
    managed_bot_id: botId,
    status: "vault_stored",
    bot_registry_id: registryRow.id,
    metadata: { source: "telegram_managed_bot_update", owner_telegram_id: ownerId, vault_secret_ref: secretName },
    updated_at: new Date().toISOString(),
  }, { onConflict: "idempotency_key" });
  if (jobError) throw new Error("PROVISIONING_JOB_WRITE_FAILED");
  try {
    const childWebhookUrl = SUPABASE_URL + "/functions/v1/telegram-master-webhook?managed_bot_id=" + botId;
    await telegram("setWebhook", {
      url: childWebhookUrl,
      secret_token: childWebhookSecret,
      allowed_updates: ["message", "callback_query"],
      drop_pending_updates: false,
      max_connections: 20
    }, token);
    const webhookRegisteredAt = new Date().toISOString();
    const { error: registryWebhookError } = await db!.from("client_bot_registry").update({
      lifecycle_status: "webhook_registered", updated_at: webhookRegisteredAt
    }).eq("bot_id", botId);
    const { error: jobWebhookError } = await db!.from("client_bot_provisioning_jobs").update({
      status: "webhook_registered", updated_at: webhookRegisteredAt
    }).eq("idempotency_key", "telegram-managed-bot:" + botId);
    if (registryWebhookError || jobWebhookError) throw new Error("CHILD_WEBHOOK_STATE_WRITE_FAILED");
    const childWebhookInfo = await telegram("getWebhookInfo", {}, token);
    if (String(childWebhookInfo?.url ?? "") !== childWebhookUrl) {
      throw new Error("CHILD_WEBHOOK_VERIFICATION_FAILED");
    }
    const configuredAt = new Date().toISOString();
    const { error: registryConfiguredError } = await db!.from("client_bot_registry").update({
      lifecycle_status: "configured", updated_at: configuredAt
    }).eq("bot_id", botId);
    const { error: jobConfiguredError } = await db!.from("client_bot_provisioning_jobs").update({
      status: "configured", updated_at: configuredAt
    }).eq("idempotency_key", "telegram-managed-bot:" + botId);
    if (registryConfiguredError || jobConfiguredError) throw new Error("CHILD_CONFIGURED_STATE_WRITE_FAILED");
    const now = new Date().toISOString();
    const { error: registryActivationError } = await db!.from("client_bot_registry").update({
      lifecycle_status: "active",
      webhook_secret_ref: webhookSecretName,
      last_verified_at: now,
      updated_at: now
    }).eq("bot_id", botId);
    if (registryActivationError) throw new Error("CHILD_REGISTRY_ACTIVATION_FAILED");
    const { error: jobActivationError } = await db!.from("client_bot_provisioning_jobs").update({
      status: "active",
      completed_at: now,
      updated_at: now,
      error_code: null
    }).eq("idempotency_key", "telegram-managed-bot:" + botId);
    if (jobActivationError) throw new Error("CHILD_JOB_ACTIVATION_FAILED");
  } catch (provisionError) {
    const safeCode = String(provisionError).replace(/[^A-Z0-9_]/gi, "_").slice(0, 120);
    const now = new Date().toISOString();
    await db!.from("client_bot_registry").update({ lifecycle_status: "error", updated_at: now }).eq("bot_id", botId);
    await db!.from("client_bot_provisioning_jobs").update({ status: "failed", error_code: safeCode, updated_at: now }).eq("idempotency_key", "telegram-managed-bot:" + botId);
    throw new Error(safeCode);
  }
  if (ownerId) {
    await telegram("sendMessage", {
      chat_id: ownerId,
      text: "Your managed bot has been securely registered, its webhook verified, and it is now active.",
    }).catch(() => null);
  }
  return { bot_id: botId, username, registry_id: registryRow.id, status: "active" };
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.pathname.endsWith("/admin/register") && req.method === "POST") {
    const auth = req.headers.get("authorization") ?? "";
    const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!MASTER_TOKEN || !constantTimeEqual(supplied, MASTER_TOKEN)) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
    if (!WEBHOOK_SECRET || !db) return json({ ok: false, error: "MASTER_WEBHOOK_NOT_CONFIGURED" }, 503);
    if (!/^[A-Za-z0-9_-]{1,256}$/.test(WEBHOOK_SECRET)) return json({ ok: false, error: "WEBHOOK_SECRET_FORMAT_INVALID" }, 500);
    const webhookUrl = SUPABASE_URL + "/functions/v1/telegram-master-webhook";
    try {
      const result = await telegram("setWebhook", {
        url: webhookUrl,
        secret_token: WEBHOOK_SECRET,
        allowed_updates: ["message", "callback_query", "managed_bot"],
        drop_pending_updates: false,
        max_connections: 40
      });
      const info = await telegram("getWebhookInfo", {});
      return json({ ok: true, registered: result === true, webhook_url: webhookUrl, allowed_updates: info?.allowed_updates ?? [], pending_update_count: info?.pending_update_count ?? null, has_custom_certificate: info?.has_custom_certificate ?? false, last_error_date: info?.last_error_date ?? null, last_error_message: info?.last_error_message ?? null });
    } catch (_error) {
      return json({ ok: false, error: "TELEGRAM_WEBHOOK_REGISTRATION_FAILED" }, 502);
    }
  }
  if (url.pathname.endsWith("/admin/status") && req.method === "GET") {
    const auth = req.headers.get("authorization") ?? "";
    const supplied = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!MASTER_TOKEN || !constantTimeEqual(supplied, MASTER_TOKEN)) return json({ ok: false, error: "UNAUTHORIZED" }, 401);
    try {
      const info = await telegram("getWebhookInfo", {});
      return json({ ok: true, webhook_url: info?.url ?? "", has_custom_certificate: info?.has_custom_certificate ?? false, pending_update_count: info?.pending_update_count ?? null, allowed_updates: info?.allowed_updates ?? [], last_error_date: info?.last_error_date ?? null, last_error_message: info?.last_error_message ?? null });
    } catch (_error) {
      return json({ ok: false, error: "TELEGRAM_WEBHOOK_STATUS_FAILED" }, 502);
    }
  }
  if (req.method !== "POST") return json({ ok: false, error: "POST_REQUIRED" }, 405);
  if (!db) return json({ ok: false, error: "DATABASE_NOT_CONFIGURED" }, 503);
  const childBotIdParam = url.searchParams.get("managed_bot_id");
  if (childBotIdParam !== null) {
    if (!/^[0-9]{1,20}$/.test(childBotIdParam)) return json({ ok: false, error: "INVALID_MANAGED_BOT_ID" }, 400);
    const childBotId = Number(childBotIdParam);
    const { data: child, error: childLookupError } = await db.from("client_bot_registry")
      .select("bot_id, bot_token_secret_ref, webhook_secret_ref, lifecycle_status")
      .eq("bot_id", childBotId).eq("managed_by_master", true).maybeSingle();
    if (childLookupError || !child || child.lifecycle_status !== "active" || !child.bot_token_secret_ref || !child.webhook_secret_ref) {
      return json({ ok: false, error: "MANAGED_BOT_NOT_ACTIVE" }, 404);
    }
    const [{ data: childToken, error: childTokenError }, { data: childSecret, error: childSecretError }] = await Promise.all([
      db.rpc("chatb2k_get_runtime_secret", { p_name: child.bot_token_secret_ref }),
      db.rpc("chatb2k_get_runtime_secret", { p_name: child.webhook_secret_ref })
    ]);
    if (childTokenError || childSecretError || typeof childToken !== "string" || typeof childSecret !== "string") {
      return json({ ok: false, error: "MANAGED_BOT_CREDENTIAL_LOOKUP_FAILED" }, 503);
    }
    const childReceived = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
    if (!constantTimeEqual(childReceived, childSecret)) return json({ ok: false, error: "INVALID_CHILD_WEBHOOK_SECRET" }, 401);
    const childUpdate = await req.json().catch(() => null);
    if (!childUpdate || !Number.isSafeInteger(Number(childUpdate.update_id))) return json({ ok: false, error: "INVALID_TELEGRAM_UPDATE" }, 400);
    const childUpdateId = Number(childUpdate.update_id);
    const childUpdateType = childUpdate.callback_query ? "callback_query" : childUpdate.message ? "message" : "other";
    const { error: childInsertError } = await db.from("telegram_child_webhook_updates").insert({
      bot_id: childBotId, update_id: childUpdateId, update_type: childUpdateType,
      payload: childUpdate, processing_status: "received"
    });
    if (childInsertError) {
      if (String(childInsertError.code) === "23505") return json({ ok: true, duplicate: true });
      return json({ ok: false, error: "CHILD_UPDATE_LEDGER_WRITE_FAILED" }, 500);
    }
    try {
      let childResult: unknown = null;
      if (childUpdate.message?.chat?.id && typeof childUpdate.message?.text === "string") {
        const chatId = Number(childUpdate.message.chat.id);
        const messageText = String(childUpdate.message.text).trim();
        const command = messageText.split(/\s+/)[0].split("@")[0];
        if (command === "/start" || command === "/help") {
          await telegram("sendMessage", {
            chat_id: chatId,
            text: "This client bot is connected to ChatB2K. Send a message to speak with the assistant.",
          }, childToken);
          childResult = { command, replied: true };
        } else if (!command.startsWith("/")) {
          const reply = await callAssistant(messageText, "child:" + childBotId + ":" + chatId);
          await telegram("sendMessage", {
            chat_id: chatId,
            text: reply,
            reply_to_message_id: Number(childUpdate.message.message_id) || undefined,
            disable_web_page_preview: true,
          }, childToken);
          childResult = { assistant_replied: true };
        }
      } else if (childUpdate.callback_query?.id) {
        await telegram("answerCallbackQuery", { callback_query_id: childUpdate.callback_query.id }, childToken);
        childResult = { callback_answered: true };
      }
      await db.from("telegram_child_webhook_updates").update({
        processing_status: "processed", processed_at: new Date().toISOString()
      }).eq("bot_id", childBotId).eq("update_id", childUpdateId);
      return json({ ok: true, bot_id: childBotId, update_id: childUpdateId, update_type: childUpdateType, result: childResult });
    } catch (childError) {
      const safeCode = String(childError).replace(/[^A-Z0-9_]/gi, "_").slice(0, 140);
      await db.from("telegram_child_webhook_updates").update({
        processing_status: "failed", error_code: safeCode
      }).eq("bot_id", childBotId).eq("update_id", childUpdateId);
      return json({ ok: false, error: "CHILD_UPDATE_PROCESSING_FAILED" }, 500);
    }
  }
  if (!WEBHOOK_SECRET || !MASTER_TOKEN) return json({ ok: false, error: "MASTER_WEBHOOK_NOT_CONFIGURED" }, 503);
  const received = req.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
  if (!constantTimeEqual(received, WEBHOOK_SECRET)) return json({ ok: false, error: "INVALID_WEBHOOK_SECRET" }, 401);
  const update = await req.json().catch(() => null);
  if (!update || !Number.isSafeInteger(Number(update.update_id))) return json({ ok: false, error: "INVALID_TELEGRAM_UPDATE" }, 400);
  const updateId = Number(update.update_id);
  const updateType = update.managed_bot ? "managed_bot" : update.callback_query ? "callback_query" : update.message ? "message" : "other";
  const { error: insertError } = await db.from("telegram_master_webhook_updates").insert({
    update_id: updateId, update_type: updateType, payload: update, processing_status: "received",
  });
  if (insertError) {
    if (String(insertError.code) === "23505") return json({ ok: true, duplicate: true });
    return json({ ok: false, error: "UPDATE_LEDGER_WRITE_FAILED" }, 500);
  }
  try {
    let result: unknown = null;
    if (update.managed_bot) {
      result = await handleManagedBot(update);
    } else if (update.message?.chat?.id && typeof update.message?.text === "string") {
      const chatId = Number(update.message.chat.id);
      const messageText = String(update.message.text).trim();
      const command = messageText.split(/\s+/)[0].split("@")[0];
      if (command === "/start" || command === "/help") {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Welcome to ChatB2K101 — your assistant and client onboarding hub. Send a message to speak with Coach B2K, or use /provision to onboard a client bot.",
          reply_markup: { inline_keyboard: [[{ text: "Launch ChatB2K Dashboard", web_app: { url: "https://chatb2k.resofit.fit/telegram" } }], [{ text: "Provision a client bot", callback_data: "provision_new" }]] },
        });
      } else if (command === "/provision") {
        await telegram("sendMessage", {
          chat_id: chatId,
          text: "Client bot onboarding is managed through Telegram's native managed-bot confirmation flow. Submit the client name and niche in the ChatB2K dashboard; token retrieval and registry provisioning begin only after Telegram confirms bot creation.",
          reply_markup: { inline_keyboard: [[{ text: "Open client provisioning", web_app: { url: "https://chatb2k.resofit.fit/telegram" } }]] },
        });
      } else if (!command.startsWith("/")) {
        const reply = await callAssistant(messageText, "master:" + chatId);
        await telegram("sendMessage", {
          chat_id: chatId,
          text: reply,
          reply_to_message_id: Number(update.message.message_id) || undefined,
          disable_web_page_preview: true,
        });
        result = { assistant_replied: true };
      }
    } else if (update.callback_query?.id) {
      const callback = update.callback_query;
      await telegram("answerCallbackQuery", { callback_query_id: callback.id, text: "Opening ChatB2K client provisioning." });
      const chatId = callback.message?.chat?.id;
      if (chatId && callback.data === "provision_new") {
        await telegram("sendMessage", { chat_id: Number(chatId), text: "Open the ChatB2K dashboard to register the client and begin the managed-bot confirmation flow: https://chatb2k.resofit.fit/telegram" });
      }
    }
    await db.from("telegram_master_webhook_updates").update({ processing_status: "processed", processed_at: new Date().toISOString() }).eq("update_id", updateId);
    return json({ ok: true, update_id: updateId, update_type: updateType, result });
  } catch (error) {
    await db.from("telegram_master_webhook_updates").update({ processing_status: "failed", error_code: String(error).slice(0, 160) }).eq("update_id", updateId);
    return json({ ok: false, error: "UPDATE_PROCESSING_FAILED" }, 500);
  }
});
