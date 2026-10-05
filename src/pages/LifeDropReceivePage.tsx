import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageContainer } from "../components/PageHeader";
import { TransferStatus } from "../components/TransferStatus";
import { StatusMessage } from "../components/StatusMessage";
import { ExpiryTimer } from "../components/ExpiryTimer";
import { LifeDropItemCompact } from "../components/LifeDropItemCard";
import { formatBytes } from "../components/Formatters";
import { startPeerConnection, ActiveSession } from "../engine/PeerConnection";
import { LifeDropItem, LifeDropSession } from "../engine/lifedrop";
import { apiUrl } from "../config";
import {
  LockKeyhole,
  MonitorDown,
  ShieldCheck,
  Check,
  X,
  Radio,
  ArrowRight,
  Package,
  Flame,
  Copy,
  Download,
  ExternalLink,
  Code2,
  Sparkles,
  ClipboardCopy,
} from "lucide-react";

function getSafeHttpUrl(rawUrl: string): string | null {
  try {
    const trimmed = rawUrl.trim();
    if (!trimmed) return null;
    const url = new URL(trimmed.startsWith("http://") || trimmed.startsWith("https://") ? trimmed : `https://${trimmed}`);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
    return null;
  } catch {
    return null;
  }
}

export function LifeDropReceivePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session] = useState<LifeDropSession | null>(() => {
    try {
      const saved = sessionStorage.getItem("sharefast-active-session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lifedrop && (!sessionId || parsed.sessionId === sessionId)) return parsed;
      }
    } catch {}
    return null;
  });

  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ transferred: 0, total: 0, speed: 0, eta: 0 });
  const [status, setStatus] = useState<"connecting" | "waiting" | "connected" | "transferring" | "complete" | "error" | "disconnected">("connecting");
  const [statusMessage, setStatusMessage] = useState("");
  const [downloadTriggered, setDownloadTriggered] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [completedFile, setCompletedFile] = useState<{ blob: Blob; fileName: string; verified: boolean } | null>(null);
  const [copiedId, setCopiedId] = useState("");

  const completedFileRef = useRef<{ blob: Blob; fileName: string; verified: boolean } | null>(null);
  const progressRef = useRef(0);

  // Generate a stable download URL when file is ready; revoked only on unmount
  useEffect(() => {
    if (!completedFile) return;
    try {
      const url = URL.createObjectURL(completedFile.blob);
      setDownloadUrl(url);
      return () => {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      };
    } catch (e) {
      console.error("LifeDrop download URL error:", e);
    }
  }, [completedFile]);

  const fileItems = (session?.lifedrop?.items || []).filter((i) => i.kind === "file" || i.kind === "photo");
  const textItems = (session?.lifedrop?.items || []).filter((i) => i.kind !== "file" && i.kind !== "photo");
  const hasFiles = fileItems.length > 0;

  // WebRTC for files
  useEffect(() => {
    if (!session || !hasFiles) return;

    const activeSession: ActiveSession = {
      sessionId: session.sessionId,
      token: session.token,
      otp: session.otp,
      fileName: session.fileName,
      fileSize: session.fileSize,
      fileType: session.fileType,
      signalingPath: session.signalingPath,
      expiresAt: session.expiresAt,
    };

    const client = startPeerConnection({
      session: activeSession,
      role: "receiver",
      onEvent: (evt) => {
        if (evt.type === "status") {
          // If transfer already completed, do not revert to disconnected or error
          if (completedFileRef.current || progressRef.current === 100) {
            console.log("LifeDrop ignoring status change after transfer completion:", evt.status);
            return;
          }
          setStatus(evt.status);
          if (evt.message) setStatusMessage(evt.message);
        } else if (evt.type === "progress") {
          setProgress(evt.progress);
          progressRef.current = evt.progress;
          setStats({ transferred: evt.transferred, total: evt.total, speed: evt.speed, eta: evt.eta });
        } else if (evt.type === "complete") {
          const blob = evt.blob || evt.files?.[0]?.blob;
          const fileName = evt.fileName || evt.files?.[0]?.fileName || "download";
          if (blob) {
            const fileData = { blob, fileName, verified: evt.verified };
            completedFileRef.current = fileData;
            setCompletedFile(fileData);
          }
          setStatus("complete");
          setProgress(100);
          progressRef.current = 100;
          setStatusMessage("Transfer complete! File is ready on this device.");

          // DO NOT automatically download: keep screen stable and let the user tap Save
        }
      },
    });

    return () => client.close();
  }, [session]);

  // Mark as picked up with token authentication
  useEffect(() => {
    if (!session) return;
    fetch(apiUrl(`/api/lifedrop/${session.sessionId}/pickup?token=${encodeURIComponent(session.token)}`), { method: "POST" }).catch(() => {});
  }, [session]);

  if (!session) {
    return (
      <PageContainer
        eyebrow="LifeDrop / missing"
        title={<>No drop<br /><em>found.</em></>}
        description="This LifeDrop may have expired or belongs to another browser."
      >
        <div className="mt-10">
          <StatusMessage tone="error">
            <X size={15} className="mt-0.5 shrink-0" />
            Pair again from the sender's screen.
          </StatusMessage>
          <Link
            to="/receive"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground"
          >
            Try another code <ArrowRight size={16} />
          </Link>
        </div>
      </PageContainer>
    );
  }

  const handleSaveFileClick = async (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (!completedFile) return;
    const safeName = completedFile.fileName.replace(/[/\\?%*:|"<>]/g, "_").trim() || "download";

    if (typeof (window as any).showSaveFilePicker === "function") {
      e.preventDefault();
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: safeName,
        });
        const writable = await handle.createWritable();
        await writable.write(completedFile.blob);
        await writable.close();
        setDownloadTriggered(true);
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return;
        if (downloadUrl) {
          window.open(downloadUrl, "_self");
        }
      }
    }
    setDownloadTriggered(true);
  };

  const handleCopyText = async (text: string, itemId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(itemId);
      setTimeout(() => setCopiedId(""), 1800);
    } catch {}
  };

  const handleFinish = () => {
    sessionStorage.removeItem("sharefast-active-session");
    navigate("/");
  };

  return (
    <PageContainer
      eyebrow="02 / LifeDrop"
      title={
        (completedFile || !hasFiles) ? (
          <>Your drop<br /><em>has arrived.</em></>
        ) : (
          <>A drop is<br /><em>on its way.</em></>
        )
      }
      description={
        (completedFile || !hasFiles)
          ? "Everything is ready. Copy text items or save files to this device."
          : "The devices are paired. File transfer runs peer-to-peer."
      }
    >
      <div className="mt-10 grid gap-5 lg:grid-cols-[1.15fr_.85fr]">
        {/* Left: Package content */}
        <div className="sf-rise sf-rise-1 space-y-5">
          {/* Package header card */}
          <div className="rounded-[1.6rem] border border-border bg-card p-6 sm:p-8">
            <div className="flex items-start gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent/15 text-accent">
                <Package size={26} />
              </span>
              <div className="min-w-0">
                <p className="text-xl font-bold tracking-[-.03em] text-primary">
                  {session.lifedrop.title}
                </p>
                <p className="mt-1 font-mono-ui text-xs text-muted-foreground">
                  {session.lifedrop.items.length} items
                  {session.lifedrop.totalFileSize > 0
                    ? ` · ${formatBytes(session.lifedrop.totalFileSize)} files`
                    : ""}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {session.lifedrop.burnAfterPickup && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-bold text-destructive">
                      <Flame size={11} /> Burns after pickup
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">
                    <Sparkles size={11} /> Picked up
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Text items – actionable cards */}
          {textItems.length > 0 && (
            <div className="space-y-2">
              <span className="font-mono-ui text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">
                Text items — tap to copy
              </span>
              {textItems.map((item) => (
                <div
                  key={item.id}
                  className="group rounded-2xl border border-border bg-card p-4 transition-colors hover:border-accent/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <LifeDropItemCompact item={item} index={0} />
                    <div className="flex shrink-0 gap-1.5">
                      {item.kind === "url" && item.value && getSafeHttpUrl(item.value) && (
                        <a
                          href={getSafeHttpUrl(item.value)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary hover:bg-accent/15 hover:text-accent"
                          aria-label="Open link"
                        >
                          <ExternalLink size={14} />
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => handleCopyText(item.value || "", item.id)}
                        className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-primary hover:bg-accent/15 hover:text-accent"
                        aria-label="Copy"
                      >
                        {copiedId === item.id ? <Check size={14} /> : <ClipboardCopy size={14} />}
                      </button>
                    </div>
                  </div>
                  {/* Full value preview */}
                  {item.value && (
                    <div className="mt-3 rounded-xl bg-secondary p-3">
                      <pre className={`whitespace-pre-wrap break-words text-xs text-primary ${item.kind === "code" ? "font-mono" : ""}`}>
                        {item.value}
                      </pre>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* File items – transfer + save */}
          {hasFiles && (
            <div className="space-y-3">
              <span className="font-mono-ui text-[10px] font-bold uppercase tracking-[.14em] text-muted-foreground">
                File items — peer-to-peer transfer
              </span>
              {fileItems.map((item) => (
                <LifeDropItemCompact key={item.id} item={item} index={0} />
              ))}

              <TransferStatus
                connected={status === "connected" || status === "transferring" || status === "complete"}
                progress={progress}
                speed={stats.speed}
                transferred={stats.transferred}
                total={session.lifedrop.totalFileSize}
                eta={stats.eta}
                label={
                  progress === 100
                    ? "Files ready on this device"
                    : status === "transferring"
                    ? "Receiving files"
                    : status === "connected"
                    ? "Direct link established"
                    : status === "error"
                    ? "Connection needs attention"
                    : "Connecting to sender"
                }
              />

              {completedFile && (
                <div className="mt-5 space-y-3">
                  <a
                    href={downloadUrl || "#"}
                    download={completedFile.fileName.replace(/[/\\?%*:|"<>]/g, "_").trim() || "download"}
                    onClick={handleSaveFileClick}
                    className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-background transition-transform hover:-translate-y-0.5 shadow-lg active:scale-[0.99] cursor-pointer"
                  >
                    <Download size={16} /> Save file to this device {downloadTriggered ? "(Download again)" : ""}
                  </a>
                  {downloadTriggered && (
                    <p className="text-center font-mono-ui text-[11px] text-emerald-400">
                      ✓ Download initiated! Check your browser’s downloads or notification bar.
                    </p>
                  )}
                </div>
              )}

              {completedFile?.verified && (
                <StatusMessage tone="success">
                  <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                  File verified with SHA-256.
                </StatusMessage>
              )}
            </div>
          )}

          {statusMessage && (!completedFile || status === "complete") && (
            <StatusMessage tone={status === "error" ? "error" : status === "complete" ? "success" : "quiet"}>
              <Radio size={14} className="mt-0.5 shrink-0" />
              {statusMessage}
            </StatusMessage>
          )}
        </div>

        {/* Right Column: Lane info */}
        <div className="sf-rise sf-rise-2 rounded-[1.6rem] bg-secondary p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <span className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">
              Private drop
            </span>
            <LockKeyhole size={17} className="text-accent" />
          </div>

          <div className="mt-14">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="text-sm font-bold text-primary">No permanent storage</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Text items ride the signaling channel and are not persisted. File bytes travel directly device to device. The session self-destructs on expiry.
            </p>
          </div>

          <div className="mt-10 border-t border-border pt-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Session</span>
              <span className="font-mono-ui">{session.sessionId.slice(0, 8)}…</span>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
              <span>Items</span>
              <span className="font-mono-ui">{session.lifedrop.items.length}</span>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleFinish}
        className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
      >
        <Check size={14} /> Done — close this drop
      </button>
    </PageContainer>
  );
}
