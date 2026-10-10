/* ============================================================
   ShareFast – Ultra-fast P2P file transfer engine
   Manages WebRTC data channels with maximum throughput
   ============================================================ */

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.cloudflare.com:3478" },
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
  { urls: "stun:stun4.l.google.com:19302" },
  { urls: "stun:stun.nextcloud.com:443" },
  { urls: "stun:global.stun.twilio.com:3478" },
  {
    urls: [
      "turn:openrelay.metered.ca:80",
      "turn:openrelay.metered.ca:443",
      "turn:openrelay.metered.ca:443?transport=tcp",
      "turns:openrelay.metered.ca:443",
      "turns:openrelay.metered.ca:443?transport=tcp",
    ],
    username: "openrelay",
    credential: "openrelay",
  },
];

function maximizeBandwidthSdp(sdp: string): string {
  if (!sdp) return sdp;
  let lines = sdp.split("\r\n");
  if (lines.length <= 1) lines = sdp.split("\n");

  const newLines: string[] = [];
  let inAppMedia = false;
  let hasMaxMsg = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (line.startsWith("m=application")) {
      inAppMedia = true;
      hasMaxMsg = false;
      newLines.push(line);
      newLines.push("b=AS:1000000");
      newLines.push("b=TIAS:1000000000");
      continue;
    }

    if (line.startsWith("m=") && !line.startsWith("m=application")) {
      inAppMedia = false;
    }

    if (inAppMedia) {
      if (line.startsWith("b=AS:") || line.startsWith("b=TIAS:")) {
        continue;
      }
      if (line.startsWith("a=max-message-size:")) {
        newLines.push("a=max-message-size:268435456");
        hasMaxMsg = true;
        continue;
      }
    }

    newLines.push(line);
  }

  if (inAppMedia && !hasMaxMsg) {
    newLines.push("a=max-message-size:268435456");
  }

  return newLines.join("\r\n") + "\r\n";
}

// Maximum chunk size for blazing speed – 256KB per chunk
// WebRTC can handle up to 256KB reliably
const CHUNK_SIZE = 256 * 1024; // 256KB
// Buffer threshold before applying backpressure
const BUFFER_HIGH = 32 * 1024 * 1024; // 32MB buffer for 100MB/s WAN
const BUFFER_LOW = 8 * 1024 * 1024; // 8MB resume

export interface FileMetadata {
  id: string;
  name: string;
  size: number;
  type: string;
  lastModified: number;
}

export interface TransferProgress {
  fileId: string;
  fileName: string;
  fileSize: number;
  transferred: number;
  speed: number; // bytes/sec
  eta: number; // seconds remaining
  percent: number;
  status: "pending" | "transferring" | "hashing" | "complete" | "error" | "cancelled";
  hash?: string;
}

export interface TransferBatch {
  files: TransferProgress[];
  totalSize: number;
  totalTransferred: number;
  overallPercent: number;
  overallSpeed: number;
  overallEta: number;
}

type SignalMessage =
  | { type: "offer"; sdp: string }
  | { type: "answer"; sdp: string }
  | { type: "ice-candidate"; candidate: RTCIceCandidateInit }
  | { type: "file-manifest"; files: FileMetadata[] }
  | { type: "file-accepted"; fileIds: string[] }
  | { type: "file-complete"; fileId: string; hash: string }
  | { type: "file-hash-verified"; fileId: string; ok: boolean }
  | { type: "cancel-transfer"; fileId?: string }
  | { type: "peer-joined"; role: string }
  | { type: "peer-disconnected"; role: string }
  | { type: "session-expired" }
  | { type: "error"; message: string };

export type ConnectionState = "disconnected" | "connecting" | "waiting" | "paired" | "transferring" | "done" | "error";

export class TransferEngine {
  private ws: WebSocket | null = null;
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private role: "sender" | "receiver";
  private sessionId: string;
  private serverUrl: string;

  // File sending state
  private filesToSend: File[] = [];
  private currentFileIndex = 0;
  private sendOffset = 0;
  private sending = false;
  private cancelled = false;

