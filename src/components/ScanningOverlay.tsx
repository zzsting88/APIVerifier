import { motion } from "framer-motion";

interface ScanningOverlayProps {
  isScanning: boolean;
}

export function ScanningOverlay({ isScanning }: ScanningOverlayProps) {
  if (!isScanning) return null;

  return (
    <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none z-10">
      <motion.div
        className="absolute left-0 right-0 h-[2px] bg-primary/30"
        initial={{ top: 0 }}
        animate={{ top: ["0%", "100%"] }}
        transition={{ duration: 2, repeat: Infinity, ease: [0.2, 0, 0, 1] }}
      />
      <div className="absolute inset-0 bg-card/60 backdrop-blur-[1px]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <motion.div
            className="w-10 h-10 rounded-full border-2 border-primary border-t-transparent"
            animate={{ rotate: 360 }}
            transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          />
          <span className="text-sm font-medium text-foreground">Analyzing endpoint...</span>
        </div>
      </div>
    </div>
  );
}
