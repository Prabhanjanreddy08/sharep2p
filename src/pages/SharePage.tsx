import React, { useEffect, useRef, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageContainer } from "../components/PageHeader";
import { FileIcon } from "../components/FileIcon";
import { QrCodeDisplay } from "../components/QrCodeDisplay";
import { ExpiryTimer } from "../components/ExpiryTimer";
import { TransferStatus } from "../components/TransferStatus";
import { StatusMessage } from "../components/StatusMessage";
import { formatBytes } from "../components/Formatters";
import { getCachedActiveFiles, getCachedActiveFile, cacheActiveFiles, cacheActiveFile } from "../engine/fileCache";
import { startPeerConnection, ActiveSession } from "../engine/PeerConnection";
import { apiUrl } from "../config";
import { QrCode, Copy, Check, LockKeyhole, X, Radio, ArrowRight, Upload, Zap, Wifi, Globe, Files } from "lucide-react";

export function SharePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<ActiveSession | null>(() => {
    try {
      const saved = sessionStorage.getItem("sharefast-active-session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!sessionId || parsed.sessionId === sessionId) return parsed;
      }
    } catch {}
    return null;
  });

  const [files, setFiles] = useState<File[]>([]);
  const [currentFileMeta, setCurrentFileMeta] = useState<{ name: string; index: number; total: number } | null>(null);
  const [copied, setCopied] = useState<"otp" | "link" | "">("");
  const [status, setStatus] = useState<"connecting" | "waiting" | "connected" | "transferring" | "complete" | "error" | "disconnected">("waiting");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLocalDirect, setIsLocalDirect] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ transferred: 0, total: 0, speed: 0, eta: 0 });
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const progressRef = useRef(0);
  const statusRef = useRef(status);

  useEffect(() => {
    getCachedActiveFiles().then((cachedList) => {
      if (cachedList && cachedList.length > 0) {
        setFiles(cachedList);
      } else {
        getCachedActiveFile().then((single) => {
          if (single) setFiles([single]);
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!session) return;
    if (files.length === 0) {
      setStatus("error");
      statusRef.current = "error";
      setStatusMessage("The selected file(s) were cleared on page reload. Re-select below to resume sharing.");
      return;
    }

    setStatus("waiting");
    statusRef.current = "waiting";
    setStatusMessage("");

    const client = startPeerConnection({
      session,
      role: "sender",
      files,
      onEvent: (evt) => {
        if (evt.isLocalDirect !== undefined) {
          setIsLocalDirect(evt.isLocalDirect);
        }
        if (evt.type === "status") {
          // If transfer already reached 100% or complete, NEVER overwrite with error or disconnect!
          if (progressRef.current === 100 || statusRef.current === "complete") {
            console.log("SharePage ignoring status change after transfer completion:", evt.status);
            return;
          }
          setStatus(evt.status);
          statusRef.current = evt.status;
          if (evt.message) setStatusMessage(evt.message);
        } else if (evt.type === "progress") {
          setProgress(evt.progress);
          progressRef.current = evt.progress;
          if (evt.currentFileName) {
            setCurrentFileMeta({
              name: evt.currentFileName,
              index: (evt.fileIndex ?? 0) + 1,
              total: evt.totalFiles ?? files.length,
            });
          }
          if (evt.progress === 100) {
            setStatus("complete");
            statusRef.current = "complete";
          }
          setStats({
            transferred: evt.transferred,
            total: evt.total,
            speed: evt.speed,
            eta: evt.eta,
          });
        }
      },
    });

    return () => client.close();
  }, [session, files]);

  const handleCopy = async (text: string, type: "otp" | "link") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      setTimeout(() => setCopied(""), 1800);
    } catch {}
  };

  const handleCancel = async () => {
    if (session) {
      try {
        await fetch(apiUrl(`/api/sessions/${session.sessionId}?token=${encodeURIComponent(session.token)}`), { method: "DELETE" });
      } catch {}
    }
    cacheActiveFiles(null);
    cacheActiveFile(null);
    sessionStorage.removeItem("sharefast-active-session");
    navigate("/");
  };

  if (!session) {
    return (
      <PageContainer
        eyebrow="Share / missing lane"
        title={
          <>
            This lane
            <br />
            <em>isn’t here.</em>
          </>
        }
        description="The temporary sharing session may have expired, or this link was opened on a different device."
      >
        <div className="mt-10">
          <StatusMessage tone="error">
            <X size={15} className="mt-0.5 shrink-0" />
            No active session found on this device.
          </StatusMessage>
          <Link
            to="/send"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground"
            data-testid="link-start-new-share"
          >
            Start a new share <ArrowRight size={16} />
          </Link>
        </div>
      </PageContainer>
    );
  }

  const qrUrl = `${window.location.origin}/receive?token=${encodeURIComponent(session.token)}`;

  return (
    <PageContainer
      eyebrow="02 / Share"
      title={
        <>
          Your file is
          <br />
          <em>ready to go.</em>
        </>
      }
      description="Have the other device scan this code, or send the six-digit code another way."
    >
      <div className="mt-10 grid w-full min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* Left Column: QR Code + One-time code */}
        <div className="sf-rise sf-rise-1 flex w-full min-w-0 flex-col items-center self-start rounded-[1.6rem] bg-primary p-6 text-background sm:p-8 lg:sticky lg:top-8">
          <div className="mb-5 flex w-full items-center justify-between text-xs text-background/60">
            <span className="font-mono-ui uppercase tracking-[.12em]">Scan to pair</span>
            <QrCode size={17} />
          </div>

          <div className="w-full max-w-[250px] flex justify-center">
            <QrCodeDisplay value={qrUrl} />
          </div>

          <div className="mt-6 flex w-full items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[.14em] text-background/50">One-time code</p>
              <p className="mt-1 font-mono-ui text-3xl font-bold tracking-[.22em]" data-testid="text-share-otp">
                {session.otp}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(session.otp, "otp")}
              className="rounded-lg border border-background/20 p-2.5 text-background/70 hover:bg-background/10"
              aria-label="Copy one-time code"
              data-testid="button-copy-otp"
            >
              {copied === "otp" ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* Right Column: File details, Transfer Status, Actions */}
        <div className="sf-rise sf-rise-2 w-full min-w-0 space-y-5">
          <div className="w-full min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex w-full min-w-0 items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-secondary text-primary">
                  {session.files && session.files.length > 1 ? (
                    <Files size={22} className="text-accent" />
                  ) : (
                    <FileIcon type={session.fileType} />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-primary" title={session.fileName} data-testid="text-share-file">
                    {session.fileName}
                  </p>
                  <p className="mt-1 truncate font-mono-ui text-[10px] text-muted-foreground">
                    {formatBytes(session.fileSize)} / {session.files && session.files.length > 1 ? `${session.files.length} files package` : session.fileType || "file"}
                  </p>
                </div>
              </div>
              <ExpiryTimer expiresAt={session.expiresAt} />
            </div>

            {/* If multi-file, show clean scrollable file list */}
            {session.files && session.files.length > 1 && (
              <div className="mt-4 max-h-[160px] space-y-1.5 overflow-y-auto pr-1 border-t border-border/60 pt-3">
                {session.files.map((f, idx) => {
                  const isCurrent = currentFileMeta && currentFileMeta.name === f.fileName;
                  const isPast = currentFileMeta && (currentFileMeta.index - 1) > idx;
                  return (
                    <div
                      key={`${f.fileName}-${idx}`}
                      className={`flex items-center justify-between rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                        isCurrent
                          ? "bg-accent/15 border border-accent/40 font-semibold text-primary"
                          : isPast
                          ? "bg-secondary/40 text-muted-foreground"
                          : "bg-secondary/60 text-foreground"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="shrink-0 text-muted-foreground font-mono-ui text-[10px]">
                          {idx + 1}.
                        </span>
                        <span className="truncate">{f.fileName}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 font-mono-ui text-[10px]">
                        <span>{formatBytes(f.fileSize)}</span>
                        {isCurrent && <span className="text-accent font-bold animate-pulse">● sending</span>}
                        {isPast && <span className="text-emerald-400 font-bold">✓ sent</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-secondary px-3 py-2.5 text-xs text-muted-foreground">
              <LockKeyhole size={14} className="shrink-0 text-accent" />
              <span className="truncate">File bytes travel directly device to device.</span>
            </div>
          </div>

          <TransferStatus
            connected={status === "connected" || status === "transferring" || status === "complete"}
            isLocalDirect={isLocalDirect}
            progress={progress}
            speed={stats.speed}
            transferred={stats.transferred}
            total={stats.total || session.fileSize || 0}
            eta={stats.eta}
            label={
              progress === 100
                ? "Transfer complete"
                : status === "transferring"
                ? currentFileMeta
                  ? `Sending (${currentFileMeta.index}/${currentFileMeta.total}): ${currentFileMeta.name}`
                  : "Sending directly"
                : status === "connected"
                ? "Receiver connected"
                : status === "error"
                ? "Connection needs attention"
                : "Waiting for receiver"
            }
          />

          {/* Universal Transfer & Infinite Size Guide */}
          <div className="flex items-start gap-2.5 rounded-xl border border-accent/25 bg-accent/10 p-3.5 text-xs text-accent">
            <Globe size={16} className="mt-0.5 shrink-0 text-accent" />
            <div className="space-y-1">
              <p className="font-bold text-primary">
                Universal Transfer (Mobile Data, Wi-Fi & Low Signal Ready)
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Transfers files reliably across <strong>any cellular network</strong>, <strong>low signals (10 kb/s)</strong>, or <strong>separate connections</strong>. Handles <strong>100GB+ and infinite file sizes</strong> with disk-streaming memory protection.
                <span className="block mt-1 text-[11px] text-accent font-semibold">
                  ⚡ <em>Optional LAN boost:</em> If both devices are on the same Wi-Fi or Hotspot, it automatically accelerates to 100MB/s+ LAN mode.
                </span>
              </p>
            </div>
          </div>

          {statusMessage && status !== "complete" && progress !== 100 && (
            <StatusMessage tone={status === "error" ? "error" : "quiet"}>
              <Radio size={14} className="mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="break-words">{statusMessage}</span>
                {files.length === 0 && (
                  <div className="mt-3">
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={(e) => {
                        const selected = e.target.files ? Array.from(e.target.files) : [];
                        if (selected.length > 0) {
                          cacheActiveFiles(selected);
                          cacheActiveFile(selected[0]);
                          setFiles(selected);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground transition-transform hover:-translate-y-0.5"
                    >
                      <Upload size={13} /> Re-select {session?.fileName || "file(s)"}
                    </button>
                  </div>
                )}
              </div>
            </StatusMessage>
          )}

          <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleCopy(qrUrl, "link")}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-bold text-primary hover:bg-secondary"
              data-testid="button-copy-link"
            >
              {copied === "link" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-0.5"
              data-testid="button-cancel-session"
            >
              <X size={16} /> Cancel session
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
            <span className="inline-flex min-w-0 items-center gap-1.5">
              <LockKeyhole size={14} className="shrink-0 text-accent" />
              <span className="truncate">File bytes never touch the signaling server</span>
            </span>
            <span className="font-mono-ui max-w-full break-all text-[11px]">signal {session.signalingPath}</span>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
