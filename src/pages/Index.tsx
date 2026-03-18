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

// Mock detection results
const MOCK_CHECKS: CheckItem[] = [
  { name: "Signature Fingerprint", status: "pass", detail: "Verified", trace: '{\n  "fingerprint_length": 128,\n  "hash": "sha256:a3f8c2...",\n  "match_confidence": 0.97\n}' },
  { name: "Identity Verification", status: "pass", detail: "Consistent", trace: '{\n  "claimed_model": "claude-opus-4.6",\n  "self_report": "Claude Opus 4.6",\n  "match": true\n}' },
  { name: "Thinking Chain", status: "pass", detail: "Present", trace: '{\n  "thinking_tokens": 1247,\n  "chain_depth": 5,\n  "reasoning_quality": "high"\n}' },
  { name: "Tool Calling", status: "pass", detail: "Functional", trace: '{\n  "tools_supported": true,\n  "parallel_calls": true,\n  "structured_output": true\n}' },
  { name: "Response Structure", status: "warning", detail: "Minor Diff", trace: '{\n  "json_valid": true,\n  "schema_match": 0.94,\n  "missing_fields": ["usage.cache_read_input_tokens"]\n}' },
  { name: "Multi-turn Consistency", status: "pass", detail: "Stable", trace: '{\n  "context_window": 200000,\n  "memory_retention": 0.98,\n  "truncation": false\n}' },
];

const MOCK_FAIL_CHECKS: CheckItem[] = [
  { name: "Signature Fingerprint", status: "fail", detail: "Mismatch", trace: '{\n  "fingerprint_length": 64,\n  "expected": 128,\n  "match_confidence": 0.23\n}' },
  { name: "Identity Verification", status: "fail", detail: "Spoofed", trace: '{\n  "claimed_model": "claude-opus-4.6",\n  "actual_behavior": "haiku-class",\n  "match": false\n}' },
  { name: "Thinking Chain", status: "fail", detail: "Absent", trace: '{\n  "thinking_tokens": 0,\n  "chain_depth": 0,\n  "reasoning_quality": "none"\n}' },
  { name: "Tool Calling", status: "warning", detail: "Partial", trace: '{\n  "tools_supported": true,\n  "parallel_calls": false,\n  "structured_output": false\n}' },
  { name: "Response Structure", status: "fail", detail: "Non-standard", trace: '{\n  "json_valid": true,\n  "schema_match": 0.41,\n  "extra_fields": ["proxy_id", "cache_hit"]\n}' },
  { name: "Multi-turn Consistency", status: "fail", detail: "Truncated", trace: '{\n  "context_window": 8000,\n  "expected": 200000,\n  "truncation": true\n}' },
];

interface DetectionResult {
  id: string;
  score: number;
  checks: CheckItem[];
  latency: number;
  tps: number;
}

const Index = () => {
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [result, setResult] = useState<DetectionResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [turnstileVerified, setTurnstileVerified] = useState(false);
  const [lang, setLang] = useState<"en" | "zh">("zh");

  const runDetection = useCallback(() => {
    if (!url) { toast.error("Please enter an API endpoint URL"); return; }
    if (!apiKey) { toast.error("Please enter your API Key"); return; }
    if (!selectedModel) { toast.error("Please select a target model"); return; }
    if (!turnstileVerified) { toast.error("Please complete human verification first"); return; }

    setIsScanning(true);
    setResult(null);

    // Simulate detection
    setTimeout(() => {
      const isGenuine = Math.random() > 0.3;
      const score = isGenuine ? 85 + Math.floor(Math.random() * 15) : 20 + Math.floor(Math.random() * 35);
      const checks = isGenuine ? MOCK_CHECKS : MOCK_FAIL_CHECKS;
      const latency = isGenuine ? 80 + Math.floor(Math.random() * 100) : 200 + Math.floor(Math.random() * 300);
      const tps = isGenuine ? 40 + Math.floor(Math.random() * 30) : 10 + Math.floor(Math.random() * 15);

      const id = `#${Math.floor(100000 + Math.random() * 900000)}`;
      const newResult: DetectionResult = { id, score, checks, latency, tps };
      setResult(newResult);
      setIsScanning(false);

      const modelName = selectedModel === "claude-opus-4.6" ? "Opus 4.6" : "Sonnet 4.6";
      const now = new Date();
      const timestamp = `${now.getMonth() + 1}/${now.getDate()}, ${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      setHistory((prev) => [
        {
          id,
          timestamp,
          model: modelName,
          endpoint: url,
          apiKey: apiKey,
          score,
          status: score >= 70 ? "pass" : "fail",
        },
        ...prev,
      ]);
    }, 3000);
  }, [url, apiKey, selectedModel, turnstileVerified]);

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
              ? "🔒 为了账户安全，建议使用测试用途的 API Key 进行检测。本项目已开源，不会在后端存储您的 API Key，所有历史记录仅保存在浏览器本地（Cookie）中。"
              : "🔒 For security, we recommend using a test API Key. This project is open-source and does not store your API Key on any server. All history is saved locally in your browser (cookies)."}
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
                    <DetectionChecklist items={result.checks} latency={result.latency} tps={result.tps} />
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
