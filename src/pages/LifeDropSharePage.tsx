import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageContainer } from "../components/PageHeader";
import { QrCodeDisplay } from "../components/QrCodeDisplay";
import { ExpiryTimer } from "../components/ExpiryTimer";
import { TransferStatus } from "../components/TransferStatus";
import { StatusMessage } from "../components/StatusMessage";
import { LifeDropItemCompact } from "../components/LifeDropItemCard";
import { formatBytes } from "../components/Formatters";
import { getCachedActiveFile } from "../engine/fileCache";
import { startPeerConnection, ActiveSession } from "../engine/PeerConnection";
import { LifeDropItem, LifeDropSession } from "../engine/lifedrop";
import { apiUrl } from "../config";
import {
  QrCode,
  Copy,
  Check,
  LockKeyhole,
  X,
  Radio,
  ArrowRight,
  Package,
  Flame,
  Sparkles,
} from "lucide-react";

export function LifeDropSharePage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const [session, setSession] = useState<LifeDropSession | null>(() => {
    try {
      const saved = sessionStorage.getItem("sharefast-active-session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.lifedrop && (!sessionId || parsed.sessionId === sessionId)) return parsed;
      }
    } catch {}
    return null;
  });

  const [items, setItems] = useState<LifeDropItem[]>(() => {
    try {
      const saved = sessionStorage.getItem("lifedrop-items");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [copied, setCopied] = useState<"otp" | "link" | "">("");
  const [status, setStatus] = useState<"connecting" | "waiting" | "connected" | "transferring" | "complete" | "error" | "disconnected">("waiting");
  const [statusMessage, setStatusMessage] = useState("");
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ transferred: 0, total: 0, speed: 0, eta: 0 });

  // Only connect WebRTC if there are file items to transfer
  const fileItems = items.filter((i) => (i.kind === "file" || i.kind === "photo") && i.fileRef);

  useEffect(() => {
    if (!session || fileItems.length === 0) return;

    // For the WebRTC transfer, we use the first file item
    // In future, multi-file transfer can be implemented
    const firstFileItem = fileItems[0];
    if (!firstFileItem?.fileRef) return;

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
      role: "sender",
      file: firstFileItem.fileRef,
      onEvent: (evt) => {
        if (evt.type === "status") {
          setStatus(evt.status);
          if (evt.message) setStatusMessage(evt.message);
        } else if (evt.type === "progress") {
          setProgress(evt.progress);
          setStats({ transferred: evt.transferred, total: evt.total, speed: evt.speed, eta: evt.eta });
        }
      },
    });

    return () => client.close();
  }, [session]);

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
    sessionStorage.removeItem("sharefast-active-session");
    sessionStorage.removeItem("lifedrop-items");
    navigate("/");
  };

  if (!session) {
    return (
      <PageContainer
        eyebrow="LifeDrop / missing"
        title={<>This drop<br /><em>isn't here.</em></>}
        description="The LifeDrop session may have expired, or this link was opened on a different device."
      >
        <div className="mt-10">
          <StatusMessage tone="error">
            <X size={15} className="mt-0.5 shrink-0" />
            No active LifeDrop session found.
          </StatusMessage>
          <Link
            to="/lifedrop/create"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground"
          >
            Create a new LifeDrop <ArrowRight size={16} />
          </Link>
        </div>
      </PageContainer>
    );
  }

  const qrUrl = `${window.location.origin}/receive?token=${encodeURIComponent(session.token)}`;
  const textItems = (session.lifedrop?.items || []).filter(
    (i) => i.kind !== "file" && i.kind !== "photo"
  );
  const allFileItems = (session.lifedrop?.items || []).filter(
    (i) => i.kind === "file" || i.kind === "photo"
  );
  const hasFiles = allFileItems.length > 0;

  return (
    <PageContainer
      eyebrow="02 / LifeDrop"
      title={<>Your drop is<br /><em>ready to go.</em></>}
      description="Have the other device scan this code. Text items transfer instantly — files go peer-to-peer."
    >
      <div className="mt-10 grid w-full min-w-0 items-start gap-5 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        {/* Left Column: QR + OTP (compact height) */}
        <div className="sf-rise sf-rise-1 flex w-full min-w-0 flex-col items-center self-start rounded-[1.6rem] bg-primary p-6 text-background sm:p-8 lg:sticky lg:top-8">
          <div className="mb-5 flex w-full items-center justify-between text-xs text-background/60">
            <span className="font-mono-ui uppercase tracking-[.12em]">Scan to pick up</span>
            <QrCode size={17} />
          </div>

          <div className="w-full max-w-[250px] flex justify-center">
            <QrCodeDisplay value={qrUrl} />
          </div>

          <div className="mt-6 flex w-full items-end justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[.14em] text-background/50">One-time code</p>
              <p className="mt-1 font-mono-ui text-3xl font-bold tracking-[.22em]">
                {session.otp}
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(session.otp, "otp")}
              className="rounded-lg border border-background/20 p-2.5 text-background/70 hover:bg-background/10"
              aria-label="Copy one-time code"
            >
              {copied === "otp" ? <Check size={16} /> : <Copy size={16} />}
            </button>
          </div>
        </div>

        {/* Right Column: Package summary */}
        <div className="sf-rise sf-rise-2 w-full min-w-0 space-y-4">
          {/* Package header */}
          <div className="w-full min-w-0 rounded-2xl border border-border bg-card p-5 sm:p-6">
            <div className="flex w-full min-w-0 items-start justify-between gap-4">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
                  <Package size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-primary" title={session.lifedrop?.title || "LifeDrop"}>
                    {session.lifedrop?.title || "LifeDrop"}
                  </p>
                  <p className="mt-1 truncate font-mono-ui text-[10px] text-muted-foreground">
                    {(session.lifedrop?.items || []).length} items
                    {session.lifedrop?.totalFileSize ? ` · ${formatBytes(session.lifedrop.totalFileSize)} files` : ""}
                  </p>
                </div>
              </div>
              <ExpiryTimer expiresAt={session.expiresAt} />
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {session.lifedrop?.burnAfterPickup && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/10 px-2.5 py-1 text-[10px] font-bold text-destructive">
                  <Flame size={12} /> Burns after pickup
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/10 px-2.5 py-1 text-[10px] font-bold text-accent">
                <Sparkles size={12} /> {(session.lifedrop?.items || []).length} items
              </span>
            </div>
          </div>

          {/* Item list */}
          <div className="max-h-[300px] w-full min-w-0 space-y-2 overflow-y-auto rounded-2xl border border-border bg-card p-4">
            {(session.lifedrop?.items || []).map((item, idx) => (
              <LifeDropItemCompact key={item.id} item={item} index={idx} />
            ))}
          </div>

          {/* File transfer status (only if there are files) */}
          {hasFiles && (
            <TransferStatus
              connected={status === "connected" || status === "transferring" || status === "complete"}
              progress={progress}
              speed={stats.speed}
              transferred={stats.transferred}
              total={stats.total || session.lifedrop?.totalFileSize || session.fileSize || 0}
              eta={stats.eta}
              label={
                progress === 100
                  ? "Files delivered"
                  : status === "transferring"
                  ? "Sending files directly"
                  : status === "connected"
                  ? "Receiver connected"
                  : "Waiting for receiver"
              }
            />
          )}

          {statusMessage && (
            <StatusMessage tone={status === "error" ? "error" : "quiet"}>
              <Radio size={14} className="mt-0.5 shrink-0" />
              <span className="break-words">{statusMessage}</span>
            </StatusMessage>
          )}

          {/* Actions */}
          <div className="grid w-full min-w-0 gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => handleCopy(qrUrl, "link")}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border bg-card text-sm font-bold text-primary hover:bg-secondary"
            >
              {copied === "link" ? <Check size={16} /> : <Copy size={16} />}
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-0.5"
            >
              <X size={16} /> Cancel drop
            </button>
          </div>

          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole size={14} className="shrink-0 text-accent" />
            <span className="truncate">Text items travel via the signaling channel. File bytes go peer-to-peer.</span>
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
