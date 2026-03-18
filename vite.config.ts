import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const turnstileSecret = env.TURNSTILE_SECRET_KEY || process.env.TURNSTILE_SECRET_KEY || "";
  const allowedTurnstileHostnames = new Set([
    "localhost",
    "localhost:6722",
    "hvoy.ai",
    "www.hvoy.ai",
  ]);
  return {
    server: {
      host: "::",
      port: 8080,
      hmr: {
        overlay: false,
      },
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
      mode === "development" && {
        name: "probe-relay",
        configureServer(server) {
          server.middlewares.use("/__turnstile/verify", (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
              return;
            }
            if (!turnstileSecret) {
              res.statusCode = 500;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: "missing_turnstile_secret" }));
              return;
            }

            let raw = "";
            req.on("data", (chunk) => {
              raw += chunk.toString();
            });
            req.on("end", async () => {
              try {
                const parsed = JSON.parse(raw || "{}");
                const token = typeof parsed.token === "string" ? parsed.token : "";
                if (!token) {
                  res.statusCode = 400;
                  res.setHeader("Content-Type", "application/json");
                  res.end(JSON.stringify({ ok: false, success: false, error: "missing_token" }));
                  return;
                }

                const remoteIpHeader = req.headers["x-forwarded-for"];
                const remoteIp =
                  typeof remoteIpHeader === "string"
                    ? remoteIpHeader.split(",")[0]?.trim() || ""
                    : "";

                const body = new URLSearchParams();
                body.set("secret", turnstileSecret);
                body.set("response", token);
                if (remoteIp) {
                  body.set("remoteip", remoteIp);
                }

                const cfResp = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
                  method: "POST",
                  headers: { "content-type": "application/x-www-form-urlencoded" },
                  body: body.toString(),
                });
                const cfData = await cfResp.json();

                const verifiedHostname =
                  cfData && typeof cfData.hostname === "string"
                    ? String(cfData.hostname).toLowerCase()
                    : "";
                const hostnameAllowed =
                  verifiedHostname !== "" && allowedTurnstileHostnames.has(verifiedHostname);
                if (cfData && typeof cfData === "object" && cfData.success === true && !hostnameAllowed) {
                  cfData.success = false;
                  cfData["error-codes"] = [
                    ...(Array.isArray(cfData["error-codes"]) ? cfData["error-codes"] : []),
                    "invalid-hostname",
                  ];
                }

                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(JSON.stringify({ ok: true, ...cfData }));
              } catch (error) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    ok: false,
                    success: false,
                    error: error instanceof Error ? error.message : "verify_failed",
                  })
                );
              }
            });
          });

          server.middlewares.use("/__probe", (req, res) => {
            if (req.method !== "POST") {
              res.statusCode = 405;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ ok: false, error: "method_not_allowed" }));
              return;
            }

            let raw = "";
            req.on("data", (chunk) => {
              raw += chunk.toString();
            });

            req.on("end", async () => {
              const logPath = null;
              try {
                const parsed = JSON.parse(raw || "{}");
                const endpoint = typeof parsed.endpoint === "string" ? parsed.endpoint : "";
                const method = typeof parsed.method === "string" ? parsed.method : "POST";
                const headers = parsed.headers && typeof parsed.headers === "object" ? parsed.headers : {};
                const body = parsed.body ?? {};
                const stage = typeof parsed.stage === "string" ? parsed.stage : "unknown";
                const mode =
                  parsed.mode === "openai" || parsed.mode === "anthropic"
                    ? parsed.mode
                    : String(endpoint).toLowerCase().includes("/v1/chat/completions")
                      ? "openai"
                      : "anthropic";
                const anthropicStream =
                  mode === "anthropic" &&
                  body &&
                  typeof body === "object" &&
                  (body as Record<string, unknown>).stream === true;

                const started = Date.now();
                const upstream = await fetch(endpoint, {
                  method,
                  headers: headers as Record<string, string>,
                  body: JSON.stringify(body),
                });
                const firstChunkStartedAt = Date.now();
                let firstChunkLatencyMs: number | null = null;
                let bodyText = "";
                let signatureDeltaTotalLength = 0;
                let signatureDeltaCount = 0;
                let sseEventTypes: string[] = [];
                let sseContentTypes: string[] = [];
                let parsedSseLines = 0;
                let upstreamUsage: Record<string, unknown> = {};

                if (anthropicStream && upstream.body) {
                  const reader = upstream.body.getReader();
                  const decoder = new TextDecoder();
                  let buffer = "";
                  let rawSse = "";
                  let aggregatedText = "";
                  let modelName: string | null = null;
                  let stopReason: string | null = null;
                  const contentTypesSet = new Set<string>();
                  const eventTypes: string[] = [];
                  const usage: Record<string, number> = {};

                  const mergeUsage = (u: unknown) => {
                    if (!u || typeof u !== "object") return;
                    const obj = u as Record<string, unknown>;
                    for (const key of [
                      "input_tokens",
                      "output_tokens",
                      "cache_read_input_tokens",
                      "cache_creation_input_tokens",
                      "total_tokens",
                      "prompt_tokens",
                      "completion_tokens",
                    ]) {
                      const v = obj[key];
                      if (typeof v === "number") {
                        usage[key] = v;
                      }
                    }
                  };

                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (firstChunkLatencyMs === null) {
                      firstChunkLatencyMs = Date.now() - firstChunkStartedAt;
                    }
                    if (!value) continue;

                    const chunkText = decoder.decode(value, { stream: true });
                    rawSse += chunkText;
                    buffer += chunkText;

                    while (buffer.includes("\n")) {
                      const idx = buffer.indexOf("\n");
                      const line = buffer.slice(0, idx).trim();
                      buffer = buffer.slice(idx + 1);
                      if (!line.startsWith("data:")) continue;

                      const data = line.slice(5).trim();
                      if (!data || data === "[DONE]") continue;
                      parsedSseLines += 1;

                      let event: Record<string, unknown> | null = null;
                      try {
                        event = JSON.parse(data) as Record<string, unknown>;
                      } catch {
                        continue;
                      }
                      if (!event) continue;

                      const eventType = typeof event.type === "string" ? event.type : "";
                      if (eventType) {
                        eventTypes.push(eventType);
                      }

                      if (eventType === "message_start") {
                        const message = event.message as Record<string, unknown> | undefined;
                        if (message && typeof message.model === "string") {
                          modelName = message.model;
                        }
                        mergeUsage(message?.usage);
                      } else if (eventType === "content_block_start") {
                        const block = event.content_block as Record<string, unknown> | undefined;
                        if (block && typeof block.type === "string") {
                          contentTypesSet.add(block.type);
                        }
                      } else if (eventType === "content_block_delta") {
                        const delta = event.delta as Record<string, unknown> | undefined;
                        const deltaType = delta && typeof delta.type === "string" ? delta.type : "";
                        if (deltaType === "text_delta") {
                          const t = delta?.text;
                          if (typeof t === "string") {
                            aggregatedText += t;
                          }
                        } else if (deltaType === "signature_delta") {
                          const sig = delta?.signature;
                          if (typeof sig === "string") {
                            signatureDeltaTotalLength += sig.length;
                            signatureDeltaCount += 1;
                          }
                        } else if (deltaType === "thinking_delta") {
                          contentTypesSet.add("thinking");
                        }
                      } else if (eventType === "message_delta") {
                        mergeUsage(event.usage);
                        const delta = event.delta as Record<string, unknown> | undefined;
                        if (delta && typeof delta.stop_reason === "string") {
                          stopReason = delta.stop_reason;
                        }
                      }
                    }
                  }
                  buffer += decoder.decode();

                  if (parsedSseLines === 0) {
                    bodyText = rawSse;
                    try {
                      const fallback = JSON.parse(bodyText) as Record<string, unknown>;
                      const maybeUsage = fallback?.usage;
                      if (maybeUsage && typeof maybeUsage === "object") {
                        upstreamUsage = maybeUsage as Record<string, unknown>;
                      }
                    } catch {
                      upstreamUsage = {};
                    }
                  } else {
                    sseEventTypes = eventTypes;
                    sseContentTypes = [...contentTypesSet];
                    upstreamUsage = usage;
                    bodyText = JSON.stringify({
                      model: modelName || null,
                      role: "assistant",
                      content: [{ type: "text", text: aggregatedText }],
                      stop_reason: stopReason,
                      usage,
                      _sse_meta: {
                        event_types: eventTypes,
                        content_types: [...contentTypesSet],
                        signature_delta_total_length: signatureDeltaTotalLength,
                        signature_delta_count: signatureDeltaCount,
                      },
                    });
                  }
                } else if (upstream.body) {
                  const reader = upstream.body.getReader();
                  const decoder = new TextDecoder();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    if (firstChunkLatencyMs === null) {
                      firstChunkLatencyMs = Date.now() - firstChunkStartedAt;
                    }
                    if (value) {
                      bodyText += decoder.decode(value, { stream: true });
                    }
                  }
                  bodyText += decoder.decode();
                } else {
                  bodyText = await upstream.text();
                }

                const latencyMs = Date.now() - started;
                const respHeaders = Object.fromEntries(upstream.headers.entries());

                let usage: Record<string, unknown> = {};
                if (Object.keys(upstreamUsage).length > 0) {
                  usage = upstreamUsage;
                } else {
                  try {
                    const parsedBody = JSON.parse(bodyText);
                    if (parsedBody && typeof parsedBody === "object") {
                      const maybeUsage = (parsedBody as { usage?: unknown }).usage;
                      if (maybeUsage && typeof maybeUsage === "object") {
                        usage = maybeUsage as Record<string, unknown>;
                      }
                    }
                  } catch {
                    usage = {};
                  }
                }

                const cacheRead =
                  typeof usage.cache_read_input_tokens === "number"
                    ? usage.cache_read_input_tokens
                    : 0;
                const cacheCreation =
                  typeof usage.cache_creation_input_tokens === "number"
                    ? usage.cache_creation_input_tokens
                    : 0;
                const cacheHit =
                  cacheRead > 0 ||
                  String(respHeaders["x-cache"] || "")
                    .toLowerCase()
                    .includes("hit");

                res.statusCode = 200;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    ok: true,
                    logPath,
                    latencyMs,
                    firstChunkLatencyMs,
                    status: upstream.status,
                    usage,
                    cacheHit,
                    cacheReadInputTokens: cacheRead,
                    cacheCreationInputTokens: cacheCreation,
                    signatureDeltaTotalLength,
                    signatureDeltaCount,
                    sseEventTypes,
                    sseContentTypes,
                    bodyText,
                  })
                );
              } catch (error) {
                res.statusCode = 500;
                res.setHeader("Content-Type", "application/json");
                res.end(
                  JSON.stringify({
                    ok: false,
                    logPath,
                    error: error instanceof Error ? error.message : "write_failed",
                  })
                );
              }
            });
          });
        },
      },
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});
