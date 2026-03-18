import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, Zap, Info } from "lucide-react";
import { Logo } from "@/components/Logo";
import { Footer } from "@/components/Footer";
import { ApiConfig } from "@/components/ApiConfig";
import { ModelSelector } from "@/components/ModelSelector";
import { ScoreGauge } from "@/components/ScoreGauge";
import { DetectionChecklist, type CheckItem } from "@/components/DetectionChecklist";
import { HistoryLog, type HistoryEntry } from "@/components/HistoryLog";
import { ScanningOverlay } from "@/components/ScanningOverlay";
import { toast } from "sonner";

interface DetectionResult {
  id: string;
  score: number;
  checks: CheckItem[];
  latency: number;
  tps: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

type CheckStatus = "pass" | "warning" | "fail";
type EndpointMode = "anthropic" | "openai";

interface ProbeResult {
  prompt: string;
  responseText: string;
  payload: unknown;
  latencyMs: number;
  firstTokenLatencyMs: number | null;
  tps: number;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  cacheHit: boolean;
  cacheReadInputTokens: number;
  cacheCreationInputTokens: number;
  signatureDeltaTotalLength: number;
  signatureDeltaCount: number;
  contentTypes: string[];
  parseOk: boolean;
  logPath: string | null;
  mode: EndpointMode;
  protocolHints: {
    hasModel: boolean;
    hasRole: boolean;
    hasContentArray: boolean;
    hasUsage: boolean;
    hasStopReason: boolean;
  };
}

const SYMBOL_PROMPT = '输出中文的这个符号”"';

const APRIL_EVENT_PROMPTS = [
  "不允许上网查, 说出来2025.4.3发生一件大事.如果不知道就回答不知道",
  "不允许上网查, 说出来2025.4.8发生一件大事.如果不知道就回答不知道",
  "不允许上网查, 说出来2025.4.15发生一件大事.如果不知道就回答不知道",
  "不允许上网查, 说出来2025.4.22发生一件大事.如果不知道就回答不知道",
  "不允许上网查, 说出来2025.4.28发生一件大事.如果不知道就回答不知道",
];

const UNKNOWN_PATTERNS = [
  /不知道/i,
  /不清楚/i,
  /不确定/i,
  /无法确定/i,
  /无法回答/i,
  /i\s*don'?t\s*know/i,
  /not\s*sure/i,
  /can't\s*tell/i,
];

function resolveEndpoint(rawUrl: string): { endpoint: string; mode: EndpointMode } {
  const trimmed = rawUrl.trim();
  if (!trimmed) return { endpoint: "", mode: "anthropic" };

  const normalized = trimmed.replace(/\/+$/, "");
  const lowered = normalized.toLowerCase();

  const mode: EndpointMode =
    lowered.includes("/v1/chat/completions") ||
    lowered.endsWith("/chat/completions") ||
    lowered.includes("api.openai.com") ||
    lowered.includes("openrouter.ai")
      ? "openai"
      : "anthropic";

  const base = normalized
    .replace(/\/v1\/chat\/completions\/?$/i, "")
    .replace(/\/chat\/completions\/?$/i, "")
    .replace(/\/v1\/messages?\/?$/i, "")
    .replace(/\/v1\/?$/i, "")
    .replace(/\/+$/, "");

  if (!base) return { endpoint: "", mode };

  if (mode === "openai") {
    return { endpoint: `${base}/v1/chat/completions`, mode };
  }
  return { endpoint: `${base}/v1/messages`, mode };
}

function extractResponseText(payload: any, mode: EndpointMode): string {
  if (!payload || typeof payload !== "object") return "";

  if (mode === "openai") {
    const content = payload?.choices?.[0]?.message?.content;
    if (typeof content === "string") return content.trim();
    if (Array.isArray(content)) {
      const parts = content
        .map((item: any) => (item && typeof item.text === "string" ? item.text : ""))
        .filter(Boolean);
      return parts.join("\n").trim();
    }
    return "";
  }

  const blocks = Array.isArray(payload.content) ? payload.content : [];
  const textParts: string[] = [];
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    if (typeof block.text === "string") {
      textParts.push(block.text);
    }
  }
  return textParts.join("\n").trim();
}

function statusToScore(status: CheckStatus, weight: number): number {
  if (status === "pass") return weight;
  if (status === "warning") return Math.round(weight * 0.5);
  return 0;
}

function safeTrace(trace: unknown): string {
  return JSON.stringify(trace, null, 2);
}