  // File receiving state
  private receivedChunks: Map<string, Uint8Array[]> = new Map();
  private receivedSize: Map<string, number> = new Map();
  private currentReceivingFile: FileMetadata | null = null;
  private fileManifest: FileMetadata[] = [];
  private manifestFileIndex = 0;

  // Progress tracking
  private progressMap: Map<string, TransferProgress> = new Map();
  private speedSamples: { time: number; bytes: number }[] = [];
  private lastSpeedCalc = 0;

  // Callbacks
  onStateChange?: (state: ConnectionState) => void;
  onProgress?: (batch: TransferBatch) => void;
  onFilesOffered?: (files: FileMetadata[]) => void;
  onFileReceived?: (file: Blob, meta: FileMetadata) => void;
  onError?: (error: string) => void;
  onPaired?: () => void;

  constructor(serverUrl: string, sessionId: string, role: "sender" | "receiver") {
    this.serverUrl = serverUrl;
    this.sessionId = sessionId;
    this.role = role;
  }

  /* ─── Connection Setup ─── */

  connect(): void {
    this.onStateChange?.("connecting");

    const wsProtocol = this.serverUrl.startsWith("https") ? "wss" : "ws";
    const wsBase = this.serverUrl.replace(/^https?/, wsProtocol);
    const wsUrl = `${wsBase}/ws?sessionId=${this.sessionId}&role=${this.role}`;

    this.ws = new WebSocket(wsUrl);

    this.ws.onopen = () => {
      this.onStateChange?.("waiting");
    };

    this.ws.onmessage = (evt) => {
      const msg: SignalMessage = JSON.parse(evt.data);
      this.handleSignal(msg);
    };

    this.ws.onclose = () => {
      if (!this.cancelled) {
        this.onStateChange?.("disconnected");
      }
    };

    this.ws.onerror = () => {
      this.onError?.("WebSocket connection failed");
      this.onStateChange?.("error");
    };
  }

  private async handleSignal(msg: SignalMessage): Promise<void> {
    switch (msg.type) {
      case "peer-joined":
        this.onStateChange?.("paired");
        this.onPaired?.();
        if (this.role === "sender") {
          await this.createOffer();
        }
        break;

      case "offer":
        await this.handleOffer(msg.sdp);
        break;

      case "answer":
        await this.handleAnswer(msg.sdp);
        break;

      case "ice-candidate":
        await this.pc?.addIceCandidate(new RTCIceCandidate(msg.candidate));
        break;

      case "file-manifest":
        this.fileManifest = msg.files;
        this.onFilesOffered?.(msg.files);
        break;

      case "file-accepted":
        this.startSendingFiles(msg.fileIds);
        break;

      case "file-complete": {
        // Receiver reports hash
        const progress = this.progressMap.get(msg.fileId);
        if (progress) {
          const expectedHash = progress.hash;
          const ok = expectedHash === msg.hash;
          this.sendSignal({ type: "file-hash-verified", fileId: msg.fileId, ok });
          if (ok) {
            progress.status = "complete";
          } else {
            progress.status = "error";
            this.onError?.(`Hash mismatch for ${progress.fileName}`);
          }
          this.emitBatchProgress();
        }
        break;
      }

      case "file-hash-verified": {
        const p = this.progressMap.get(msg.fileId);
        if (p) {
          p.status = msg.ok ? "complete" : "error";
          if (!msg.ok) this.onError?.(`Hash verification failed for ${p.fileName}`);
          this.emitBatchProgress();
        }
        break;
      }

      case "cancel-transfer":
        this.cancelled = true;
        this.onStateChange?.("disconnected");
        this.cleanup();
        break;

      case "peer-disconnected":
        if (!this.cancelled) {
          this.onError?.("Peer disconnected");
          this.onStateChange?.("disconnected");
        }
        break;

      case "session-expired":
        this.onError?.("Session expired");
        this.onStateChange?.("error");
        this.cleanup();
        break;

      case "error":
        this.onError?.(msg.message);
        this.onStateChange?.("error");
        break;
    }
  }

  /* ─── WebRTC ─── */

