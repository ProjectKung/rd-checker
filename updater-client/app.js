const CONFIG = {
  manifestUrls: [
    "https://raw.githubusercontent.com/ProjectKung/rd-checker/main/updater/update-manifest.json",
    "../updater/update-manifest.json"
  ],
  storageKey: "rd_checker_installed_version",
  defaultVersion: "1.0.0"
};

const LOCAL_FALLBACK_MANIFEST = {
  version: "1.1.0",
  release_date: "2026-02-27",
  package_url: "https://github.com/ProjectKung/rd-checker/archive/refs/heads/main.zip",
  package_size: "auto",
  notes: [
    "Added standalone updater client UI with patch-note panel.",
    "Added game-style progress bar and download telemetry text.",
    "Added successful completion panel after update package download."
  ]
};

const isDesktopMode = Boolean(window.desktopUpdater && window.desktopUpdater.isDesktop);

const state = {
  mode: isDesktopMode ? "desktop" : "web",
  installedVersion: isDesktopMode
    ? CONFIG.defaultVersion
    : (localStorage.getItem(CONFIG.storageKey) || CONFIG.defaultVersion),
  manifest: null,
  desktop: {
    hasUpdate: false,
    downloaded: false,
    unsubscribe: null,
    autoMode: true,
    autoDownloadTriggered: false,
    autoInstallTriggered: false
  }
};

const ui = {
  installedVersion: document.getElementById("installedVersion"),
  latestVersion: document.getElementById("latestVersion"),
  releaseDate: document.getElementById("releaseDate"),
  patchNotes: document.getElementById("patchNotes"),
  statusText: document.getElementById("statusText"),
  progressFill: document.getElementById("progressFill"),
  progressLabel: document.getElementById("progressLabel"),
  progressPercent: document.getElementById("progressPercent"),
  downloadMeta: document.getElementById("downloadMeta"),
  checkBtn: document.getElementById("checkBtn"),
  updateBtn: document.getElementById("updateBtn"),
  successPanel: document.getElementById("successPanel"),
  successMessage: document.getElementById("successMessage"),
  closeSuccessBtn: document.getElementById("closeSuccessBtn")
};

init().catch((error) => {
  console.error(error);
  setStatus(`Init failed: ${error.message}`, true);
});

async function init() {
  ui.checkBtn.addEventListener("click", handleCheckUpdate);
  ui.updateBtn.addEventListener("click", handleUpdateNow);
  ui.closeSuccessBtn.addEventListener("click", () => {
    ui.successPanel.hidden = true;
  });

  if (state.mode === "desktop") {
    ui.downloadMeta.hidden = false;
    ui.downloadMeta.textContent = "Desktop mode ready. Releases come from GitHub.";

    state.desktop.unsubscribe = window.desktopUpdater.onEvent(handleDesktopUpdaterEvent);
    window.addEventListener("beforeunload", () => {
      if (state.desktop.unsubscribe) {
        state.desktop.unsubscribe();
      }
    });

    const version = await window.desktopUpdater.getAppVersion();
    state.installedVersion = version || CONFIG.defaultVersion;
    ui.installedVersion.textContent = state.installedVersion;
    ui.latestVersion.textContent = state.installedVersion;
    renderNotes(["Desktop auto-update is enabled. App can check, download, and install update automatically."]);
    setStatus("Auto update mode started. Checking latest version...", false);
    setProgress(0, "Idle");

    setTimeout(() => {
      void handleDesktopCheckUpdate({ auto: true });
    }, 350);
    return;
  }

  ui.installedVersion.textContent = state.installedVersion;
  setStatus("Ready to check for updates.", false);
  setProgress(0, "Idle");
}

async function handleCheckUpdate() {
  if (state.mode === "desktop") {
    await handleDesktopCheckUpdate();
    return;
  }

  await handleWebCheckUpdate();
}

async function handleUpdateNow() {
  if (state.mode === "desktop") {
    await handleDesktopUpdateNow();
    return;
  }

  await handleWebUpdateNow();
}

