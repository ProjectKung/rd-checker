using System;
using System.Collections;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Globalization;
using System.IO;
using System.Net;
using System.Text.RegularExpressions;
using System.Threading.Tasks;
using System.Web.Script.Serialization;
using System.Windows.Forms;

namespace RDCheckerNativeUpdater
{
    internal static class Program
    {
        [STAThread]
        private static void Main()
        {
            if (TryInstallIntoExistingLocationFromTemp())
            {
                return;
            }

            ServicePointManager.SecurityProtocol =
                SecurityProtocolType.Tls12 |
                SecurityProtocolType.Tls11 |
                SecurityProtocolType.Tls;

            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new UpdaterForm());
        }

        private static bool TryInstallIntoExistingLocationFromTemp()
        {
            try
            {
                string currentExe = Path.GetFullPath(Application.ExecutablePath);
                string tempRoot = Path.GetFullPath(Path.GetTempPath());

                if (!currentExe.StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase))
                {
                    return false;
                }

                Process current = Process.GetCurrentProcess();
                Process[] sameName = Process.GetProcessesByName(current.ProcessName);
                string targetExe = null;
                int targetPid = -1;

                for (int i = 0; i < sameName.Length; i++)
                {
                    Process process = sameName[i];
                    if (process.Id == current.Id)
                    {
                        continue;
                    }

                    string candidatePath;
                    try
                    {
                        candidatePath = process.MainModule == null ? null : process.MainModule.FileName;
                    }
                    catch
                    {
                        continue;
                    }

                    if (string.IsNullOrWhiteSpace(candidatePath))
                    {
                        continue;
                    }

                    string fullCandidate = Path.GetFullPath(candidatePath);
                    if (fullCandidate.Equals(currentExe, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (fullCandidate.StartsWith(tempRoot, StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    if (!Path.GetFileName(fullCandidate).Equals(Path.GetFileName(currentExe), StringComparison.OrdinalIgnoreCase))
                    {
                        continue;
                    }

                    targetExe = fullCandidate;
                    targetPid = process.Id;
                    break;
                }

                if (string.IsNullOrWhiteSpace(targetExe) || targetPid <= 0)
                {
                    return false;
                }

                string scriptPath = BuildInstallFromTempScript(currentExe, targetExe, targetPid);
                ProcessStartInfo scriptInfo = new ProcessStartInfo("cmd.exe");
                scriptInfo.Arguments = "/c \"" + scriptPath + "\"";
                scriptInfo.UseShellExecute = false;
                scriptInfo.CreateNoWindow = true;
                scriptInfo.WindowStyle = ProcessWindowStyle.Hidden;
                Process.Start(scriptInfo);
                return true;
            }
            catch
            {
                return false;
            }
        }

        private static string BuildInstallFromTempScript(string sourcePath, string destinationPath, int waitProcessId)
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "RDCheckerUpdater");
            Directory.CreateDirectory(tempDir);

            string scriptPath = Path.Combine(
                tempDir,
                "promote-update-" + Guid.NewGuid().ToString("N") + ".cmd");

            string[] lines = new[]
            {
                "@echo off",
                "setlocal",
                "set \"SRC=" + sourcePath + "\"",
                "set \"DST=" + destinationPath + "\"",
                "set \"PID=" + waitProcessId.ToString(CultureInfo.InvariantCulture) + "\"",
                "for /L %%I in (1,1,180) do (",
                "  tasklist /FI \"PID eq %PID%\" 2>nul | find /I \"%PID%\" >nul",
                "  if errorlevel 1 goto copy",
                "  timeout /t 1 /nobreak >nul",
                ")",
                ":copy",
                "for /L %%I in (1,1,60) do (",
                "  copy /y \"%SRC%\" \"%DST%\" >nul 2>&1",
                "  if not errorlevel 1 goto launch",
                "  timeout /t 1 /nobreak >nul",
                ")",
                "goto cleanup",
                ":launch",
                "start \"\" \"%DST%\"",
                ":cleanup",
                "del /f /q \"%SRC%\" >nul 2>&1",
                "del /f /q \"%~f0\" >nul 2>&1",
                "exit /b 0"
            };

            File.WriteAllLines(scriptPath, lines);
            return scriptPath;
        }
    }

