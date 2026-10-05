import React, { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/Layout";
import { BackButton } from "../components/BackButton";
import { FileIcon } from "../components/FileIcon";
import { StatusMessage } from "../components/StatusMessage";
import { formatBytes } from "../components/Formatters";
import { cacheActiveFiles } from "../engine/fileCache";
import { apiUrl } from "../config";
import { Upload, X, ArrowRight, LockKeyhole, RefreshCw, Plus, Trash2, Files } from "lucide-react";

export function SendPage() {
  const navigate = useNavigate();
  const [files, setFiles] = useState<File[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState("");
  const [isPending, setIsPending] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const handleAddFiles = (newFiles: File[]) => {
    if (!newFiles || newFiles.length === 0) return;
    setError("");
    setFiles((prev) => {
      const existingKeys = new Set(prev.map((f) => `${f.name}-${f.size}-${f.lastModified}`));
      const filtered = newFiles.filter((f) => !existingKeys.has(`${f.name}-${f.size}-${f.lastModified}`));
      const updated = [...prev, ...filtered];
      cacheActiveFiles(updated);
      return updated;
    });
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => {
      const updated = prev.filter((_, i) => i !== index);
      cacheActiveFiles(updated.length > 0 ? updated : null);
      if (updated.length === 0 && inputRef.current) {
        inputRef.current.value = "";
      }
      return updated;
    });
  };

  const handleClearAll = () => {
    setFiles([]);
    cacheActiveFiles(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const totalSize = files.reduce((acc, f) => acc + f.size, 0);

  const handleCreateSession = async () => {
    if (files.length === 0) return;
    setError("");
    setIsPending(true);

    try {
      await cacheActiveFiles(files);

      const filesMeta = files.map((f) => ({
        fileName: f.name,
        fileSize: f.size,
        fileType: f.type || "application/octet-stream",
      }));

      const res = await fetch(apiUrl("/api/sessions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fileName: files.length === 1 ? files[0].name : `${files.length} files package`,
          fileSize: totalSize,
          fileType: files.length === 1 ? (files[0].type || "application/octet-stream") : "application/octet-stream",
          files: filesMeta,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not open a sharing lane. Try again.");
      }

      const session = await res.json();
      sessionStorage.setItem("sharefast-active-session", JSON.stringify(session));
      navigate(`/share/${session.sessionId}`);
    } catch (err: any) {
      setError(err.message || "Could not open a sharing lane. Try again.");
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Layout>
      <main className="mx-auto w-full max-w-3xl min-w-0 px-4 pb-20 pt-8 sm:px-8 sm:pt-12">
        <BackButton />
        <div className="sf-rise">
          <span className="font-mono-ui text-[10px] font-bold uppercase tracking-[.18em] text-accent">
            01 / Send
          </span>
          <h1 className="mt-4 font-display text-5xl leading-[.95] tracking-[-.045em] text-primary sm:text-7xl">
            Choose something
            <br />
            <em>worth moving.</em>
          </h1>
          <p className="mt-6 max-w-md text-sm leading-6 text-muted-foreground">
            Select one or multiple files. They stay on this device until the other one is ready. Nothing is uploaded to any server.
          </p>
        </div>

        <div
          className={`sf-rise sf-rise-1 mt-10 rounded-[1.6rem] border-2 border-dashed p-5 transition-colors sm:p-8 ${
            isDragOver ? "border-accent bg-accent/5" : "border-border bg-card"
          }`}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragOver(true);
          }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragOver(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              handleAddFiles(Array.from(e.dataTransfer.files));
            }
          }}
          data-testid="dropzone-file"
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                handleAddFiles(Array.from(e.target.files));
                e.target.value = "";
              }
            }}
            data-testid="input-file"
          />

          {files.length === 0 ? (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="flex min-h-[260px] w-full flex-col items-center justify-center rounded-xl px-4 text-center transition-colors hover:bg-secondary"
              data-testid="button-choose-file"
            >
              <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-md transition-transform hover:scale-105">
                <Upload size={24} />
              </span>
              <span className="mt-5 text-xl font-bold text-primary">Drop files here</span>
              <span className="mt-1 text-sm text-muted-foreground">
                or choose one or multiple files from this device
              </span>
              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full border border-border px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  Single or Multiple files
                </span>
                <span className="rounded-full border border-border px-3 py-1 font-mono-ui text-[10px] uppercase tracking-[.12em] text-muted-foreground">
                  Any file type
                </span>
              </div>
            </button>
          ) : files.length === 1 ? (
            <div className="flex min-h-[250px] flex-col justify-between rounded-xl bg-secondary p-5 sm:p-7">
              <div className="flex items-start justify-between">
                <span className="grid h-14 w-14 place-items-center rounded-2xl bg-primary text-background shadow-md">
                  <FileIcon type={files[0].type} size={25} />
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:border-accent/40"
                  >
                    <Plus size={14} /> Add more files
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="rounded-full p-2 text-muted-foreground hover:bg-background hover:text-foreground"
                    aria-label="Remove selected file"
                    data-testid="button-remove-file"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div>
                <p className="break-all text-xl font-bold tracking-[-.03em] text-primary" data-testid="text-selected-file">
                  {files[0].name}
                </p>
                <p className="mt-1 font-mono-ui text-xs text-muted-foreground">
                  {formatBytes(files[0].size)} <span className="mx-1">/</span> {files[0].type || "Unknown type"}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col rounded-xl bg-secondary p-5 sm:p-6">
              {/* Header */}
              <div className="flex items-center justify-between border-b border-border/70 pb-4">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent text-accent-foreground shadow-sm">
                    <Files size={20} />
                  </span>
                  <div>
                    <p className="text-base font-bold text-primary">
                      {files.length} files selected
                    </p>
                    <p className="font-mono-ui text-xs text-muted-foreground">
                      {formatBytes(totalSize)} total
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:border-accent/40"
                  >
                    <Plus size={14} /> Add more
                  </button>
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <Trash2 size={13} /> Clear all
                  </button>
                </div>
              </div>

              {/* Scrollable file list */}
              <div className="mt-3 max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {files.map((f, idx) => (
                  <div
                    key={`${f.name}-${idx}`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-card p-3 transition-colors hover:border-accent/30"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-primary">
                        <FileIcon type={f.type} size={18} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-primary">{f.name}</p>
                        <p className="font-mono-ui text-[10px] text-muted-foreground">
                          {formatBytes(f.size)} · {f.type || "file"}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(idx)}
                      className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X size={15} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mt-4">
            <StatusMessage tone="error">
              <X size={15} className="mt-0.5 shrink-0" />
              {error}
            </StatusMessage>
          </div>
        )}

        <div className="sf-rise sf-rise-2 mt-5 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <LockKeyhole size={14} className="text-accent" /> Temporary private session
          </div>
          <button
            type="button"
            disabled={files.length === 0 || isPending}
            onClick={handleCreateSession}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-accent px-6 text-sm font-bold text-accent-foreground transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            data-testid="button-create-session"
          >
            {isPending ? (
              <>
                <RefreshCw size={16} className="animate-spin" /> Opening lane…
              </>
            ) : (
              <>
                {files.length > 1
                  ? `Create sharing code for ${files.length} files`
                  : "Create sharing code"}{" "}
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </div>
      </main>
    </Layout>
  );
}
