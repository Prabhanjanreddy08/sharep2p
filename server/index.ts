import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import cors from "cors";
import crypto from "crypto";
import path from "path";
import fs from "fs";

/* ─── Config ─── */
const PORT = parseInt(process.env.PORT || "3001", 10);
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (supports 100GB+ / infinite file sizes and slow connections)
const MAX_PAIR_ATTEMPTS = 30; // per minute per IP
const CLEAN_INTERVAL_MS = 15_000;

/* ─── Types ─── */
interface LifeDropItem {
  id: string;
  kind: "file" | "text" | "url" | "note" | "code" | "contact" | "photo";
  label: string;
  /** only for file / photo items */
  fileName?: string;
  fileSize?: number;
  fileType?: string;
  /** for text / url / note / code / contact items */
  value?: string;
  /** optional language hint for code snippets */
  language?: string;
}

interface Session {
  sessionId: string;
  token: string;
  otp: string; // 6-digit pairing code
  fileName: string;
  fileSize: number;
  fileType: string;
  files?: Array<{
    fileName: string;
    fileSize: number;
    fileType: string;
  }>;
  signalingPath: string;
  expiresAt: string;
  createdAt: number;
  senderWs: WebSocket | null;
  receiverWs: WebSocket | null;
  disconnectTimer?: any;
  /** LifeDrop: if set, this is a multi-item session */
  lifedrop?: {
    title: string;
    items: LifeDropItem[];
    totalFileSize: number;
    burnAfterPickup: boolean;
    pickedUp: boolean;
  };
}

/* ─── State ─── */
const sessions = new Map<string, Session>();
const tokenToSession = new Map<string, string>(); // token -> sessionId
const otpToSession = new Map<string, string>(); // otp -> sessionId
const ipAttempts = new Map<string, { count: number; resetAt: number }>();

/* ─── Helpers ─── */
function generateOtp(): string {
  let code: string;
  do {
    code = String(crypto.randomInt(100_000, 999_999));
  } while (otpToSession.has(code));
  return code;
}

function generateId(): string {
  return crypto.randomBytes(16).toString("base64url");
}

function generateToken(): string {
  return crypto.randomBytes(24).toString("base64url");
}

function getIp(req: express.Request | http.IncomingMessage): string {
  if ("ip" in req && (req as express.Request).ip) {
    return (req as express.Request).ip || "unknown";
  }
  const forwarded = (req.headers["x-forwarded-for"] as string) || "";
  return forwarded.split(",")[0].trim() || (req as any).socket?.remoteAddress || "unknown";
}

function throttle(ip: string): boolean {
  const now = Date.now();
  let rec = ipAttempts.get(ip);
  if (!rec || now > rec.resetAt) {
    rec = { count: 0, resetAt: now + 60_000 };
    ipAttempts.set(ip, rec);
  }
  rec.count++;
  return rec.count > MAX_PAIR_ATTEMPTS;
}

function destroySession(id: string) {
  const s = sessions.get(id);
  if (!s) return;
  if (s.disconnectTimer) {
    clearTimeout(s.disconnectTimer);
    s.disconnectTimer = null;
  }
  tokenToSession.delete(s.token);
  otpToSession.delete(s.otp);
  sessions.delete(id);
  [s.senderWs, s.receiverWs].forEach((ws) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "peer-disconnected", message: "Session expired or closed" }));
      ws.close();
    }
  });
}

function sessionPayload(s: Session) {
  return {
    sessionId: s.sessionId,
    token: s.token,
    otp: s.otp,
    fileName: s.fileName,
    fileSize: s.fileSize,
    fileType: s.fileType,
    files: s.files,
    signalingPath: s.signalingPath,
    expiresAt: s.expiresAt,
    ...(s.lifedrop
      ? {
          lifedrop: {
            title: s.lifedrop.title,
            items: s.lifedrop.items,
            totalFileSize: s.lifedrop.totalFileSize,
            burnAfterPickup: s.lifedrop.burnAfterPickup,
            pickedUp: s.lifedrop.pickedUp,
          },
        }
      : {}),
  };
}

/* ─── Cleanup loop ─── */
setInterval(() => {
  const now = Date.now();
  for (const [id, s] of sessions) {
    const hasActiveWs =
      (s.senderWs && s.senderWs.readyState === WebSocket.OPEN) ||
      (s.receiverWs && s.receiverWs.readyState === WebSocket.OPEN);

    // Only clean up idle sessions where neither party is connected and TTL passed
    if (!hasActiveWs && now - s.createdAt > SESSION_TTL_MS) {
      destroySession(id);
    }
    // Burn after pickup
    if (s.lifedrop?.burnAfterPickup && s.lifedrop?.pickedUp) destroySession(id);
  }
  // Clean up expired rate limiting tracking to prevent memory leak
  for (const [ip, rec] of ipAttempts) {
    if (now > rec.resetAt) {
      ipAttempts.delete(ip);
    }
  }
}, CLEAN_INTERVAL_MS);