async function handleDesktopCheckUpdate(options = {}) {
  const auto = Boolean(options.auto);
  ui.checkBtn.disabled = true;
  ui.updateBtn.disabled = true;
  ui.updateBtn.textContent = "Update Now";
  state.desktop.hasUpdate = false;
  state.desktop.downloaded = false;
  state.desktop.autoDownloadTriggered = false;
  state.desktop.autoInstallTriggered = false;
  setProgress(0, "Checking");
  setStatus(auto ? "Auto checking for update..." : "Checking for update from GitHub Releases...", false);

  const result = await window.desktopUpdater.checkForUpdates();
  if (!result || !result.ok) {
    setStatus(`Update check failed: ${(result && result.error) || "Unknown error"}`, true);
    setProgress(0, "Failed");
    ui.checkBtn.disabled = false;
    ui.updateBtn.disabled = true;
    ui.downloadMeta.hidden = false;
    ui.downloadMeta.textContent = "Auto mode failed. You can still click 'Check for Update'.";
  }
}

async function handleDesktopUpdateNow() {
  if (!state.desktop.hasUpdate && !state.desktop.downloaded) {
    setStatus("No update available. Click 'Check for Update' first.", true);
    return;
  }

  if (state.desktop.downloaded) {
    ui.checkBtn.disabled = true;
    ui.updateBtn.disabled = true;
    setStatus("Installing update and restarting app...", false);
    const result = await window.desktopUpdater.installUpdate();
    if (!result || !result.ok) {
      setStatus(`Install failed: ${(result && result.error) || "Unknown error"}`, true);
      ui.checkBtn.disabled = false;
      ui.updateBtn.disabled = false;
    }
    return;
  }

  ui.checkBtn.disabled = true;
  ui.updateBtn.disabled = true;
  setStatus("Starting update download...", false);
  const result = await window.desktopUpdater.downloadUpdate();
  if (!result || !result.ok) {
    setStatus(`Download failed: ${(result && result.error) || "Unknown error"}`, true);
    ui.checkBtn.disabled = false;
    ui.updateBtn.disabled = !state.desktop.hasUpdate;
  }
}

async function triggerDesktopAutoDownload() {
  const result = await window.desktopUpdater.downloadUpdate();
  if (!result || !result.ok) {
    setStatus(`Download failed: ${(result && result.error) || "Unknown error"}`, true);
    setProgress(0, "Failed");
    ui.checkBtn.disabled = false;
    ui.updateBtn.disabled = false;
    ui.updateBtn.textContent = "Update Now";
  }
}

async function triggerDesktopAutoInstall() {
  const result = await window.desktopUpdater.installUpdate();
  if (!result || !result.ok) {
    setStatus(`Install failed: ${(result && result.error) || "Unknown error"}`, true);
    ui.checkBtn.disabled = false;
    ui.updateBtn.disabled = false;
    ui.updateBtn.textContent = "Install and Restart";
  }
}