  private createPeerConnection(): void {
    this.pc = new RTCPeerConnection({
      iceServers: ICE_SERVERS,
      // @ts-ignore – Chrome supports this for ordered unreliable
      iceTransportPolicy: "all",
    });

    this.pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        this.sendSignal({ type: "ice-candidate", candidate: evt.candidate.toJSON() });
      }
    };

    this.pc.onconnectionstatechange = () => {
      if (this.pc?.connectionState === "failed") {
        this.onError?.("Peer connection failed");
        this.onStateChange?.("error");
      }
    };
  }

  private async createOffer(): Promise<void> {
    this.createPeerConnection();

    // Create data channel with maximum throughput settings
    this.dc = this.pc!.createDataChannel("files", {
      ordered: true,
      // No maxRetransmits – reliable delivery
    });
    this.dc.binaryType = "arraybuffer";
    this.setupDataChannel(this.dc);

    const offer = await this.pc!.createOffer();
    const boostedOffer = new RTCSessionDescription({
      type: offer.type,
      sdp: maximizeBandwidthSdp(offer.sdp || ""),
    });
    await this.pc!.setLocalDescription(boostedOffer);
    this.sendSignal({ type: "offer", sdp: this.pc!.localDescription!.sdp });
  }

  private async handleOffer(sdp: string): Promise<void> {
    this.createPeerConnection();

    this.pc!.ondatachannel = (evt) => {
      this.dc = evt.channel;
      this.dc.binaryType = "arraybuffer";
      this.setupDataChannel(this.dc);
    };

    const boostedRemote = maximizeBandwidthSdp(sdp);
    await this.pc!.setRemoteDescription(new RTCSessionDescription({ type: "offer", sdp: boostedRemote }));
    const answer = await this.pc!.createAnswer();
    const boostedAnswer = new RTCSessionDescription({
      type: answer.type,
      sdp: maximizeBandwidthSdp(answer.sdp || ""),
    });
    await this.pc!.setLocalDescription(boostedAnswer);
    this.sendSignal({ type: "answer", sdp: this.pc!.localDescription!.sdp });
  }

  private async handleAnswer(sdp: string): Promise<void> {
    const boostedRemote = maximizeBandwidthSdp(sdp);
    await this.pc!.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp: boostedRemote }));
  }

  private setupDataChannel(dc: RTCDataChannel): void {
    dc.onopen = () => {
      // Maximize buffer
      if ("bufferedAmountLowThreshold" in dc) {
        dc.bufferedAmountLowThreshold = BUFFER_LOW;
      }
    };

    dc.onmessage = (evt) => {
      this.handleDataMessage(evt.data);
    };

    dc.onerror = (err) => {
      this.onError?.("Data channel error: " + (err as any)?.message);
    };

    dc.onclose = () => {
      // Check if all files done
      const allDone = [...this.progressMap.values()].every(
        (p) => p.status === "complete" || p.status === "error" || p.status === "cancelled"
      );
      if (allDone && this.progressMap.size > 0) {
        this.onStateChange?.("done");
      }
    };
  }

  /* ─── Sending ─── */

  setFiles(files: File[]): void {
    this.filesToSend = files;
    const manifest: FileMetadata[] = files.map((f, i) => ({
      id: `file-${i}-${Date.now()}`,
      name: f.name,
      size: f.size,
      type: f.type || "application/octet-stream",
      lastModified: f.lastModified,
    }));

    // Initialize progress
    manifest.forEach((m) => {
      this.progressMap.set(m.id, {
        fileId: m.id,
        fileName: m.name,
        fileSize: m.size,
        transferred: 0,
        speed: 0,
        eta: 0,
        percent: 0,
        status: "pending",
      });
    });

    this.sendSignal({ type: "file-manifest", files: manifest });
    this.emitBatchProgress();
  }

  acceptFiles(fileIds: string[]): void {
    this.sendSignal({ type: "file-accepted", fileIds });
    // Initialize progress for receiver
    fileIds.forEach((id) => {
      const meta = this.fileManifest.find((f) => f.id === id);
      if (meta) {
        this.progressMap.set(id, {
          fileId: id,
          fileName: meta.name,
          fileSize: meta.size,
          transferred: 0,
          speed: 0,
          eta: 0,
          percent: 0,
          status: "pending",
        });
        this.receivedChunks.set(id, []);
        this.receivedSize.set(id, 0);
      }
    });
    this.emitBatchProgress();
  }

  private startSendingFiles(fileIds: string[]): void {
    this.onStateChange?.("transferring");
    this.currentFileIndex = 0;
    this.sending = true;
    this.cancelled = false;

    // Map accepted IDs to file indices
    const accepted = new Set(fileIds);
    const manifest = [...this.progressMap.values()];
    const orderedFiles: { file: File; meta: TransferProgress }[] = [];

    manifest.forEach((p, i) => {
      if (accepted.has(p.fileId)) {
        orderedFiles.push({ file: this.filesToSend[i], meta: p });
      }
    });

    this.sendNextFile(orderedFiles, 0);
  }

  private async sendNextFile(
    queue: { file: File; meta: TransferProgress }[],
    index: number
  ): Promise<void> {
    if (index >= queue.length || this.cancelled) {
      this.onStateChange?.("done");
      return;
    }

    const { file, meta } = queue[index];
    meta.status = "transferring";
    this.sendOffset = 0;
    this.speedSamples = [];
    this.lastSpeedCalc = performance.now();

    // Send file header
    const header = JSON.stringify({
      type: "file-start",
      id: meta.fileId,
      name: meta.fileName,
      size: meta.fileSize,
      mime: file.type,
    });
    this.dc!.send(header);

    // Send file data in chunks with backpressure
    const reader = file.stream().getReader();
    let buffer = new Uint8Array(0);

    const sendChunks = async () => {
      while (true) {
        if (this.cancelled) return;

        // Backpressure: wait if buffer is full
        if (this.dc!.bufferedAmount > BUFFER_HIGH) {
          await new Promise<void>((resolve) => {
            const check = () => {
              if (this.dc!.bufferedAmount <= BUFFER_LOW) {
                resolve();
              } else {
                setTimeout(check, 1);
              }
            };
            check();
          });
        }

        // Read more data if buffer is empty
        if (buffer.length === 0) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer = value;
        }

        // Slice chunk
        const chunk = buffer.slice(0, CHUNK_SIZE);
        buffer = buffer.slice(CHUNK_SIZE);

        this.dc!.send(chunk);
        this.sendOffset += chunk.byteLength;
        meta.transferred = this.sendOffset;

        // Speed calculation
        const now = performance.now();
        this.speedSamples.push({ time: now, bytes: chunk.byteLength });
        // Keep last 2 seconds of samples
        const cutoff = now - 2000;
        this.speedSamples = this.speedSamples.filter((s) => s.time > cutoff);

        if (now - this.lastSpeedCalc > 100) {
          const totalBytes = this.speedSamples.reduce((a, s) => a + s.bytes, 0);
          const elapsed = (now - this.speedSamples[0].time) / 1000;
          meta.speed = elapsed > 0 ? totalBytes / elapsed : 0;
          meta.eta = meta.speed > 0 ? (meta.fileSize - meta.transferred) / meta.speed : 0;
          meta.percent = (meta.transferred / meta.fileSize) * 100;
          this.lastSpeedCalc = now;
          this.emitBatchProgress();
        }
      }

      // Hash the file
      meta.status = "hashing";
      meta.percent = 100;
      this.emitBatchProgress();

      const hash = await this.hashFile(file);
      meta.hash = hash;

      // Send file-end marker
      this.dc!.send(JSON.stringify({ type: "file-end", id: meta.fileId }));

      // Move to next file
      setTimeout(() => this.sendNextFile(queue, index + 1), 50);
    };

    await sendChunks();
  }

  /* ─── Receiving ─── */

  private handleDataMessage(data: ArrayBuffer | string): void {
    if (typeof data === "string") {
      const msg = JSON.parse(data);
      switch (msg.type) {
        case "file-start":
          this.currentReceivingFile = {
            id: msg.id,
            name: msg.name,
            size: msg.size,
            type: msg.mime,
            lastModified: Date.now(),
          };
          this.receivedChunks.set(msg.id, []);
          this.receivedSize.set(msg.id, 0);
          const progress = this.progressMap.get(msg.id);
          if (progress) {
            progress.status = "transferring";
            this.onStateChange?.("transferring");
          }
          this.speedSamples = [];
          this.lastSpeedCalc = performance.now();
          break;

        case "file-end":
          this.finalizeReceivedFile(msg.id);
          break;
      }
      return;
    }

    // Binary chunk
    if (!this.currentReceivingFile) return;
    const fileId = this.currentReceivingFile.id;
    const chunk = new Uint8Array(data);

    const chunks = this.receivedChunks.get(fileId);
    if (chunks) chunks.push(chunk);

    const size = (this.receivedSize.get(fileId) || 0) + chunk.byteLength;
    this.receivedSize.set(fileId, size);

    const p = this.progressMap.get(fileId);
    if (p) {
      p.transferred = size;

      const now = performance.now();
      this.speedSamples.push({ time: now, bytes: chunk.byteLength });
      const cutoff = now - 2000;
      this.speedSamples = this.speedSamples.filter((s) => s.time > cutoff);

      if (now - this.lastSpeedCalc > 100) {
        const totalBytes = this.speedSamples.reduce((a, s) => a + s.bytes, 0);
        const elapsed = (now - this.speedSamples[0].time) / 1000;
        p.speed = elapsed > 0 ? totalBytes / elapsed : 0;
        p.eta = p.speed > 0 ? (p.fileSize - p.transferred) / p.speed : 0;
        p.percent = (p.transferred / p.fileSize) * 100;
        this.lastSpeedCalc = now;
        this.emitBatchProgress();
      }
    }
  }

  private async finalizeReceivedFile(fileId: string): Promise<void> {
    const chunks = this.receivedChunks.get(fileId);
    const meta = this.fileManifest.find((f) => f.id === fileId) || this.currentReceivingFile;
    const p = this.progressMap.get(fileId);

    if (!chunks || !meta || !p) return;

    p.status = "hashing";
    p.percent = 100;
    this.emitBatchProgress();

    const blob = new Blob(chunks as unknown as BlobPart[], { type: meta.type });
    const hash = await this.hashBlob(blob);
    p.hash = hash;

    // Report hash to sender for verification
    this.sendSignal({ type: "file-complete", fileId, hash });

    p.status = "complete";
    this.emitBatchProgress();

    // Deliver file
    this.onFileReceived?.(blob, meta);

    // Cleanup
    this.receivedChunks.delete(fileId);
    this.receivedSize.delete(fileId);

    // Check if all done
    const allDone = [...this.progressMap.values()].every(
      (pp) => pp.status === "complete" || pp.status === "error"
    );
    if (allDone) {
      this.onStateChange?.("done");
    }
  }

  /* ─── Hashing ─── */

  private async hashFile(file: File): Promise<string> {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  private async hashBlob(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  /* ─── Progress ─── */

  private emitBatchProgress(): void {
    const files = [...this.progressMap.values()];
    const totalSize = files.reduce((a, f) => a + f.fileSize, 0);
    const totalTransferred = files.reduce((a, f) => a + f.transferred, 0);
    const activeFiles = files.filter((f) => f.status === "transferring");
    const overallSpeed = activeFiles.reduce((a, f) => a + f.speed, 0);
    const remaining = totalSize - totalTransferred;
    const overallEta = overallSpeed > 0 ? remaining / overallSpeed : 0;

    this.onProgress?.({
      files,
      totalSize,
      totalTransferred,
      overallPercent: totalSize > 0 ? (totalTransferred / totalSize) * 100 : 0,
      overallSpeed,
      overallEta,
    });
  }

  /* ─── Signaling ─── */

  private sendSignal(msg: SignalMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  /* ─── Controls ─── */

  cancel(): void {
    this.cancelled = true;
    this.sendSignal({ type: "cancel-transfer" });
    this.progressMap.forEach((p) => {
      if (p.status === "transferring" || p.status === "pending") {
        p.status = "cancelled";
      }
    });
    this.emitBatchProgress();
    this.cleanup();
  }

  disconnect(): void {
    this.cleanup();
  }

  private cleanup(): void {
    this.dc?.close();
    this.pc?.close();
    this.ws?.close();
    this.dc = null;
    this.pc = null;
    this.ws = null;
  }

  getManifest(): FileMetadata[] {
    return this.fileManifest;
  }
}
