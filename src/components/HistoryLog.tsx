import { CheckCircle2, XCircle, Download, Clock } from "lucide-react";

export interface HistoryEntry {
  id: string;
  timestamp: string;
  model: string;
  endpoint: string;
  apiKey: string;
  score: number;
  status: "pass" | "fail";
}

interface HistoryLogProps {
  entries: HistoryEntry[];
  onSelect: (entry: HistoryEntry) => void;
  onExport: () => void;
}

export function HistoryLog({ entries, onSelect, onExport }: HistoryLogProps) {
  if (entries.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-primary" />
            <h3 className="text-lg font-semibold tracking-tight text-foreground">Recent History</h3>
          </div>
        </div>
        <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <span className="text-2xl">🔬</span>
          </div>
          <p className="text-sm font-medium">System Ready</p>
          <p className="text-xs mt-1">Detection results will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-primary" />
          <h3 className="text-lg font-semibold tracking-tight text-foreground">Recent History</h3>
        </div>
        <button
          onClick={onExport}
          className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-hover transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
          Export
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-2 text-xs font-mono text-muted-foreground uppercase tracking-wider font-medium">Timestamp</th>
              <th className="text-left py-2 text-xs font-mono text-muted-foreground uppercase tracking-wider font-medium">Model</th>
              <th className="text-left py-2 text-xs font-mono text-muted-foreground uppercase tracking-wider font-medium">Endpoint</th>
              <th className="text-right py-2 text-xs font-mono text-muted-foreground uppercase tracking-wider font-medium">Score</th>
              <th className="text-center py-2 text-xs font-mono text-muted-foreground uppercase tracking-wider font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                onClick={() => onSelect(entry)}
                className="border-b border-border last:border-b-0 cursor-pointer hover:bg-muted/50 transition-colors"
              >
                <td className="py-3 text-foreground">{entry.timestamp}</td>
                <td className="py-3">
                  <span className="px-2 py-0.5 rounded bg-muted text-xs font-mono font-medium text-foreground">
                    {entry.model}
                  </span>
                </td>
                <td className="py-3 text-muted-foreground font-mono text-xs">
                  ...{entry.endpoint.split("/").slice(-2).join("/")}
                </td>
                <td className={`py-3 text-right font-semibold tabular-nums ${
                  entry.score >= 80 ? "text-success" : entry.score >= 50 ? "text-warning" : "text-error"
                }`}>
                  {entry.score}%
                </td>
                <td className="py-3 text-center">
                  {entry.status === "pass" ? (
                    <CheckCircle2 className="w-4 h-4 text-success inline" />
                  ) : (
                    <XCircle className="w-4 h-4 text-error inline" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