    internal sealed class UpdatePackage
    {
        public string Version;
        public string DownloadUrl;
        public string FileName;
        public string ReleaseDate;
    }

    internal sealed class UpdaterForm : Form
    {
        private const string CurrentVersion = "1.1.6";
        private const string CurrentBuildMessage = "fix: sync displayed build note and bump to 1.1.6";
        private const string ReleaseApiUrl = "https://api.github.com/repos/ProjectKung/rd-checker/releases/latest";
        private const string ManifestUrl = "https://raw.githubusercontent.com/ProjectKung/rd-checker/HEAD/updater/update-manifest.json";

        private Panel _titleBar;
        private Label _titleLabel;
        private Label _headingLabel;
        private Label _statusLabel;
        private ProgressBar _progressBar;
        private Label _progressLabel;
        private Label _installedValue;
        private Label _latestValue;
        private Label _releaseValue;
        private Label _buildInfoValue;
        private Button _actionButton;

        private bool _isRunning;

        public UpdaterForm()
        {
            Text = "RD Checker Updater";
            StartPosition = FormStartPosition.CenterScreen;
            FormBorderStyle = FormBorderStyle.None;
            MaximizeBox = false;
            MinimizeBox = false;
            ShowIcon = true;
            ShowInTaskbar = true;
            ClientSize = new Size(560, 420);
            BackColor = Color.FromArgb(20, 30, 45);
            ApplyWindowIcon();

            BuildUi();

            Shown += async (sender, args) => await RunUpdateFlowAsync();
        }

        private void ApplyWindowIcon()
        {
            try
            {
                Icon exeIcon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
                if (exeIcon != null)
                {
                    Icon = exeIcon;
                }
            }
            catch
            {
                // Keep default icon if extraction fails.
            }
        }

        private void BuildUi()
        {
            Panel body = new Panel();
            body.Dock = DockStyle.None;
            body.Location = new Point(0, 38);
            body.Size = new Size(ClientSize.Width, ClientSize.Height - 38);
            body.Anchor = AnchorStyles.Top | AnchorStyles.Bottom | AnchorStyles.Left | AnchorStyles.Right;
            body.BackColor = Color.White;
            body.Padding = new Padding(18, 14, 18, 14);
            Controls.Add(body);

            _titleBar = new Panel();
            _titleBar.Dock = DockStyle.Top;
            _titleBar.Height = 38;
            _titleBar.BackColor = Color.FromArgb(241, 245, 251);
            _titleBar.MouseDown += TitleBar_MouseDown;
            Controls.Add(_titleBar);

            _titleLabel = new Label();
            _titleLabel.Text = "RD Checker Updater";
            _titleLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Bold);
            _titleLabel.ForeColor = Color.FromArgb(34, 49, 74);
            _titleLabel.AutoSize = true;
            _titleLabel.Location = new Point(12, 10);
            _titleLabel.MouseDown += TitleBar_MouseDown;
            _titleBar.Controls.Add(_titleLabel);

            _headingLabel = new Label();
            _headingLabel.Text = "Preparing Update";
            _headingLabel.Font = new Font("Segoe UI", 20f, FontStyle.Bold);
            _headingLabel.AutoSize = true;
            _headingLabel.Location = new Point(14, 18);
            body.Controls.Add(_headingLabel);

            _statusLabel = new Label();
            _statusLabel.Text = "Starting updater...";
            _statusLabel.Font = new Font("Segoe UI", 10f, FontStyle.Regular);
            _statusLabel.ForeColor = Color.FromArgb(58, 74, 98);
            _statusLabel.AutoSize = false;
            _statusLabel.Size = new Size(500, 22);
            _statusLabel.Location = new Point(16, 70);
            body.Controls.Add(_statusLabel);

            _progressBar = new ProgressBar();
            _progressBar.Style = ProgressBarStyle.Marquee;
            _progressBar.MarqueeAnimationSpeed = 24;
            _progressBar.Minimum = 0;
            _progressBar.Maximum = 100;
            _progressBar.Size = new Size(522, 22);
            _progressBar.Location = new Point(16, 100);
            body.Controls.Add(_progressBar);