/* ─── Express ─── */
const app = express();
app.set("trust proxy", 1);
app.use(cors());
app.use(express.json({ limit: "5mb" }));

// Health check
app.get(["/api/health", "/api/healthz"], (_req, res) => {
  res.json({ status: "ok", ok: true, sessions: sessions.size, uptime: process.uptime() });
});

// Create session (sender) – supports single file or multiple files
const handleCreateSession = (req: express.Request, res: express.Response) => {
  const ip = getIp(req);
  if (throttle(ip)) return res.status(429).json({ error: "Too many attempts" });

  const { fileName, fileSize, fileType, files } = req.body || {};
  const sessionId = generateId();
  const token = generateToken();
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const sessionFiles = Array.isArray(files) && files.length > 0 ? files : undefined;
  const computedTotalSize = sessionFiles
    ? sessionFiles.reduce((acc: number, f: any) => acc + (typeof f.fileSize === "number" ? f.fileSize : 0), 0)
    : (typeof fileSize === "number" ? fileSize : 0);
  const computedFileName = sessionFiles
    ? (sessionFiles.length === 1 ? sessionFiles[0].fileName : `${sessionFiles.length} files package`)
    : (fileName || "Untitled file");

  const session: Session = {
    sessionId,
    token,
    otp,
    fileName: computedFileName,
    fileSize: computedTotalSize,
    fileType: fileType || "application/octet-stream",
    files: sessionFiles,
    signalingPath: `/api/ws/${sessionId}`,
    expiresAt,
    createdAt: Date.now(),
    senderWs: null,
    receiverWs: null,
  };

  sessions.set(sessionId, session);
  tokenToSession.set(token, sessionId);
  otpToSession.set(otp, sessionId);

  res.json(sessionPayload(session));
};

app.post("/api/sessions", handleCreateSession);
app.post("/api/session", handleCreateSession);

// ── LifeDrop: Create a multi-item session ──
app.post("/api/lifedrop", (req, res) => {
  const ip = getIp(req);
  if (throttle(ip)) return res.status(429).json({ error: "Too many attempts" });

  const { title, items, burnAfterPickup } = req.body || {};
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "LifeDrop requires at least one item." });
  }

  const sessionId = generateId();
  const token = generateToken();
  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  // Assign IDs to items that don't have one
  const enrichedItems: LifeDropItem[] = items.map((item: any, idx: number) => ({
    id: item.id || `ld-${idx}-${Date.now()}`,
    kind: item.kind || "text",
    label: item.label || `Item ${idx + 1}`,
    fileName: item.fileName,
    fileSize: item.fileSize,
    fileType: item.fileType,
    value: item.value,
    language: item.language,
  }));

  const totalFileSize = enrichedItems.reduce((sum, item) => sum + (item.fileSize || 0), 0);

  // Summary for the session (use first file or title)
  const fileItems = enrichedItems.filter((i) => i.kind === "file" || i.kind === "photo");
  const summaryFileName = title || (fileItems.length === 1 ? fileItems[0].fileName : undefined) || "LifeDrop package";
  const summaryFileType = fileItems.length === 1 ? (fileItems[0].fileType || "application/octet-stream") : "lifedrop/package";

  const session: Session = {
    sessionId,
    token,
    otp,
    fileName: summaryFileName,
    fileSize: totalFileSize,
    fileType: summaryFileType,
    signalingPath: `/api/ws/${sessionId}`,
    expiresAt,
    createdAt: Date.now(),
    senderWs: null,
    receiverWs: null,
    lifedrop: {
      title: title || "My LifeDrop",
      items: enrichedItems,
      totalFileSize,
      burnAfterPickup: burnAfterPickup === true,
      pickedUp: false,
    },
  };

  sessions.set(sessionId, session);
  tokenToSession.set(token, sessionId);
  otpToSession.set(otp, sessionId);

  res.json(sessionPayload(session));
});

// Mark LifeDrop as picked up
app.post("/api/lifedrop/:sessionId/pickup", (req, res) => {
  const { sessionId } = req.params;
  const token = (req.query.token as string) || req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.body?.token;
  const s = sessions.get(sessionId);
  if (!s || !s.lifedrop) return res.status(404).json({ error: "Not found" });
  if (!token || s.token !== token) {
    return res.status(403).json({ error: "Invalid session credentials" });
  }
  s.lifedrop.pickedUp = true;
  res.json({ ok: true });
});

// Verify session (receiver via OTP or QR token)
app.post("/api/sessions/verify", (req, res) => {
  const ip = getIp(req);
  if (throttle(ip)) return res.status(429).json({ error: "Too many attempts" });

  const { token, otp } = req.body || {};
  let sessionId: string | undefined;

  if (token) {
    sessionId = tokenToSession.get(String(token).trim());
  } else if (otp) {
    sessionId = otpToSession.get(String(otp).trim());
  }

  if (!sessionId || !sessions.has(sessionId)) {
    return res.status(404).json({ error: "That code is not active. Check it and try again." });
  }

  const s = sessions.get(sessionId)!;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    destroySession(sessionId);
    return res.status(404).json({ error: "That code is expired. Check it and try again." });
  }

  res.json(sessionPayload(s));
});

