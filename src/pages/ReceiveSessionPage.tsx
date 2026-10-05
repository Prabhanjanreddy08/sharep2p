import React, { useEffect, useState, useRef } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { PageContainer } from "../components/PageHeader";
import { FileIcon } from "../components/FileIcon";
import { TransferStatus } from "../components/TransferStatus";
import { StatusMessage } from "../components/StatusMessage";
import { ExpiryTimer } from "../components/ExpiryTimer";
import { formatBytes } from "../components/Formatters";
import { startPeerConnection, ActiveSession, ReceivedFile } from "../engine/PeerConnection";
import { LockKeyhole, MonitorDown, ShieldCheck, Check, X, Radio, ArrowRight, Zap, Globe, Files, Download } from "lucide-react";

interface CompletedItem {
  blob: Blob;
  fileName: string;
  fileSize: number;
  fileType: string;
  verified: boolean;
  downloadUrl: string;
}

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
  const [completedFiles, setCompletedFiles] = useState<CompletedItem[]>([]);
  const [savedFileNames, setSavedFileNames] = useState<Set<string>>(new Set());
  const [isSavingAll, setIsSavingAll] = useState(false);
  const [currentFileMeta, setCurrentFileMeta] = useState<{ name: string; index: number; total: number } | null>(null);

  const completedFilesRef = useRef<CompletedItem[]>([]);
  const progressRef = useRef(0);
  const createdUrlsRef = useRef<string[]>([]);

  // Revoke object URLs on component unmount
  useEffect(() => {
    return () => {
      for (const url of createdUrlsRef.current) {
        try {
          URL.revokeObjectURL(url);
        } catch {}
      }
    };
  }, []);

  const createDownloadItem = (file: { blob: Blob; fileName: string; fileSize?: number; fileType?: string; verified: boolean }): CompletedItem => {
    const downloadUrl = URL.createObjectURL(file.blob);
    createdUrlsRef.current.push(downloadUrl);
    return {
      blob: file.blob,
      fileName: file.fileName,
      fileSize: file.fileSize ?? file.blob.size,
      fileType: file.fileType || "application/octet-stream",
      verified: file.verified,
      downloadUrl,
    };
  };

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
          // If we already finished or have completed files, NEVER revert back to disconnected or error!
          if (completedFilesRef.current.length > 0 || progressRef.current === 100) {
            console.log("Ignoring status change after transfer completion:", evt.status);
            return;
          }
          setStatus(evt.status);
          if (evt.message) setStatusMessage(evt.message);
        } else if (evt.type === "progress") {
          setProgress(evt.progress);
          progressRef.current = evt.progress;
          if (evt.currentFileName) {
            setCurrentFileMeta({
              name: evt.currentFileName,
              index: (evt.fileIndex ?? 0) + 1,
              total: evt.totalFiles ?? (session.files?.length || 1),
            });
          }
          setStats({
            transferred: evt.transferred,
            total: evt.total,
            speed: evt.speed,
            eta: evt.eta,
          });
        } else if (evt.type === "file-complete") {
          const newItem = createDownloadItem(evt.file);
          setCompletedFiles((prev) => {
            const exists = prev.some((p) => p.fileName === newItem.fileName && p.fileSize === newItem.fileSize);
            const updated = exists ? prev : [...prev, newItem];
            completedFilesRef.current = updated;
            return updated;
          });
        } else if (evt.type === "complete") {
          let finalItems: CompletedItem[] = [];
          if (evt.files && evt.files.length > 0) {
            finalItems = evt.files.map((f) => createDownloadItem(f));
          } else if (evt.blob && evt.fileName) {
            finalItems = [
              createDownloadItem({
                blob: evt.blob,
                fileName: evt.fileName,
                fileType: evt.fileType,
                verified: evt.verified,
              }),
            ];
          }
          if (finalItems.length > 0) {
            completedFilesRef.current = finalItems;
            setCompletedFiles(finalItems);
          }
          setStatus("complete");
          setProgress(100);
          progressRef.current = 100;
          setStatusMessage("Transfer complete! File(s) are ready on this device.");
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

  const handleSaveFile = async (item: CompletedItem) => {
    const safeName = item.fileName.replace(/[/\\?%*:|"<>]/g, "_").trim() || "download";

    // 1. Desktop Chromium: showSaveFilePicker with explicit writable.write and writable.close
    if (typeof (window as any).showSaveFilePicker === "function") {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: safeName,
        });
        const writable = await handle.createWritable();
        await writable.write(item.blob);
        await writable.close();
        setSavedFileNames((prev) => new Set(prev).add(item.fileName));
        return;
      } catch (err: any) {
        if (err.name === "AbortError") return; // User cancelled save dialog
        console.warn("showSaveFilePicker failed, falling back to anchor download:", err);
      }
    }

    // 2. Mobile (Android/iOS) & Standard browser fallback: Anchor tag click
    try {
      const a = document.createElement("a");
      a.href = item.downloadUrl;
      a.download = safeName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setSavedFileNames((prev) => new Set(prev).add(item.fileName));
    } catch (e) {
      console.error("Failed to trigger download anchor:", e);
    }
  };

  const handleSaveAllFiles = async () => {
    if (completedFiles.length === 0 || isSavingAll) return;
    setIsSavingAll(true);
    for (let i = 0; i < completedFiles.length; i++) {
      await handleSaveFile(completedFiles[i]);
      // Small pause between multiple mobile downloads prevents browser popup blocker
      await new Promise((r) => setTimeout(r, 350));
    }
    setIsSavingAll(false);
  };

  const handleFinish = () => {
    sessionStorage.removeItem("sharefast-active-session");
    navigate("/");
  };

  const totalFilesExpected = session.files?.length || 1;
  const isAllComplete = progress === 100 && completedFiles.length > 0;

  return (
    <PageContainer
      eyebrow="02 / Receive"
      title={
        isAllComplete ? (
          <>
            It’s here.
            <br />
            <em>Keep it safe.</em>
          </>
        ) : (
          <>
            {totalFilesExpected > 1 ? "Files are" : "A file is"}
            <br />
            <em>on the way.</em>
          </>
        )
      }
      description={
        isAllComplete
          ? "The transfer is complete. Save the file(s) to this device when you’re ready."
          : "The devices are paired. The transfer starts automatically over the direct link."
      }
    >
      <div className="mt-10 grid w-full min-w-0 gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        {/* Left Column: File & transfer progress */}
        <div className="sf-rise sf-rise-1 w-full min-w-0 rounded-[1.6rem] border border-border bg-card p-6 sm:p-8">
          <div className="flex w-full min-w-0 items-start gap-4">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-secondary text-primary">
              {session.files && session.files.length > 1 ? (
                <Files size={26} className="text-accent" />
              ) : (
                <FileIcon type={session.fileType} size={26} />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="break-all text-xl font-bold tracking-[-.03em] text-primary" data-testid="text-receive-file">
                {session.fileName}
              </p>
              <p className="mt-1 font-mono-ui text-xs text-muted-foreground">
                {formatBytes(session.fileSize)} / {session.files && session.files.length > 1 ? `${session.files.length} files` : session.fileType || "file"}
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
                isAllComplete
                  ? "Ready on this device"
                  : status === "transferring"
                  ? currentFileMeta
                    ? `Receiving (${currentFileMeta.index}/${currentFileMeta.total}): ${currentFileMeta.name}`
                    : "Receiving directly"
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

          {statusMessage && (completedFiles.length === 0 || status === "complete") && (
            <div className="mt-4">
              <StatusMessage tone={status === "error" ? "error" : status === "complete" ? "success" : "quiet"}>
                <Radio size={14} className="mt-0.5 shrink-0" />
                <span className="break-words">{statusMessage}</span>
              </StatusMessage>
            </div>
          )}

          {/* Completed Files Download Area */}
          {completedFiles.length > 0 && (
            <div className="mt-6 space-y-4">
              {completedFiles.length > 1 && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-primary">
                    Received {completedFiles.length} of {totalFilesExpected} files
                  </span>
                  <button
                    type="button"
                    onClick={handleSaveAllFiles}
                    disabled={isSavingAll}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-bold text-accent-foreground shadow-sm transition-transform hover:-translate-y-0.5 disabled:opacity-50"
                  >
                    <Download size={13} /> {isSavingAll ? "Saving…" : "Save all files"}
                  </button>
                </div>
              )}

              {/* Individual file cards with direct save button */}
              <div className="space-y-2.5 max-h-[340px] overflow-y-auto pr-1">
                {completedFiles.map((item, idx) => {
                  const isSaved = savedFileNames.has(item.fileName);
                  return (
                    <div
                      key={`${item.fileName}-${idx}`}
                      className="flex flex-col gap-3 rounded-xl border border-border/80 bg-secondary/50 p-4 transition-colors hover:border-accent/40 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-card text-primary shadow-sm">
                          <FileIcon type={item.fileType} size={18} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-primary" title={item.fileName}>
                            {item.fileName}
                          </p>
                          <div className="mt-0.5 flex items-center gap-2 font-mono-ui text-[11px] text-muted-foreground">
                            <span>{formatBytes(item.fileSize)}</span>
                            {item.verified ? (
                              <span className="inline-flex items-center gap-0.5 text-emerald-400 font-semibold">
                                <ShieldCheck size={12} /> SHA-256 verified
                              </span>
                            ) : (
                              <span className="text-amber-400">Unverified</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleSaveFile(item)}
                        className={`inline-flex shrink-0 min-h-10 items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-all shadow-sm active:scale-[0.98] ${
                          isSaved
                            ? "bg-secondary text-primary border border-border"
                            : "bg-primary text-background hover:-translate-y-0.5"
                        }`}
                        data-testid={`button-save-file-${idx}`}
                      >
                        {isSaved ? (
                          <>
                            <Check size={14} className="text-emerald-400" /> Saved (Tap to re-save)
                          </>
                        ) : (
                          <>
                            <MonitorDown size={14} /> Save to device
                          </>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              {savedFileNames.size > 0 && (
                <p className="text-center font-mono-ui text-[11px] text-emerald-400">
                  ✓ File saved! Check your browser’s downloads or notification tray.
                </p>
              )}
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