            _progressLabel = new Label();
            _progressLabel.Text = "Idle - 0%";
            _progressLabel.Font = new Font("Segoe UI", 9.5f, FontStyle.Regular);
            _progressLabel.ForeColor = Color.FromArgb(77, 94, 118);
            _progressLabel.AutoSize = false;
            _progressLabel.TextAlign = ContentAlignment.MiddleRight;
            _progressLabel.Size = new Size(522, 18);
            _progressLabel.Location = new Point(16, 126);
            body.Controls.Add(_progressLabel);

            Label installedKey = BuildMetaKeyLabel("Installed");
            installedKey.Location = new Point(16, 156);
            body.Controls.Add(installedKey);

            _installedValue = BuildMetaValueLabel(CurrentVersion);
            _installedValue.Location = new Point(16, 176);
            body.Controls.Add(_installedValue);

            Label latestKey = BuildMetaKeyLabel("Latest");
            latestKey.Location = new Point(194, 156);
            body.Controls.Add(latestKey);

            _latestValue = BuildMetaValueLabel("-");
            _latestValue.Location = new Point(194, 176);
            body.Controls.Add(_latestValue);

            Label releaseKey = BuildMetaKeyLabel("Release Date");
            releaseKey.Location = new Point(372, 156);
            body.Controls.Add(releaseKey);

            _releaseValue = BuildMetaValueLabel("-");
            _releaseValue.Location = new Point(372, 176);
            body.Controls.Add(_releaseValue);

            Label buildKey = BuildMetaKeyLabel("Current Build");
            buildKey.AutoSize = false;
            buildKey.Size = new Size(522, 18);
            buildKey.TextAlign = ContentAlignment.MiddleLeft;
            buildKey.Location = new Point(16, 212);
            body.Controls.Add(buildKey);

            _buildInfoValue = BuildBuildInfoValueLabel(BuildCurrentBuildText());
            _buildInfoValue.Location = new Point(16, 232);
            body.Controls.Add(_buildInfoValue);

            _actionButton = new Button();
            _actionButton.Text = "Please wait...";
            _actionButton.Enabled = false;
            _actionButton.FlatStyle = FlatStyle.Flat;
            _actionButton.FlatAppearance.BorderSize = 0;
            _actionButton.BackColor = Color.FromArgb(28, 114, 218);
            _actionButton.ForeColor = Color.White;
            _actionButton.Font = new Font("Segoe UI", 10f, FontStyle.Bold);
            _actionButton.Size = new Size(180, 36);
            _actionButton.Location = new Point(358, 320);
            _actionButton.Cursor = Cursors.Hand;
            _actionButton.Click += ActionButton_Click;
            body.Controls.Add(_actionButton);
        }

        private static Label BuildMetaKeyLabel(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.AutoSize = false;
            label.TextAlign = ContentAlignment.MiddleCenter;
            label.Size = new Size(166, 18);
            label.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            label.ForeColor = Color.FromArgb(96, 112, 134);
            return label;
        }

        private static Label BuildMetaValueLabel(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.AutoSize = false;
            label.TextAlign = ContentAlignment.MiddleCenter;
            label.Size = new Size(166, 26);
            label.Font = new Font("Segoe UI", 12f, FontStyle.Bold);
            label.ForeColor = Color.FromArgb(32, 46, 69);
            label.BorderStyle = BorderStyle.FixedSingle;
            return label;
        }

        private static Label BuildBuildInfoValueLabel(string text)
        {
            Label label = new Label();
            label.Text = text;
            label.AutoSize = false;
            label.Size = new Size(522, 54);
            label.Padding = new Padding(8, 6, 8, 6);
            label.Font = new Font("Segoe UI", 8.5f, FontStyle.Regular);
            label.ForeColor = Color.FromArgb(47, 63, 88);
            label.BackColor = Color.FromArgb(248, 250, 253);
            label.BorderStyle = BorderStyle.FixedSingle;
            label.TextAlign = ContentAlignment.TopLeft;
            return label;
        }

        private static string BuildCurrentBuildText()
        {
            return "Version " + CurrentVersion + Environment.NewLine + CurrentBuildMessage;
        }