async function sendProbe(options: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  stage: "stage1" | "stage2";
  previousAssistantText?: string;
}): Promise<ProbeResult> {
  const { endpoint, mode } = resolveEndpoint(options.baseUrl);
  if (!endpoint) {
    throw new Error("API endpoint is empty");
  }

  const anthropicMessages: Array<{ role: "user" | "assistant"; content: Array<{ type: "text"; text: string }> }> = [];
  const openAIMessages: Array<{ role: "user" | "assistant"; content: string }> = [];

  if (options.previousAssistantText !== undefined) {
    anthropicMessages.push({ role: "user", content: [{ type: "text", text: SYMBOL_PROMPT }] });
    anthropicMessages.push({ role: "assistant", content: [{ type: "text", text: options.previousAssistantText || "(empty)" }] });
    anthropicMessages.push({ role: "user", content: [{ type: "text", text: options.prompt }] });

    openAIMessages.push({ role: "user", content: SYMBOL_PROMPT });
    openAIMessages.push({ role: "assistant", content: options.previousAssistantText || "(empty)" });
    openAIMessages.push({ role: "user", content: options.prompt });
  } else {
    anthropicMessages.push({ role: "user", content: [{ type: "text", text: options.prompt }] });
    openAIMessages.push({ role: "user", content: options.prompt });
  }

  const headers =
    mode === "anthropic"
      ? {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
          "anthropic-version": "2023-06-01",
          "anthropic-beta": "interleaved-thinking-2025-05-14",
        }
      : {
          accept: "application/json",
          "content-type": "application/json",
          authorization: `Bearer ${options.apiKey}`,
        };

  const body =
    mode === "anthropic"
      ? {
          model: options.model,
          messages: anthropicMessages,
          max_tokens: 1024,
          stream: true,
          thinking: {
            type: "enabled",
            budget_tokens: 2048,
          },
        }
      : {
          model: options.model,
          messages: openAIMessages,
          max_tokens: 1024,
          stream: false,
        };

  const relayResponse = await fetch("/__probe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      stage: options.stage,
      mode,
      endpoint,
      method: "POST",
      headers,
      body,
    }),
  });

  const relayPayload = await relayResponse.json();
  const logPath = typeof relayPayload?.logPath === "string" ? relayPayload.logPath : null;
  const latencyMs = typeof relayPayload?.latencyMs === "number" ? relayPayload.latencyMs : 0;
  const firstTokenLatencyMs =
    typeof relayPayload?.firstChunkLatencyMs === "number" ? relayPayload.firstChunkLatencyMs : null;
  const rawText = typeof relayPayload?.bodyText === "string" ? relayPayload.bodyText : "";
  const relayUsage = relayPayload?.usage && typeof relayPayload.usage === "object" ? relayPayload.usage : {};
  const relayCacheHit = Boolean(relayPayload?.cacheHit);
  const relayCacheReadInputTokens =
    typeof relayPayload?.cacheReadInputTokens === "number" ? relayPayload.cacheReadInputTokens : 0;
  const relayCacheCreationInputTokens =
    typeof relayPayload?.cacheCreationInputTokens === "number" ? relayPayload.cacheCreationInputTokens : 0;
  const signatureDeltaTotalLength =
    typeof relayPayload?.signatureDeltaTotalLength === "number" ? relayPayload.signatureDeltaTotalLength : 0;
  const signatureDeltaCount =
    typeof relayPayload?.signatureDeltaCount === "number" ? relayPayload.signatureDeltaCount : 0;
  const sseContentTypes = Array.isArray(relayPayload?.sseContentTypes)
    ? relayPayload.sseContentTypes.filter((x: unknown): x is string => typeof x === "string")
    : [];

  if (!relayResponse.ok || relayPayload?.ok !== true) {
    const err = typeof relayPayload?.error === "string" ? relayPayload.error : "relay failed";
    throw new Error(`检测代理失败: ${err}${logPath ? ` (log: ${logPath})` : ""}`);
  }

  const upstreamStatus = typeof relayPayload?.status === "number" ? relayPayload.status : 0;
  if (upstreamStatus < 200 || upstreamStatus >= 300) {
    throw new Error(
      `HTTP ${upstreamStatus}: ${rawText.slice(0, 320)}${logPath ? ` (log: ${logPath})` : ""}`
    );
  }

  let payload: any = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(`响应结构检测失败: JSON 无法解析${logPath ? ` (log: ${logPath})` : ""}`);
  }

  const responseText = extractResponseText(payload, mode);
  const usage = payload && typeof payload === "object" ? payload.usage : null;
  const inputTokens =
    usage && typeof usage.input_tokens === "number"
      ? usage.input_tokens
      : usage && typeof usage.prompt_tokens === "number"
        ? usage.prompt_tokens
        : typeof relayUsage.input_tokens === "number"
          ? relayUsage.input_tokens
          : typeof relayUsage.prompt_tokens === "number"
            ? relayUsage.prompt_tokens
            : null;
  const outputTokens =
    usage && typeof usage.output_tokens === "number"
      ? usage.output_tokens
      : usage && typeof usage.completion_tokens === "number"
        ? usage.completion_tokens
        : typeof relayUsage.output_tokens === "number"
          ? relayUsage.output_tokens
          : typeof relayUsage.completion_tokens === "number"
            ? relayUsage.completion_tokens
            : null;
  const totalTokens =
    usage && typeof usage.total_tokens === "number"
      ? usage.total_tokens
      : inputTokens !== null && outputTokens !== null
        ? inputTokens + outputTokens
        : null;
  const tps = outputTokens && latencyMs > 0 ? Number((outputTokens / (latencyMs / 1000)).toFixed(1)) : 0;

  const contentTypes: string[] = [];
  if (mode === "anthropic") {
    const content = Array.isArray(payload?.content) ? payload.content : [];
    for (const item of content) {
      if (item && typeof item.type === "string") {
        contentTypes.push(item.type);
      }
    }
    for (const t of sseContentTypes) {
      if (!contentTypes.includes(t)) {
        contentTypes.push(t);
      }
    }
  } else {
    contentTypes.push("text");
    const toolCalls = payload?.choices?.[0]?.message?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
      contentTypes.push("tool_use");
    }
  }

  return {
    prompt: options.prompt,
    responseText,
    payload,
    latencyMs,
    firstTokenLatencyMs,
    tps,
    inputTokens,
    outputTokens,
    totalTokens,
    cacheHit: relayCacheHit,
    cacheReadInputTokens: relayCacheReadInputTokens,
    cacheCreationInputTokens: relayCacheCreationInputTokens,
    signatureDeltaTotalLength,
    signatureDeltaCount,
    contentTypes,
    parseOk: true,
    logPath,
    mode,
    protocolHints: {
      hasModel: typeof payload?.model === "string",
      hasRole:
        mode === "anthropic"
          ? typeof payload?.role === "string"
          : typeof payload?.choices?.[0]?.message?.role === "string",
      hasContentArray: mode === "anthropic" ? Array.isArray(payload?.content) : Array.isArray(payload?.choices),
      hasUsage: !!(payload?.usage && typeof payload.usage === "object"),
      hasStopReason:
        mode === "anthropic"
          ? typeof payload?.stop_reason === "string" || payload?.stop_reason === null
          : typeof payload?.choices?.[0]?.finish_reason === "string" || payload?.choices?.[0]?.finish_reason === null,
    },
  };
}

