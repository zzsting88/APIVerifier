import { useState, useRef } from "react";
import { Search, X } from "lucide-react";

const PROVIDERS = [
  { name: "OpenAI Official", url: "https://api.openai.com" },
  { name: "Anthropic Official", url: "https://api.anthropic.com"},
  { name: "OpenRouter", url: "https://openrouter.ai/api" },
  { name: "One API", url: "https://one-api.example.com" },
  { name: "New API", url: "https://new-api.example.com" },
  { name: "AI Proxy", url: "https://ai-proxy.example.com" },
];

interface ApiConfigProps {
  url: string;
  apiKey: string;
  onUrlChange: (url: string) => void;
  onApiKeyChange: (key: string) => void;
}

export function ApiConfig({ url, apiKey, onUrlChange, onApiKeyChange }: ApiConfigProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [search, setSearch] = useState("");
  const [keyFocused, setKeyFocused] = useState(false);
  const [showKey, setShowKey] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = PROVIDERS.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.url.toLowerCase().includes(search.toLowerCase())
  );

  const maskedKey = apiKey
    ? apiKey.length > 9
      ? `${apiKey.slice(0, 7)}${"•".repeat(Math.min(apiKey.length - 9, 20))}${apiKey.slice(-2)}`
      : "•".repeat(apiKey.length)
    : "";

  return (
    <div>
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_560px] gap-4">
        {/* URL Input */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
            API Endpoint URL
          </label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              ref={inputRef}
              type="text"
              value={url}
              onChange={(e) => {
                onUrlChange(e.target.value);
                setSearch(e.target.value);
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 200)}
              placeholder="https://api.anthropic.com"
              className="w-full h-11 pl-10 pr-4 rounded-lg bg-muted border border-border text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
            {showDropdown && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-lg shadow-lg z-50 max-h-60 overflow-y-auto">
                {filtered.map((p) => (
                  <button
                    key={p.url}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted transition-colors"
                    onMouseDown={() => {
                      onUrlChange(p.url);
                      setShowDropdown(false);
                    }}
                  >
                    <span className="text-lg">{p.icon}</span>
                    <div>
                      <div className="text-sm font-medium text-foreground">{p.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{p.url}</div>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="px-4 py-3 text-sm text-muted-foreground">No providers found</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* API Key Input */}
        <div>
          <label className="block text-xs font-medium text-muted-foreground mb-1.5 uppercase tracking-wider font-mono">
            API Key
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm">🔑</span>
            {keyFocused ? (
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => onApiKeyChange(e.target.value)}
                onBlur={() => setKeyFocused(false)}
                autoFocus
                className="w-full h-11 pl-10 pr-20 rounded-lg bg-muted border border-border text-sm font-mono text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
              />
            ) : (
              <div
                onClick={() => setKeyFocused(true)}
                className="w-full h-11 pl-10 pr-20 rounded-lg bg-muted border border-border text-sm font-mono text-foreground flex items-center cursor-text select-none"
              >
                {apiKey ? maskedKey : <span className="text-muted-foreground">sk-ant-...</span>}
              </div>
            )}
            <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {apiKey && (
                <>
                  <button
                    onClick={() => setShowKey(!showKey)}
                    className="p-1 rounded hover:bg-foreground/5 text-muted-foreground transition-colors"
                    title={showKey ? "Hide" : "Show"}
                  >
                    {showKey ? "🙈" : "👁"}
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(apiKey)}
                    className="p-1 rounded hover:bg-foreground/5 text-muted-foreground transition-colors"
                    title="Copy"
                  >
                    📋
                  </button>
                  <button
                    onClick={() => onApiKeyChange("")}
                    className="p-1 rounded hover:bg-foreground/5 text-muted-foreground transition-colors"
                    title="Clear"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
