import React from "react";
import { Check, Wifi } from "lucide-react";
import { formatBytes, formatSpeed, formatEta } from "./Formatters";

export function TransferStatus({
  connected,
  progress,
  label,
  speed = 0,
  transferred = 0,
  total = 0,
  eta = 0,
  isLocalDirect = false,
}: {
  connected: boolean;
  progress: number;
  label: string;
  speed?: number;
  transferred?: number;
  total?: number;
  eta?: number;
  isLocalDirect?: boolean;
}) {
  const calculatedPercent = total > 0 ? Math.min(100, Math.floor((transferred / total) * 100)) : 0;
  const displayPercent = Math.min(100, Math.max(progress, calculatedPercent));

  return (
    <div className="w-full min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6" data-testid="status-transfer">
      <div className="flex w-full min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span
            className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              displayPercent === 100 ? "bg-accent text-accent-foreground shadow-[0_0_12px_hsl(var(--accent)/0.5)]" : "bg-accent/15 text-accent"
            }`}
          >
            {displayPercent === 100 ? <Check size={17} /> : <Wifi size={17} />}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-primary">{label}</p>
            <p className="mt-0.5 truncate text-xs text-muted-foreground">
              {connected
                ? isLocalDirect
                  ? "⚡ Direct Local High-Speed Link (Zero internet used)"
                  : "🌐 Direct P2P & Low-Network Tunnel (Active across mobile/cellular data)"
                : "Waiting for the other device"}
            </p>
          </div>
        </div>
        <span className="font-mono-ui shrink-0 text-sm font-bold text-primary">{displayPercent}%</span>
      </div>

      <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-200 ease-out"
          style={{ width: `${displayPercent}%` }}
        />
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-border pt-4 text-xs sm:gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Transferred</p>
          <p className="mt-1 truncate font-mono-ui text-[11px] font-bold text-primary sm:text-xs">
            {transferred > 0 ? (
              total > 0 ? `${formatBytes(transferred)} / ${formatBytes(total)}` : formatBytes(transferred)
            ) : total > 0 ? (
              `0 B / ${formatBytes(total)}`
            ) : "—"}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Speed</p>
          <p className="mt-1 truncate font-mono-ui text-[11px] font-bold text-primary sm:text-xs">{formatSpeed(speed)}</p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] text-muted-foreground sm:text-xs">Time left</p>
          <p className="mt-1 truncate font-mono-ui text-[11px] font-bold text-primary sm:text-xs">{formatEta(eta)}</p>
        </div>
      </div>
    </div>
  );
}
