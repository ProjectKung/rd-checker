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

const state = {
  installedVersion: localStorage.getItem(CONFIG.storageKey) || CONFIG.defaultVersion,
  manifest: null
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

init();

function init() {
  ui.installedVersion.textContent = state.installedVersion;
  ui.checkBtn.addEventListener("click", handleCheckUpdate);
  ui.updateBtn.addEventListener("click", handleUpdateNow);
  ui.closeSuccessBtn.addEventListener("click", () => {
    ui.successPanel.hidden = true;
  });
}

async function handleCheckUpdate() {
  ui.checkBtn.disabled = true;
  ui.updateBtn.disabled = true;
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

async function handleUpdateNow() {
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
      const data = await response.json();
      return data;
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
  renderNotes(manifest.notes);
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
  ui.statusText.classList.toggle("error", !!isError);
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
      const percent = (receivedBytes / totalBytes) * 100;
      setProgress(percent, "Downloading package");
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
    .map((n) => (Number.isFinite(n) ? n : 0));
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
