import { motion } from "framer-motion";
import { Check } from "lucide-react";

export interface ModelOption {
  id: string;
  name: string;
  provider: string;
}

const MODELS: ModelOption[] = [
  { id: "claude-opus-4.6", name: "Claude Opus 4.6", provider: "Anthropic" },
  { id: "claude-sonnet-4.6", name: "Claude Sonnet 4.6", provider: "Anthropic" },
];

interface ModelSelectorProps {
  selected: string | null;
  onSelect: (id: string) => void;
}

export function ModelSelector({ selected, onSelect }: ModelSelectorProps) {
  return (
    <div className="mt-5">
      <label className="block text-xs font-medium text-muted-foreground mb-2.5 uppercase tracking-wider font-mono">
        Target Model
      </label>
      <div className="grid grid-cols-2 sm:grid-cols-2 gap-3">
        {MODELS.map((model) => {
          const isSelected = selected === model.id;
          return (
            <motion.button
              key={model.id}
              onClick={() => onSelect(model.id)}
              whileTap={{ scale: 0.98 }}
              className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${
                isSelected
                  ? "border-primary bg-primary/5"
                  : "border-transparent bg-muted hover:border-border"
              }`}
            >
              {isSelected && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="absolute top-3 right-3 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
                >
                  <Check className="w-3 h-3 text-primary-foreground" />
                </motion.div>
              )}
              <div className="text-sm font-semibold text-foreground">{model.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5 font-mono">{model.provider}</div>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}
