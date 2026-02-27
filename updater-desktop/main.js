const path = require("path");
const { app, BrowserWindow, Menu, shell } = require("electron");

function createWindow() {
  const window = new BrowserWindow({
    width: 1220,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    autoHideMenuBar: true,
    backgroundColor: "#eff6ef",
    title: "RD Checker Updater",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  window.loadFile(path.join(__dirname, "..", "updater-client", "index.html"));

  window.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
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