        private async Task RunUpdateFlowAsync()
        {
            if (_isRunning)
            {
                return;
            }

            _isRunning = true;
            _actionButton.Enabled = false;
            _actionButton.Text = "Please wait...";

            try
            {
                SetStatus("Checking for update package...");
                SetProgressMarquee("Checking");

                UpdatePackage package = await ResolveUpdatePackageAsync();

                if (package == null)
                {
                    throw new InvalidOperationException("Unable to resolve update package.");
                }

                _latestValue.Text = package.Version;
                _releaseValue.Text = string.IsNullOrWhiteSpace(package.ReleaseDate) ? "-" : package.ReleaseDate;

                if (CompareVersions(package.Version, CurrentVersion) <= 0)
                {
                    SetStatus("Already up to date. No action required.");
                    SetProgressValue(100, "Up to date");
                    _actionButton.Enabled = true;
                    _actionButton.Text = "Close";
                    _isRunning = false;
                    return;
                }

                SetStatus("Downloading update file...");
                string downloadedFile = await DownloadPackageAsync(package);

                if (IsExecutablePackage(downloadedFile))
                {
                    SetStatus("Applying update and restarting...");
                    SetProgressValue(100, "Restarting");
                    ScheduleSelfReplaceAndRestart(downloadedFile);
                    return;
                }

                SetProgressMarquee("Installing");
                await LaunchInstallerAsync(downloadedFile);

                SetStatus("Update downloaded and launched successfully.");
                SetProgressValue(100, "Complete");
                _actionButton.Enabled = true;
                _actionButton.Text = "Close";
            }
            catch (Exception ex)
            {
                SetStatus("Update failed: " + NormalizeErrorMessage(ex.Message), true);
                SetProgressValue(0, "Failed");
                _actionButton.Enabled = true;
                _actionButton.Text = "Retry";
            }

            _isRunning = false;
        }

        private async Task<UpdatePackage> ResolveUpdatePackageAsync()
        {
            UpdatePackage fromRelease = await TryResolveFromGithubReleaseAsync();
            UpdatePackage fromManifest = null;
            Exception manifestError = null;

            try
            {
                fromManifest = await TryResolveFromManifestAsync();
            }
            catch (Exception ex)
            {
                manifestError = ex;
            }

            if (fromRelease == null && fromManifest == null)
            {
                if (manifestError != null)
                {
                    throw manifestError;
                }

                throw new InvalidOperationException("Unable to resolve update package.");
            }

            if (fromRelease == null)
            {
                return fromManifest;
            }

            if (fromManifest == null)
            {
                return fromRelease;
            }

            return CompareVersions(fromManifest.Version, fromRelease.Version) >= 0
                ? fromManifest
                : fromRelease;
        }