// Cancel / delete session
app.delete("/api/sessions/:sessionId", (req, res) => {
  const { sessionId } = req.params;
  const token = (req.query.token as string) || req.headers.authorization?.replace(/^Bearer\s+/i, "") || req.body?.token;
  const s = sessions.get(sessionId);
  if (!s) return res.json({ ok: true });
  if (!token || s.token !== token) {
    return res.status(403).json({ error: "Invalid session credentials" });
  }
  destroySession(sessionId);
  res.json({ ok: true });
});

// Serve static frontend in production (or whenever dist exists)
const distPath = path.resolve(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // Express 5 compatible SPA fallback
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(distPath, "index.html"));
    }
    next();
  });
}

/* ─── HTTP + WebSocket ─── */
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 }); // 128KB max payload to prevent memory DoS

server.on("upgrade", (req, socket, head) => {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const pathname = parsedUrl.pathname;

  if (pathname.startsWith("/api/ws") || pathname.startsWith("/ws")) {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req);
    });
  } else {
    socket.destroy();
  }
});

wss.on("connection", (ws, req) => {
  const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const parts = parsedUrl.pathname.split("/").filter(Boolean);
  // /api/ws/:sessionId or /ws/:sessionId
  let sessionId = parsedUrl.searchParams.get("sessionId");
  if (!sessionId) {
    if (parts.length >= 3 && parts[0] === "api" && parts[1] === "ws") {
      sessionId = parts[2];
    } else if (parts.length >= 2 && parts[0] === "ws") {
      sessionId = parts[1];
    }
  }

  const role = parsedUrl.searchParams.get("role") as "sender" | "receiver" | null;
  const token = parsedUrl.searchParams.get("token");

  if (!sessionId || !role || !sessions.has(sessionId)) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid or expired session" }));
    ws.close();
    return;
  }

  const session = sessions.get(sessionId)!;
  if (!token || session.token !== token) {
    ws.send(JSON.stringify({ type: "error", message: "Invalid or missing session credentials" }));
    ws.close();
    return;
  }

  // Clear any pending disconnect timer if peer is reconnecting
  if (session.disconnectTimer) {
    clearTimeout(session.disconnectTimer);
    session.disconnectTimer = null;
  }

  if (role === "sender") {
    session.senderWs = ws;
    if (session.receiverWs && session.receiverWs.readyState === WebSocket.OPEN) {
      session.senderWs.send(JSON.stringify({ type: "peer-connected" }));
    }
  } else {
    session.receiverWs = ws;
    if (session.senderWs && session.senderWs.readyState === WebSocket.OPEN) {
      session.senderWs.send(JSON.stringify({ type: "peer-connected" }));
    }
  }

  // Keep connection alive through proxies (Render, mobile NATs) with 20s ping
  const keepAliveTimer = setInterval(() => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    } else {
      clearInterval(keepAliveTimer);
    }
  }, 20_000);

  // Relay messages between sender & receiver
  ws.on("message", (data) => {
    try {
      const msgStr = data.toString();
      session.createdAt = Date.now(); // Refresh session expiration on active communication

      // Handle application-level ping/pong heartbeats
      if (msgStr.includes('"type":"ping"') || msgStr.includes('"type": "ping"')) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "pong" }));
        }
        return;
      }

      const peer = role === "sender" ? session.receiverWs : session.senderWs;
      if (peer && peer.readyState === WebSocket.OPEN) {
        peer.send(msgStr);
      }
    } catch (e) {
      console.error("Relay message error:", e);
    }
  });

  ws.on("close", () => {
    clearInterval(keepAliveTimer);
    if (role === "sender") {
      if (session.senderWs === ws) session.senderWs = null;
    } else {
      if (session.receiverWs === ws) session.receiverWs = null;
    }

    // Give 35s grace period so app-switching on mobile doesn't instantly sever the transfer!
    if (session.disconnectTimer) clearTimeout(session.disconnectTimer);
    session.disconnectTimer = setTimeout(() => {
      session.disconnectTimer = null;
      const isMissing = role === "sender"
        ? (!session.senderWs || session.senderWs.readyState !== WebSocket.OPEN)
        : (!session.receiverWs || session.receiverWs.readyState !== WebSocket.OPEN);

      if (isMissing) {
        const peer = role === "sender" ? session.receiverWs : session.senderWs;
        if (peer && peer.readyState === WebSocket.OPEN) {
          peer.send(JSON.stringify({ type: "peer-disconnected", role }));
        }
      }
    }, 35_000);
  });

  ws.on("error", (err) => {
    clearInterval(keepAliveTimer);
    console.error(`WebSocket error (${role}):`, err.message);
  });
});

server.listen(PORT, () => {
  console.log(`🚀 ShareFast signaling server running on http://localhost:${PORT}`);
});