function handleDesktopUpdaterEvent(event) {
  if (!event || !event.type) {
    return;
  }

  switch (event.type) {
    case "checking-for-update": {
      setProgress(1, "Checking");
      setStatus("Checking latest release...", false);
      break;
    }

    case "update-available": {
      const manifest = desktopInfoToManifest(event.info);
      state.manifest = manifest;
      state.desktop.hasUpdate = true;
      state.desktop.downloaded = false;
      updateManifestUi(manifest);
      setStatus(`Update available: ${manifest.version}`, false);
      setProgress(0, "Ready to download");
      ui.downloadMeta.hidden = false;
      ui.downloadMeta.textContent = "Release found.";
      ui.checkBtn.disabled = false;
      ui.updateBtn.disabled = false;
      ui.updateBtn.textContent = "Update Now";

      if (state.desktop.autoMode && !state.desktop.autoDownloadTriggered) {
        state.desktop.autoDownloadTriggered = true;
        ui.checkBtn.disabled = true;
        ui.updateBtn.disabled = true;
        setStatus(`Update available: ${manifest.version}. Auto downloading...`, false);
        setProgress(0, "Starting download");
        ui.downloadMeta.textContent = "Auto mode: downloading update package...";
        void triggerDesktopAutoDownload();
      }
      break;
    }

    case "update-not-available": {
      const manifest = desktopInfoToManifest(event.info);
      manifest.version = manifest.version === "-" ? state.installedVersion : manifest.version;
      state.manifest = manifest;
      state.desktop.hasUpdate = false;
      state.desktop.downloaded = false;
      updateManifestUi(manifest);
      setStatus("No new update. You are already on latest version.", false);
      setProgress(100, "Up to date");
      ui.downloadMeta.hidden = false;
      ui.downloadMeta.textContent = "No update package needed.";
      ui.checkBtn.disabled = false;
      ui.updateBtn.disabled = true;
      ui.updateBtn.textContent = "Update Now";
      break;
    }

    case "download-progress": {
      const progress = event.progress || {};
      setProgress(progress.percent || 0, "Downloading update");
      ui.downloadMeta.hidden = false;
      ui.downloadMeta.textContent = formatProgressMeta(progress);
      break;
    }

    case "update-downloaded": {
      const manifest = desktopInfoToManifest(event.info || state.manifest);
      state.manifest = manifest;
      state.desktop.hasUpdate = true;
      state.desktop.downloaded = true;
      updateManifestUi(manifest);
      setProgress(100, "Ready to install");
      setStatus("Download complete. Click 'Install and Restart'.", false);
      ui.downloadMeta.hidden = false;
      ui.downloadMeta.textContent = "Update package is ready to install.";
      ui.checkBtn.disabled = false;
      ui.updateBtn.disabled = false;
      ui.updateBtn.textContent = "Install and Restart";

      if (state.desktop.autoMode && !state.desktop.autoInstallTriggered) {
        state.desktop.autoInstallTriggered = true;
        ui.checkBtn.disabled = true;
        ui.updateBtn.disabled = true;
        ui.updateBtn.textContent = "Installing...";
        setStatus("Download complete. Auto installing and restarting...", false);
        ui.downloadMeta.textContent = "Auto mode: installing update and restarting app...";
        ui.successMessage.textContent = `Version ${manifest.version} downloaded. Installing now...`;
        ui.successPanel.hidden = false;
        setTimeout(() => {
          void triggerDesktopAutoInstall();
        }, 1000);
      } else {
        ui.successMessage.textContent = `Version ${manifest.version} downloaded. Click Install and Restart.`;
        ui.successPanel.hidden = false;
      }
      break;
    }

    case "error": {
      setStatus(`Updater error: ${event.message || "Unknown error"}`, true);
      setProgress(0, "Failed");
      ui.checkBtn.disabled = false;
      ui.updateBtn.disabled = !state.desktop.hasUpdate;
      break;
    }

    default:
      break;
  }
}

function desktopInfoToManifest(info) {
  return {
    version: (info && info.version) || "-",
    release_date: formatReleaseDate(info && info.releaseDate),
    notes: normalizeNotes(info && info.releaseNotes)
  };
}

function normalizeNotes(rawNotes) {
  if (!rawNotes) {
    return ["No release notes available."];
  }

  if (Array.isArray(rawNotes)) {
    const list = rawNotes
      .map((item) => String(item).trim())
      .filter(Boolean);
    return list.length ? list : ["No release notes available."];
  }

  if (typeof rawNotes === "string") {
    const list = rawNotes
      .split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*]\s*/, ""))
      .filter(Boolean);
    return list.length ? list : ["No release notes available."];
  }

  return ["No release notes available."];
}

function formatReleaseDate(value) {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString();
}

function formatProgressMeta(progress) {
  const transferred = Number(progress.transferred || 0);
  const total = Number(progress.total || 0);
  const speed = Number(progress.bytesPerSecond || 0);

  let message = `${formatBytes(transferred)} downloaded`;
  if (total > 0) {
    message += ` / ${formatBytes(total)}`;
  }
  if (speed > 0) {
    message += ` (${formatBytes(speed)}/s)`;
  }
  return message;
}

async function handleWebCheckUpdate() {
  ui.checkBtn.disabled = true;
  ui.updateBtn.disabled = true;
  ui.updateBtn.textContent = "Update Now";
  setProgress(0, "Checking update manifest...");
  setStatus("Checking for latest update...", false);

  try {
    const manifest = await loadManifest();
    validateManifest(manifest);
    state.manifest = manifest;
    updateManifestUi(manifest);

    if (compareVersions(manifest.version, state.installedVersion) <= 0) {
      setStatus(`You are already up to date at version ${state.installedVersion}.`, false);
      setProgress(100, "No update needed");
      return;
    }

    setStatus(`Update available: ${manifest.version}`, false);
    setProgress(0, "Ready to update");
    ui.updateBtn.disabled = false;
  } catch (error) {
    console.error(error);
    setStatus(`Update check failed: ${error.message}`, true);
    setProgress(0, "Failed");
  } finally {
    ui.checkBtn.disabled = false;
  }
}

