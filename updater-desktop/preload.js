const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("desktopUpdater", {
  isDesktop: true,
  getAppVersion: () => ipcRenderer.invoke("updater:get-app-version"),
  checkForUpdates: () => ipcRenderer.invoke("updater:check"),
  downloadUpdate: () => ipcRenderer.invoke("updater:download"),
  installUpdate: () => ipcRenderer.invoke("updater:install"),
  onEvent: (callback) => {
    if (typeof callback !== "function") {
      return () => {};
    }
    const handler = (_event, payload) => callback(payload);
    ipcRenderer.on("updater:event", handler);
    return () => {
      ipcRenderer.removeListener("updater:event", handler);
    };
  }
});