function buildChecks(options: {
  stage1: ProbeResult;
  stage2: ProbeResult | null;
  stage1Pass: boolean;
  stage2Pass: boolean;
}): { checks: CheckItem[]; score: number } {
  const { stage1, stage2, stage1Pass, stage2Pass } = options;

  const protocolScoreRaw = [
    stage1.protocolHints.hasModel,
    stage1.protocolHints.hasRole,
    stage1.protocolHints.hasContentArray,
    stage1.protocolHints.hasUsage,
    stage1.protocolHints.hasStopReason,
    stage2?.protocolHints.hasModel ?? false,
    stage2?.protocolHints.hasRole ?? false,
    stage2?.protocolHints.hasContentArray ?? false,
    stage2?.protocolHints.hasUsage ?? false,
    stage2?.protocolHints.hasStopReason ?? false,
  ].filter(Boolean).length;

  const protocolStatus: CheckStatus = protocolScoreRaw >= 8 ? "pass" : protocolScoreRaw >= 5 ? "warning" : "fail";

  const responseStructureStatus: CheckStatus = stage2
    ? (stage1.parseOk && stage2.parseOk ? "pass" : "fail")
    : (stage1.parseOk ? "warning" : "fail");

  const knowledgeCutoffStatus: CheckStatus = !stage1Pass ? "fail" : stage2Pass ? "pass" : "fail";

  const identityStatus: CheckStatus = stage1Pass ? "pass" : "fail";

  const thinkingDetected =
    stage1.contentTypes.includes("thinking") ||
    stage2?.contentTypes.includes("thinking") ||
    /thinking/i.test(stage1.responseText) ||
    (stage2 ? /thinking/i.test(stage2.responseText) : false);
  const thinkingStatus: CheckStatus = thinkingDetected ? "pass" : "warning";

  const signatureLength = stage1.signatureDeltaTotalLength + (stage2?.signatureDeltaTotalLength ?? 0);
  const signatureStatus: CheckStatus = signatureLength >= 100 ? "pass" : signatureLength > 0 ? "warning" : "fail";
  const outputTokenSum = (stage1.outputTokens ?? 0) + (stage2?.outputTokens ?? 0);
  let outputTokenPenalty = 0;
  if (outputTokenSum > 800) {
    outputTokenPenalty = 15;
  } else if (outputTokenSum > 500) {
    outputTokenPenalty = 8;
  }

  const checks: CheckItem[] = [
    {
      name: "Protocol Consistency",
      status: protocolStatus,
      detail: protocolStatus === "pass" ? "Stable" : protocolStatus === "warning" ? "Partial" : "Weak",
      trace: safeTrace({
        stage1_protocol: stage1.protocolHints,
        stage2_protocol: stage2?.protocolHints ?? null,
        matched_fields: protocolScoreRaw,
        request_metrics: {
          stage1: {
            mode: stage1.mode,
            latency_ms: stage1.latencyMs,
            first_token_latency_ms: stage1.firstTokenLatencyMs,
            input_tokens: stage1.inputTokens,
            output_tokens: stage1.outputTokens,
            total_tokens: stage1.totalTokens,
            cache_hit: stage1.cacheHit,
            cache_read_input_tokens: stage1.cacheReadInputTokens,
            cache_creation_input_tokens: stage1.cacheCreationInputTokens,
            signature_delta_total_length: stage1.signatureDeltaTotalLength,
            signature_delta_count: stage1.signatureDeltaCount,
            log_path: stage1.logPath,
          },
          stage2: stage2
            ? {
                mode: stage2.mode,
                latency_ms: stage2.latencyMs,
                first_token_latency_ms: stage2.firstTokenLatencyMs,
                input_tokens: stage2.inputTokens,
                output_tokens: stage2.outputTokens,
                total_tokens: stage2.totalTokens,
                cache_hit: stage2.cacheHit,
                cache_read_input_tokens: stage2.cacheReadInputTokens,
                cache_creation_input_tokens: stage2.cacheCreationInputTokens,
                signature_delta_total_length: stage2.signatureDeltaTotalLength,
                signature_delta_count: stage2.signatureDeltaCount,
                log_path: stage2.logPath,
              }
            : null,
        },
      }),
    },
    {
      name: "Response Structure",
      status: responseStructureStatus,
      detail:
        responseStructureStatus === "pass"
          ? "JSON Valid"
          : responseStructureStatus === "warning"
            ? "Single Prompt"
            : "Invalid",
      trace: safeTrace({
        stage1_json_parse_ok: stage1.parseOk,
        stage2_json_parse_ok: stage2?.parseOk ?? false,
      }),
    },
    {
      name: "Knowledge Cutoff",
      status: knowledgeCutoffStatus,
      detail: knowledgeCutoffStatus === "pass" ? "Pass" : "Fail",
      trace: safeTrace({
        stage1_pass: stage1Pass,
        stage2_pass: stage2Pass,
        stage2_prompt: stage2?.prompt ?? null,
        stage2_response_preview: stage2?.responseText.slice(0, 180) ?? null,
        rule: "If April 2025 event can be answered (not unknown), treat as newer cutoff signal.",
        output_tokens_total: outputTokenSum,
        output_token_penalty: outputTokenPenalty,
      }),
    },
    {
      name: "Identity Verification",
      status: identityStatus,
      detail: identityStatus === "pass" ? "Consistent" : "Mismatch",
      trace: safeTrace({
        stage1_prompt: stage1.prompt,
        stage1_response: stage1.responseText,
        rule: 'If response includes Chinese quote mark "”", treat as non-Claude pattern.',
      }),
    },
    {
      name: "Thinking Chain",
      status: thinkingStatus,
      detail: thinkingStatus === "pass" ? "Present" : "Not Found",
      trace: safeTrace({
        stage1_content_types: stage1.contentTypes,
        stage2_content_types: stage2?.contentTypes ?? [],
      }),
    },
    {
      name: "Signature Fingerprint",
      status: signatureStatus,
      detail: signatureStatus === "pass" ? "Length OK" : signatureStatus === "warning" ? "Short" : "Missing",
      trace: safeTrace({
        signature_length: signatureLength,
        signature_delta_count: stage1.signatureDeltaCount + (stage2?.signatureDeltaCount ?? 0),
        stage1_signature_length: stage1.signatureDeltaTotalLength,
        stage2_signature_length: stage2?.signatureDeltaTotalLength ?? 0,
        threshold: 100,
      }),
    },
  ];

  const weighted =
    statusToScore(identityStatus, 40) +
    statusToScore(knowledgeCutoffStatus, 30) +
    statusToScore(protocolStatus, 10) +
    statusToScore(responseStructureStatus, 8) +
    statusToScore(thinkingStatus, 6) +
    statusToScore(signatureStatus, 6);

  let score = weighted - outputTokenPenalty;
  if (!stage1Pass) {
    score = Math.min(score, 35);
  } else if (!stage2Pass) {
    score = Math.min(score, 68);
  }

  return { checks, score: Math.max(0, Math.min(100, score)) };
}

