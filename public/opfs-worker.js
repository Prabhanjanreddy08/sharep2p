// ShareFast OPFS High-Performance Disk Storage Worker
// Native support for iOS Safari 15.2+, Android Chrome, Desktop Safari/Chrome/Firefox/Edge

let accessHandle = null;
let currentFileName = "";
let offset = 0;
let uncommittedBytes = 0;
const FLUSH_INTERVAL = 8 * 1024 * 1024; // 8MB flush ensures fast disk commit while keeping RAM minimal

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg) return;

  if (msg.cmd === "init") {
    try {
      if (!navigator.storage || typeof navigator.storage.getDirectory !== "function") {
        throw new Error("OPFS getDirectory is not supported in this environment");
      }
      const root = await navigator.storage.getDirectory();
      currentFileName = msg.name;

      const fileHandle = await root.getFileHandle(msg.name, { create: true });
      if (typeof fileHandle.createSyncAccessHandle !== "function") {
        throw new Error("createSyncAccessHandle is not supported in this browser");
      }

      accessHandle = await fileHandle.createSyncAccessHandle();
      accessHandle.truncate(0);
      offset = 0;
      uncommittedBytes = 0;

      self.postMessage({ cmd: "init-done", ok: true });

      // Clean up previous temporary session files in background without blocking init
      setTimeout(async () => {
        try {
          if (typeof root.entries === "function") {
            for await (const [name] of root.entries()) {
              if (name && name.startsWith("sf_") && name !== msg.name) {
                await root.removeEntry(name).catch(() => {});
              }
            }
          }
        } catch {}
      }, 1000);
    } catch (err) {
      self.postMessage({ cmd: "init-done", ok: false, err: String(err) });
    }
  } else if (msg.cmd === "write") {
    try {
      if (accessHandle && msg.buffer) {
        const u8 = new Uint8Array(msg.buffer);
        // Synchronous direct-to-disk write without keeping buffer in RAM
        accessHandle.write(u8, { at: offset });
        offset += u8.byteLength;
        uncommittedBytes += u8.byteLength;

        if (uncommittedBytes >= FLUSH_INTERVAL) {
          accessHandle.flush();
          uncommittedBytes = 0;
        }

        // Send write confirmation back to main thread
        self.postMessage({ cmd: "write-ack", bytes: u8.byteLength, offset });
      } else {
        self.postMessage({ cmd: "write-err", err: "No access handle open or missing buffer" });
      }
    } catch (err) {
      self.postMessage({ cmd: "write-err", err: String(err) });
    }
  } else if (msg.cmd === "flush") {
    try {
      if (accessHandle) {
        accessHandle.flush();
        uncommittedBytes = 0;
      }
      self.postMessage({ cmd: "flush-done", ok: true });
    } catch (err) {
      self.postMessage({ cmd: "flush-done", ok: false, err: String(err) });
    }
  } else if (msg.cmd === "finish") {
    try {
      if (accessHandle) {
        accessHandle.flush();
        accessHandle.close();
        accessHandle = null;
      }
      self.postMessage({ cmd: "finish-done", ok: true, size: offset });
    } catch (err) {
      self.postMessage({ cmd: "finish-done", ok: false, err: String(err) });
    }
  }
};