async function handleWebUpdateNow() {
  if (!state.manifest) {
    setStatus("No manifest loaded. Click 'Check for Update' first.", true);
    return;
  }

  ui.checkBtn.disabled = true;
  ui.updateBtn.disabled = true;
  ui.downloadMeta.hidden = false;
  ui.downloadMeta.textContent = "Preparing package download...";

  try {
    const downloadResult = await downloadPackage(
      state.manifest.package_url,
      state.manifest.package_name || `rd-checker-${state.manifest.version}.zip`
    );

    state.installedVersion = state.manifest.version;
    localStorage.setItem(CONFIG.storageKey, state.installedVersion);
    ui.installedVersion.textContent = state.installedVersion;

    setProgress(100, "Update complete");
    setStatus(`Updated to version ${state.manifest.version}`, false);
    ui.successMessage.textContent = `Version ${state.manifest.version} has been downloaded as ${downloadResult.fileName}.`;
    ui.successPanel.hidden = false;
  } catch (error) {
    console.error(error);
    setStatus(`Update failed: ${error.message}`, true);
    setProgress(0, "Failed");
  } finally {
    ui.checkBtn.disabled = false;
    ui.updateBtn.disabled = false;
  }
}

async function loadManifest() {
  const errors = [];
  for (const url of CONFIG.manifestUrls) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      errors.push(`${url}: ${error.message}`);
    }
  }
  console.warn("Manifest fallback used", errors);
  return LOCAL_FALLBACK_MANIFEST;
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== "object") {
    throw new Error("Invalid manifest shape");
  }
  if (!manifest.version) {
    throw new Error("Manifest missing version");
  }
  if (!manifest.package_url) {
    throw new Error("Manifest missing package_url");
  }
  if (!Array.isArray(manifest.notes)) {
    manifest.notes = [];
  }
}

function updateManifestUi(manifest) {
  ui.latestVersion.textContent = manifest.version;
  ui.releaseDate.textContent = manifest.release_date || "-";
  renderNotes(manifest.notes || []);
}

function renderNotes(notes) {
  ui.patchNotes.innerHTML = "";
  if (!notes.length) {
    const item = document.createElement("li");
    item.textContent = "No patch note entries.";
    ui.patchNotes.appendChild(item);
    return;
  }

  notes.forEach((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    ui.patchNotes.appendChild(item);
  });
}

function setStatus(message, isError) {
  ui.statusText.textContent = message;
  ui.statusText.classList.toggle("error", Boolean(isError));
}

function setProgress(percent, label) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent)));
  ui.progressFill.style.width = `${safePercent}%`;
  ui.progressPercent.textContent = `${safePercent}%`;
  ui.progressLabel.textContent = label;
}

async function downloadPackage(url, fileName) {
  setStatus("Downloading update package...", false);
  setProgress(0, "Connecting...");

  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`Download failed: HTTP ${response.status}`);
  }

  const totalBytes = Number(response.headers.get("Content-Length")) || 0;
  const reader = response.body ? response.body.getReader() : null;

  if (!reader) {
    const blob = await response.blob();
    triggerDownload(blob, fileName);
    return { fileName };
  }

  const chunks = [];
  let receivedBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    chunks.push(value);
    receivedBytes += value.length;

    if (totalBytes > 0) {
      setProgress((receivedBytes / totalBytes) * 100, "Downloading package");
    } else {
      const pseudo = Math.min(95, Math.floor(receivedBytes / 50000));
      setProgress(pseudo, "Downloading package");
    }

    ui.downloadMeta.textContent = `${formatBytes(receivedBytes)} downloaded${totalBytes ? ` / ${formatBytes(totalBytes)}` : ""}`;
  }

  const blob = new Blob(chunks, { type: "application/zip" });
  triggerDownload(blob, fileName);
  ui.downloadMeta.textContent = `Download complete: ${fileName}`;
  return { fileName };
}

function triggerDownload(blob, fileName) {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

function compareVersions(a, b) {
  const left = toVersionParts(a);
  const right = toVersionParts(b);
  const maxLength = Math.max(left.length, right.length);

  for (let i = 0; i < maxLength; i += 1) {
    const lv = left[i] || 0;
    const rv = right[i] || 0;
    if (lv > rv) {
      return 1;
    }
    if (lv < rv) {
      return -1;
    }
  }

  return 0;
}

function toVersionParts(value) {
  return String(value)
    .split(".")
    .map((chunk) => parseInt(chunk.replace(/[^\d]/g, ""), 10))
    .map((num) => (Number.isFinite(num) ? num : 0));
}

function formatBytes(bytes) {
  if (bytes <= 0) {
    return "0 B";
  }
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}
