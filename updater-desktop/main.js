const path = require("path");
const { app, BrowserWindow, Menu, shell, ipcMain } = require("electron");
const { autoUpdater } = require("electron-updater");

let mainWindow = null;

function normalizeReleaseNotes(releaseNotes) {
  if (!releaseNotes) {
    return [];
  }

  if (typeof releaseNotes === "string") {
    return releaseNotes
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => line.replace(/^[-*]\s*/, ""));
  }

  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item.note === "string") {
          return item.note;
        }
        return "";
      })
      .flatMap((line) =>
        String(line)
          .split(/\r?\n/)
          .map((part) => part.trim())
          .filter(Boolean)
      );
  }

  return [];
}

function mapUpdateInfo(info) {
  if (!info) {
    return {};
  }
  return {
    version: info.version || "",
    releaseDate: info.releaseDate || "",
    releaseNotes: normalizeReleaseNotes(info.releaseNotes)
  };
}

function sendUpdaterEvent(type, payload = {}) {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }
  mainWindow.webContents.send("updater:event", { type, ...payload });
}

function setupAutoUpdaterEvents() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on("checking-for-update", () => {
    sendUpdaterEvent("checking-for-update");
  });

  autoUpdater.on("update-available", (info) => {
    sendUpdaterEvent("update-available", { info: mapUpdateInfo(info) });
  });

  autoUpdater.on("update-not-available", (info) => {
    sendUpdaterEvent("update-not-available", { info: mapUpdateInfo(info) });
  });

  autoUpdater.on("download-progress", (progress) => {
    sendUpdaterEvent("download-progress", {
      progress: {
        percent: Number(progress.percent || 0),
        transferred: Number(progress.transferred || 0),
        total: Number(progress.total || 0),
        bytesPerSecond: Number(progress.bytesPerSecond || 0)
      }
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    sendUpdaterEvent("update-downloaded", { info: mapUpdateInfo(info) });
  });

  autoUpdater.on("error", (error) => {
    sendUpdaterEvent("error", { message: error ? error.message : "Unknown updater error" });
  });
}

function registerUpdaterIpcHandlers() {
  ipcMain.handle("updater:get-app-version", () => app.getVersion());

  ipcMain.handle("updater:check", async () => {
    if (!app.isPackaged) {
      return { ok: false, error: "Updater works only in installed app build." };
    }
    try {
      await autoUpdater.checkForUpdates();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("updater:download", async () => {
    if (!app.isPackaged) {
      return { ok: false, error: "Updater works only in installed app build." };
    }
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error.message };
    }
  });

  ipcMain.handle("updater:install", async () => {
    if (!app.isPackaged) {
      return { ok: false, error: "Updater works only in installed app build." };
    }
    setImmediate(() => {
      autoUpdater.quitAndInstall(false, true);
    });
    return { ok: true };
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#eff6ef",
    title: "RD Checker Updater",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, "..", "updater-client", "index.html"));

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  setupAutoUpdaterEvents();
  registerUpdaterIpcHandlers();
  Menu.setApplicationMenu(null);
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
