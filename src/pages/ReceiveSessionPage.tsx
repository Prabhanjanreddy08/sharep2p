import React, { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageContainer } from "../components/PageHeader";
import { FileIcon } from "../components/FileIcon";
import { TransferStatus } from "../components/TransferStatus";
import { StatusMessage } from "../components/StatusMessage";
import { ExpiryTimer } from "../components/ExpiryTimer";
import { formatBytes } from "../components/Formatters";
import { startPeerConnection, ActiveSession } from "../engine/PeerConnection";
import { LockKeyhole, MonitorDown, ShieldCheck, Check, X, Radio, ArrowRight, Zap, Globe } from "lucide-react";

export function ReceiveSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const [session] = useState<ActiveSession | null>(() => {
    try {
      const saved = sessionStorage.getItem("sharefast-active-session");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (!sessionId || parsed.sessionId === sessionId) return parsed;
      }
    } catch {}
    return null;
  });

  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState({ transferred: 0, total: 0, speed: 0, eta: 0 });
  const [status, setStatus] = useState<"connecting" | "waiting" | "connected" | "transferring" | "complete" | "error" | "disconnected">("connecting");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLocalDirect, setIsLocalDirect] = useState(false);
  const [completedFile, setCompletedFile] = useState<{
    blob: Blob;
    fileName: string;
    verified: boolean;
  } | null>(null);

  useEffect(() => {
    if (!session) return;

    const client = startPeerConnection({
      session,
      role: "receiver",
      onEvent: (evt) => {
        if (evt.isLocalDirect !== undefined) {
          setIsLocalDirect(evt.isLocalDirect);
        }
        if (evt.type === "status") {
          setStatus(evt.status);
          if (evt.message) setStatusMessage(evt.message);
        } else if (evt.type === "progress") {
          setProgress(evt.progress);
          setStats({
            transferred: evt.transferred,
            total: evt.total,
            speed: evt.speed,
            eta: evt.eta,
          });
        } else if (evt.type === "complete") {
          setCompletedFile({
            blob: evt.blob,
            fileName: evt.fileName,
            verified: evt.verified,
          });
        }
      },
    });

    return () => client.close();
  }, [session]);

  if (!session) {
    return (
      <PageContainer
        eyebrow="Receive / missing lane"
        title={
          <>
            No file
            <br />
            <em>found.</em>
          </>
        }
        description="This pairing lane may have expired or belongs to another browser."
      >
        <div className="mt-10">
          <StatusMessage tone="error">
            <X size={15} className="mt-0.5 shrink-0" />
            Pair again from the sender’s screen.
          </StatusMessage>
          <Link
            to="/receive"
            className="mt-5 inline-flex items-center gap-2 rounded-xl bg-accent px-5 py-3 text-sm font-bold text-accent-foreground"
            data-testid="link-try-receive-again"
          >
            Try another code <ArrowRight size={16} />
          </Link>
        </div>
      </PageContainer>
    );
  }

  const handleSave = () => {
    if (!completedFile) return;
    const safeName = completedFile.fileName.replace(/[/\\?%*:|"<>]/g, "_").trim() || "download";
    const url = URL.createObjectURL(completedFile.blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = safeName;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 60000);
  };

  const handleFinish = () => {
    sessionStorage.removeItem("sharefast-active-session");
    navigate("/");
  };

  return (
    <PageContainer
      eyebrow="02 / Receive"
      title={
        progress === 100 ? (
          <>
            It’s here.
            <br />
            <em>Keep it safe.</em>
          </>
        ) : (
          <>
            A file is
            <br />
            <em>on its way.</em>
          </>
        )
      }
      description={
        progress === 100
          ? "The transfer is complete. Save the file to this device when you’re ready."
          : "The devices are paired. The transfer starts automatically over the direct link."
      }
    >
      <div className="mt-10 grid w-full min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {/* Left Column: File & transfer progress */}
        <div className="sf-rise sf-rise-1 w-full min-w-0 rounded-[1.6rem] border border-border bg-card p-6 sm:p-8">
          <div className="flex w-full min-w-0 items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
              <FileIcon type={session.fileType} size={26} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-all text-xl font-bold tracking-[-.03em] text-primary" data-testid="text-receive-file">
                {session.fileName}
              </p>
              <p className="mt-1 font-mono-ui text-xs text-muted-foreground">
                {formatBytes(session.fileSize)} / {session.fileType || "file"}
              </p>
            </div>
          </div>

          <div className="mt-10 space-y-4">
            <TransferStatus
              connected={status === "connected" || status === "transferring" || status === "complete"}
              isLocalDirect={isLocalDirect}
              progress={progress}
              speed={stats.speed}
              transferred={stats.transferred}
              total={session.fileSize}
              eta={stats.eta}
              label={
                progress === 100
                  ? "Ready on this device"
                  : status === "transferring"
                  ? "Receiving directly"
                  : status === "connected"
                  ? "Direct link established"
                  : status === "error"
                  ? "Connection needs attention"
                  : "Connecting to sender"
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
                  Receives files reliably across <strong>any cellular network</strong>, <strong>low signals (10 kb/s)</strong>, or <strong>separate connections</strong>. Handles <strong>100GB+ and infinite file sizes</strong> with disk-streaming memory protection.
                  <span className="block mt-1 text-[11px] text-accent font-semibold">
                    ⚡ <em>Optional LAN boost:</em> If both devices are on the same Wi-Fi or Hotspot, it automatically accelerates to 100MB/s+ LAN mode.
                  </span>
                </p>
              </div>
            </div>
          </div>

          {statusMessage && (
            <div className="mt-4">
              <StatusMessage tone={status === "error" || status === "disconnected" ? "error" : "quiet"}>
                <Radio size={14} className="mt-0.5 shrink-0" />
                <span className="break-words">{statusMessage}</span>
              </StatusMessage>
            </div>
          )}

          {completedFile && (
            <button
              type="button"
              onClick={handleSave}
              className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-background"
              data-testid="button-save-file"
            >
              <MonitorDown size={16} /> Save to this device
            </button>
          )}

          {completedFile?.verified && (
            <div className="mt-4">
              <StatusMessage tone="success">
                <ShieldCheck size={15} className="mt-0.5 shrink-0" />
                File verified with SHA-256.
              </StatusMessage>
            </div>
          )}

          {completedFile && !completedFile.verified && (
            <div className="mt-4">
              <StatusMessage tone="error">
                <X size={15} className="mt-0.5 shrink-0" />
                File verification failed. Do not save this copy.
              </StatusMessage>
            </div>
          )}
        </div>

        {/* Right Column: Lane info */}
        <div className="sf-rise sf-rise-2 w-full min-w-0 rounded-[1.6rem] bg-secondary p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <span className="font-mono-ui text-[10px] uppercase tracking-[.15em] text-muted-foreground">
              Private lane
            </span>
            <LockKeyhole size={17} className="text-accent" />
          </div>

          <div className="mt-14">
            <div className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full bg-accent" />
              <span className="text-sm font-bold text-primary">No cloud copy</span>
            </div>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              The bytes travel directly from the sender to this device. The pairing signal disappears when the session closes.
            </p>
          </div>

          <div className="mt-10 border-t border-border pt-5">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Session</span>
              <span className="font-mono-ui" data-testid="text-session-id">
                {session.sessionId.slice(0, 8)}…
              </span>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={handleFinish}
        className="mt-7 inline-flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground"
        data-testid="button-finish-session"
      >
        <Check size={14} /> Finish and close lane
      </button>
    </PageContainer>
  );
}