        private async Task<UpdatePackage> TryResolveFromGithubReleaseAsync()
        {
            try
            {
                string json = await DownloadStringAsync(
                    AddCacheBustingQuery(ReleaseApiUrl, DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture)));
                JavaScriptSerializer serializer = new JavaScriptSerializer();
                IDictionary<string, object> release = serializer.DeserializeObject(json) as IDictionary<string, object>;
                if (release == null)
                {
                    return null;
                }

                string version = NormalizeVersion(ReadString(release, "tag_name"));
                string releaseDate = ReadString(release, "published_at");

                object assetsObj;
                if (!release.TryGetValue("assets", out assetsObj))
                {
                    return null;
                }

                IList assets = assetsObj as IList;
                if (assets == null || assets.Count == 0)
                {
                    return null;
                }

                string bestUrl = null;
                string bestName = null;

                for (int i = 0; i < assets.Count; i++)
                {
                    IDictionary<string, object> asset = assets[i] as IDictionary<string, object>;
                    if (asset == null)
                    {
                        continue;
                    }

                    string assetName = ReadString(asset, "name");
                    string assetUrl = ReadString(asset, "browser_download_url");
                    if (string.IsNullOrWhiteSpace(assetName) || string.IsNullOrWhiteSpace(assetUrl))
                    {
                        continue;
                    }

                    if (assetName.EndsWith(".exe", StringComparison.OrdinalIgnoreCase))
                    {
                        bestName = assetName;
                        bestUrl = assetUrl;
                        if (assetName.StartsWith("RD-Checker-Updater-Setup", StringComparison.OrdinalIgnoreCase))
                        {
                            break;
                        }
                    }
                }

                if (string.IsNullOrWhiteSpace(bestUrl))
                {
                    return null;
                }

                return new UpdatePackage
                {
                    Version = string.IsNullOrWhiteSpace(version) ? CurrentVersion : version,
                    DownloadUrl = bestUrl,
                    FileName = bestName,
                    ReleaseDate = NormalizeDate(releaseDate)
                };
            }
            catch
            {
                return null;
            }
        }

        private async Task<UpdatePackage> TryResolveFromManifestAsync()
        {
            string manifestNoCacheUrl = AddCacheBustingQuery(
                ManifestUrl,
                DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture));
            string json = await DownloadStringAsync(manifestNoCacheUrl);
            JavaScriptSerializer serializer = new JavaScriptSerializer();
            IDictionary<string, object> manifest = serializer.DeserializeObject(json) as IDictionary<string, object>;
            if (manifest == null)
            {
                throw new InvalidOperationException("Invalid update manifest format.");
            }

            string version = NormalizeVersion(ReadString(manifest, "version"));
            string downloadUrl = ReadString(manifest, "package_url");
            string fileName = ReadString(manifest, "package_name");
            string releaseDate = NormalizeDate(ReadString(manifest, "release_date"));

            if (string.IsNullOrWhiteSpace(version) || string.IsNullOrWhiteSpace(downloadUrl))
            {
                throw new InvalidOperationException("Manifest missing required fields.");
            }

            if (string.IsNullOrWhiteSpace(fileName))
            {
                Uri uri = new Uri(downloadUrl);
                fileName = Path.GetFileName(uri.LocalPath);
                if (string.IsNullOrWhiteSpace(fileName))
                {
                    fileName = "rd-checker-update.bin";
                }
            }

            return new UpdatePackage
            {
                Version = version,
                DownloadUrl = downloadUrl,
                FileName = fileName,
                ReleaseDate = releaseDate
            };
        }

        private async Task<string> DownloadPackageAsync(UpdatePackage package)
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "RDCheckerUpdater");
            Directory.CreateDirectory(tempDir);

            string fileName = package.FileName;
            if (string.IsNullOrWhiteSpace(fileName))
            {
                fileName = "RD-Checker-Update-" + package.Version + ".bin";
            }

            string targetPath = Path.Combine(tempDir, fileName);
            if (File.Exists(targetPath))
            {
                File.Delete(targetPath);
            }

            using (WebClient client = CreateWebClient())
            {
                TaskCompletionSource<bool> tcs = new TaskCompletionSource<bool>();

                client.DownloadProgressChanged += (sender, args) =>
                {
                    SetProgressValue(args.ProgressPercentage, "Downloading");
                };

                client.DownloadFileCompleted += (sender, args) =>
                {
                    if (args.Cancelled)
                    {
                        tcs.TrySetException(new InvalidOperationException("Download cancelled."));
                        return;
                    }

                    if (args.Error != null)
                    {
                        tcs.TrySetException(args.Error);
                        return;
                    }

                    tcs.TrySetResult(true);
                };

                string downloadUrl = AddCacheBustingQuery(
                    package.DownloadUrl,
                    package.Version + "-" + DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture));
                client.DownloadFileAsync(new Uri(downloadUrl), targetPath);
                await tcs.Task;
            }

            return targetPath;
        }

        private Task LaunchInstallerAsync(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath) || !File.Exists(filePath))
            {
                throw new FileNotFoundException("Downloaded file not found.", filePath);
            }

            SetStatus("Launching installer...");

            ProcessStartInfo startInfo = new ProcessStartInfo(filePath);
            startInfo.UseShellExecute = true;
            Process.Start(startInfo);
            return Task.FromResult(0);
        }

        private static bool IsExecutablePackage(string filePath)
        {
            if (string.IsNullOrWhiteSpace(filePath))
            {
                return false;
            }

            return Path.GetExtension(filePath).Equals(".exe", StringComparison.OrdinalIgnoreCase);
        }

        private void ScheduleSelfReplaceAndRestart(string downloadedFile)
        {
            string currentExe = Application.ExecutablePath;
            string scriptPath = BuildSelfReplaceScript(downloadedFile, currentExe);

            ProcessStartInfo startInfo = new ProcessStartInfo("cmd.exe");
            startInfo.Arguments = "/c \"" + scriptPath + "\"";
            startInfo.UseShellExecute = false;
            startInfo.CreateNoWindow = true;
            startInfo.WindowStyle = ProcessWindowStyle.Hidden;
            Process.Start(startInfo);

            BeginInvoke(new Action(() =>
            {
                _isRunning = false;
                Close();
            }));
        }

        private static string BuildSelfReplaceScript(string sourcePath, string destinationPath)
        {
            string tempDir = Path.Combine(Path.GetTempPath(), "RDCheckerUpdater");
            Directory.CreateDirectory(tempDir);

            string scriptPath = Path.Combine(
                tempDir,
                "apply-update-" + Guid.NewGuid().ToString("N") + ".cmd");

            string[] lines = new[]
            {
                "@echo off",
                "setlocal",
                "set \"SRC=" + sourcePath + "\"",
                "set \"DST=" + destinationPath + "\"",
                "for /L %%I in (1,1,120) do (",
                "  copy /y \"%SRC%\" \"%DST%\" >nul 2>&1",
                "  if not errorlevel 1 goto launch",
                "  timeout /t 1 /nobreak >nul",
                ")",
                "goto cleanup",
                ":launch",
                "start \"\" \"%DST%\"",
                ":cleanup",
                "del /f /q \"%SRC%\" >nul 2>&1",
                "del /f /q \"%~f0\" >nul 2>&1",
                "exit /b 0"
            };

            File.WriteAllLines(scriptPath, lines);
            return scriptPath;
        }

        private async Task<string> DownloadStringAsync(string url)
        {
            using (WebClient client = CreateWebClient())
            {
                return await client.DownloadStringTaskAsync(url);
            }
        }

        private static string AddCacheBustingQuery(string url, string cacheToken)
        {
            if (string.IsNullOrWhiteSpace(url))
            {
                return url;
            }

            UriBuilder builder = new UriBuilder(url);
            string query = builder.Query;
            if (!string.IsNullOrWhiteSpace(query) && query.StartsWith("?", StringComparison.Ordinal))
            {
                query = query.Substring(1);
            }

            string token = string.IsNullOrWhiteSpace(cacheToken)
                ? DateTime.UtcNow.Ticks.ToString(CultureInfo.InvariantCulture)
                : cacheToken;

            string cacheQuery = "cb=" + Uri.EscapeDataString(token);
            builder.Query = string.IsNullOrWhiteSpace(query) ? cacheQuery : query + "&" + cacheQuery;
            return builder.Uri.ToString();
        }

        private static WebClient CreateWebClient()
        {
            WebClient client = new WebClient();
            client.Headers["User-Agent"] = "RDCheckerNativeUpdater";
            client.Headers[HttpRequestHeader.CacheControl] = "no-cache, no-store, must-revalidate";
            client.Headers["Pragma"] = "no-cache";
            client.Headers["Expires"] = "0";
            client.Encoding = System.Text.Encoding.UTF8;
            return client;
        }

        private void SetStatus(string message, bool isError)
        {
            if (InvokeRequired)
            {
                Invoke(new Action<string, bool>(SetStatus), message, isError);
                return;
            }

            _statusLabel.Text = message;
            _statusLabel.ForeColor = isError ? Color.FromArgb(182, 48, 37) : Color.FromArgb(58, 74, 98);
        }

        private void SetStatus(string message)
        {
            SetStatus(message, false);
        }

        private void SetProgressMarquee(string title)
        {
            if (InvokeRequired)
            {
                Invoke(new Action<string>(SetProgressMarquee), title);
                return;
            }

            _progressBar.Style = ProgressBarStyle.Marquee;
            _progressBar.MarqueeAnimationSpeed = 22;
            _progressLabel.Text = title + " - ...";
        }

        private void SetProgressValue(int value, string title)
        {
            if (InvokeRequired)
            {
                Invoke(new Action<int, string>(SetProgressValue), value, title);
                return;
            }

            if (_progressBar.Style != ProgressBarStyle.Continuous)
            {
                _progressBar.Style = ProgressBarStyle.Continuous;
            }

            int safe = Math.Max(0, Math.Min(100, value));
            _progressBar.Value = safe;
            _progressLabel.Text = title + " - " + safe.ToString(CultureInfo.InvariantCulture) + "%";
        }

        private void ActionButton_Click(object sender, EventArgs e)
        {
            if (_isRunning)
            {
                return;
            }

            if (_actionButton.Text.Equals("Retry", StringComparison.OrdinalIgnoreCase))
            {
                Task.Run(async () => await RunUpdateFlowAsync());
                return;
            }

            Close();
        }

        private static string ReadString(IDictionary<string, object> dict, string key)
        {
            if (dict == null)
            {
                return null;
            }

            object value;
            if (!dict.TryGetValue(key, out value) || value == null)
            {
                return null;
            }

            return Convert.ToString(value, CultureInfo.InvariantCulture);
        }

        private static string NormalizeVersion(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return string.Empty;
            }

            string normalized = value.Trim();
            if (normalized.StartsWith("v", StringComparison.OrdinalIgnoreCase))
            {
                normalized = normalized.Substring(1);
            }
            return normalized;
        }

        private static string NormalizeDate(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return "-";
            }

            string trimmed = value.Trim();
            if (Regex.IsMatch(trimmed, @"^\d{4}-\d{2}-\d{2}$"))
            {
                return trimmed;
            }

            DateTime parsed;
            string[] exactFormats = new[]
            {
                "yyyy-MM-ddTHH:mm:ssZ",
                "yyyy-MM-ddTHH:mm:ss.fffZ",
                "yyyy-MM-ddTHH:mm:ssK",
                "yyyy-MM-dd HH:mm:ss",
                "yyyy-MM-dd"
            };

            if (DateTime.TryParseExact(
                trimmed,
                exactFormats,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out parsed))
            {
                return parsed.ToLocalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
            }

            if (DateTime.TryParse(
                trimmed,
                CultureInfo.InvariantCulture,
                DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal,
                out parsed))
            {
                return parsed.ToLocalTime().ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture);
            }

            return trimmed;
        }

        private static string NormalizeErrorMessage(string text)
        {
            if (string.IsNullOrWhiteSpace(text))
            {
                return "Unknown error.";
            }

            if (text.IndexOf("No published versions on GitHub", StringComparison.OrdinalIgnoreCase) >= 0)
            {
                return "No published GitHub Release found yet.";
            }

            return text;
        }

        private static int CompareVersions(string left, string right)
        {
            int[] a = ParseVersion(left);
            int[] b = ParseVersion(right);

            int length = Math.Max(a.Length, b.Length);
            for (int i = 0; i < length; i++)
            {
                int av = i < a.Length ? a[i] : 0;
                int bv = i < b.Length ? b[i] : 0;
                if (av > bv)
                {
                    return 1;
                }
                if (av < bv)
                {
                    return -1;
                }
            }
            return 0;
        }

        private static int[] ParseVersion(string value)
        {
            if (string.IsNullOrWhiteSpace(value))
            {
                return new[] { 0 };
            }

            string[] parts = value.Split('.');
            int[] output = new int[parts.Length];
            for (int i = 0; i < parts.Length; i++)
            {
                string digits = Regex.Replace(parts[i], @"[^\d]", string.Empty);
                int parsed;
                if (!int.TryParse(digits, NumberStyles.Integer, CultureInfo.InvariantCulture, out parsed))
                {
                    parsed = 0;
                }
                output[i] = parsed;
            }
            return output;
        }

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern bool ReleaseCapture();

        [System.Runtime.InteropServices.DllImport("user32.dll")]
        private static extern IntPtr SendMessage(IntPtr hWnd, int msg, int wParam, int lParam);

        private void TitleBar_MouseDown(object sender, MouseEventArgs e)
        {
            if (e.Button == MouseButtons.Left)
            {
                ReleaseCapture();
                SendMessage(Handle, 0xA1, 0x2, 0);
            }
        }
    }
}