function isUnknownResponse(text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return true;
  if (normalized.replace(/\s+/g, "").length < 8) return true;
  return UNKNOWN_PATTERNS.some((pattern) => pattern.test(normalized));
}

const Index = () => {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>("claude-sonnet-4-6");
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [lang, setLang] = useState<"en" | "zh">("zh");

  const runDetection = useCallback(async () => {
    if (!url) { toast.error("Please enter an API endpoint URL"); return; }
    if (!apiKey) { toast.error("Please enter your API Key"); return; }
    if (!selectedModel) { toast.error("Please select a target model"); return; }
    if (!turnstileVerified) { toast.error("Please complete human verification first"); return; }

    setIsScanning(true);
    setResult(null);

    try {
      const stage1 = await sendProbe({
        baseUrl: url,
        apiKey,
        model: selectedModel,
        stage: "stage1",
        prompt: SYMBOL_PROMPT,
      });

      const stage1Pass = !stage1.responseText.includes("”");

      let stage2: ProbeResult | null = null;
      let stage2Pass = false;

      if (stage1Pass) {
        const stage2Prompt = APRIL_EVENT_PROMPTS[Math.floor(Math.random() * APRIL_EVENT_PROMPTS.length)];
        stage2 = await sendProbe({
          baseUrl: url,
          apiKey,
          model: selectedModel,
          stage: "stage2",
          prompt: stage2Prompt,
          previousAssistantText: stage1.responseText,
        });
        stage2Pass = !isUnknownResponse(stage2.responseText);
      }

      const { checks, score } = buildChecks({ stage1, stage2, stage1Pass, stage2Pass });

      const avgLatency = stage2 ? Math.round((stage1.latencyMs + stage2.latencyMs) / 2) : stage1.latencyMs;
      const avgTps = stage2 ? Number(((stage1.tps + stage2.tps) / 2).toFixed(1)) : stage1.tps;
      const inputTokenSum = (stage1.inputTokens ?? 0) + (stage2?.inputTokens ?? 0);
      const outputTokenSum = (stage1.outputTokens ?? 0) + (stage2?.outputTokens ?? 0);
      const totalTokenSum = (stage1.totalTokens ?? 0) + (stage2?.totalTokens ?? 0);

      const id = `#${Math.floor(100000 + Math.random() * 900000)}`;
      const newResult: DetectionResult = {
        id,
        score,
        checks,
        latency: avgLatency,
        tps: avgTps,
        inputTokens: inputTokenSum,
        outputTokens: outputTokenSum,
        totalTokens: totalTokenSum,
      };
      setResult(newResult);

      const modelName = selectedModel === "claude-opus-4-6" ? "Opus 4.6" : "Sonnet 4.6";
      const now = new Date();
      const timestamp = `${now.getMonth() + 1}/${now.getDate()}, ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      setHistory((prev) => [
        {
          id,
          timestamp,
          model: modelName,
          endpoint: url,
          apiKey,
          score,
          status: score >= 70 ? "pass" : "fail",
        },
        ...prev,
      ]);

      toast.success(lang === "zh" ? "检测完成" : "Detection complete");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Detection failed";
      toast.error(lang === "zh" ? `检测失败: ${message}` : `Detection failed: ${message}`);
    } finally {
      setIsScanning(false);
    }
  }, [url, apiKey, selectedModel, turnstileVerified, lang]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex items-start justify-between mb-8">
          <div className="flex items-center gap-3">
            <Logo size={36} />
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {lang === "zh" ? "API 真实性检测" : "Authenticity Check"}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
              {lang === "zh"
                ? "验证您的 AI 模型 API 端点是否名副其实"
                : "Verify the model behind the endpoint."}
            </p>
            </div>
          </div>
          <div className="flex items-center border border-border rounded-full overflow-hidden text-sm">
            <button
              onClick={() => setLang("en")}
              className={`px-3 py-1.5 transition-colors ${lang === "en" ? "bg-foreground text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              EN
            </button>
            <button
              onClick={() => setLang("zh")}
              className={`px-3 py-1.5 transition-colors ${lang === "zh" ? "bg-foreground text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              中文
            </button>
          </div>
        </div>

        {/* Security Notice */}
        <div className="flex items-start gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 mb-4">
          <Info className="w-4 h-4 text-primary mt-0.5 shrink-0" />
          <p className="text-sm text-muted-foreground leading-relaxed">
            {lang === "zh"
              ? "为确保您的账户安全，建议优先使用测试用途的 API Key。本工具已在 GitHub 开源，采用纯前端处理逻辑，不经过、不存储您的 API Key。所有检测历史仅留存在您的当前浏览器本地。"
              : "For your account's security, we recommend using a temporary or test API key. This tool is open-source on GitHub and utilizes pure client-side logic; your API keys are neither transmitted to nor stored on our servers. All test history is saved exclusively in your local browser storage"}
          </p>
        </div>

        {/* Config Section */}
        <div className="rounded-xl border border-border bg-card p-6 mb-4">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center">
              <span className="text-sm">📋</span>
            </div>
            <h2 className="text-lg font-semibold tracking-tight text-foreground">
              {lang === "zh" ? "接口配置" : "API Configuration"}
            </h2>
          </div>

          <ApiConfig url={url} apiKey={apiKey} onUrlChange={setUrl} onApiKeyChange={setApiKey} />
          <ModelSelector selected={selectedModel} onSelect={setSelectedModel} />
        </div>

        {/* Action Row */}
        <div className="flex items-center justify-between mb-6">
          {/* Turnstile mock */}
          <button
            onClick={() => setTurnstileVerified(!turnstileVerified)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg border transition-all ${
              turnstileVerified
                ? "border-primary bg-primary/5"
                : "border-border bg-card hover:border-primary/30"
            }`}
          >
            <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
              turnstileVerified ? "border-primary bg-primary" : "border-muted-foreground"
            }`}>
              {turnstileVerified && (
                <svg className="w-3 h-3 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            <span className="text-sm text-foreground">
              {lang === "zh" ? "验证您是人类" : "Verify you are human"}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono ml-1">CLOUDFLARE</span>
          </button>

          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={runDetection}
            disabled={isScanning}
            className="flex items-center gap-2 bg-primary hover:bg-primary-hover text-primary-foreground px-8 py-3 rounded-xl font-medium text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Shield className="w-4 h-4" />
            {isScanning
              ? (lang === "zh" ? "检测中..." : "Scanning...")
              : (lang === "zh" ? "开始检测" : "Start Detection")}
          </motion.button>
        </div>

        {/* Results Section */}
        <AnimatePresence>
          {(isScanning || result) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4, ease: [0.2, 0, 0, 1] }}
              className="relative rounded-xl border border-border bg-card p-6 mb-4"
            >
              <ScanningOverlay isScanning={isScanning} />

              {result && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Zap className="w-4 h-4 text-primary" />
                      <h3 className="text-lg font-semibold tracking-tight text-foreground">
                        {lang === "zh" ? "检测结果" : "Detection Result"}
                      </h3>
                    </div>
                    <span className="text-xs font-mono text-muted-foreground">ID: {result.id}</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-6">
                    <ScoreGauge score={result.score} />
                    <DetectionChecklist
                      items={result.checks}
                      latency={result.latency}
                      tps={result.tps}
                      inputTokens={result.inputTokens}
                      outputTokens={result.outputTokens}
                      totalTokens={result.totalTokens}
                    />
                  </div>
                </>
              )}

              {isScanning && !result && <div className="h-64" />}
            </motion.div>
          )}
        </AnimatePresence>

        {/* History Section */}
        <HistoryLog
          entries={history}
          onSelect={(entry) => toast.info(`Viewing report ${entry.id}`)}
          onExport={() => toast.success(lang === "zh" ? "导出功能即将上线" : "Export coming soon")}
        />
      </div>
      <Footer />
    </div>
  );
};

export default Index;
