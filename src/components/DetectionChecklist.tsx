import { motion } from "framer-motion";
import { CheckCircle2, XCircle, AlertTriangle, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export interface CheckItem {
  name: string;
  status: "pass" | "fail" | "warning";
  detail: string;
  trace?: string;
}

interface DetectionChecklistProps {
  items: CheckItem[];
  latency?: number;
  tps?: number;
}

const statusConfig = {
  pass: { icon: CheckCircle2, label: "Verified", className: "text-success" },
  fail: { icon: XCircle, label: "Failed", className: "text-error" },
  warning: { icon: AlertTriangle, label: "Warning", className: "text-warning" },
};

export function DetectionChecklist({ items, latency, tps }: DetectionChecklistProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <div className="space-y-0">
      {items.map((item, i) => {
        const config = statusConfig[item.status];
        const Icon = config.icon;
        const isExpanded = expandedIndex === i;

        return (
          <motion.div
            key={item.name}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.1, duration: 0.3, ease: [0.2, 0, 0, 1] }}
            className="border-b border-border last:border-b-0"
          >
            <button
              onClick={() => setExpandedIndex(isExpanded ? null : i)}
              className="w-full flex items-center justify-between py-3.5 px-1 text-left hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon className={`w-4 h-4 ${config.className}`} />
                <span className="text-sm font-medium text-foreground">{item.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                  item.status === "pass" ? "bg-success/10 text-success" :
                  item.status === "fail" ? "bg-error/10 text-error" :
                  "bg-warning/10 text-warning"
                }`}>
                  {item.detail}
                </span>
                {item.trace && (
                  isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                )}
              </div>
            </button>
            {isExpanded && item.trace && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="px-1 pb-3"
              >
                <pre className="text-xs font-mono bg-foreground/[0.03] border border-border rounded-lg p-3 overflow-x-auto text-muted-foreground whitespace-pre-wrap">
                  {item.trace}
                </pre>
              </motion.div>
            )}
          </motion.div>
        );
      })}

      {/* Performance metrics */}
      {(latency || tps) && (
        <div className="flex gap-6 pt-4 mt-2 border-t border-border">
          {latency && (
            <div>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Latency</div>
              <div className="text-lg font-semibold text-foreground tabular-nums">{latency}ms</div>
            </div>
          )}
          {tps && (
            <div>
              <div className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Tokens/s</div>
              <div className="text-lg font-semibold text-foreground tabular-nums">{tps}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
