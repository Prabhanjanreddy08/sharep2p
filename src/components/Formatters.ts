export function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(bytes > 100 * 1024 ? 0 : 1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(bytes > 100 * 1024 * 1024 ? 0 : 1)} MB`;
  }
  if (bytes < 1024 * 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(2)} TB`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!bytesPerSec || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "—";
  if (bytesPerSec < 1024 * 1024) {
    return `${(bytesPerSec / 1024).toFixed(0)} KB/s`;
  }
  if (bytesPerSec >= 1024 * 1024 * 1024) {
    return `${(bytesPerSec / (1024 * 1024 * 1024)).toFixed(2)} GB/s`;
  }
  return `${(bytesPerSec / (1024 * 1024)).toFixed(1)} MB/s`;
}

export function formatEta(seconds: number): string {
  if (!seconds || !Number.isFinite(seconds)) return "—";
  const sec = Math.max(0, Math.ceil(seconds));
  if (sec >= 3600) {
    const hrs = Math.floor(sec / 3600);
    const mins = Math.floor((sec % 3600) / 60);
    const secs = sec % 60;
    return `${hrs}h ${String(mins).padStart(2, "0")}m ${String(secs).padStart(2, "0")}s`;
  }
  return `${String(Math.floor(sec / 60)).padStart(2, "0")}:${String(sec % 60).padStart(2, "0")}`;
}
