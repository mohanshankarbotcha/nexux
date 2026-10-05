using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Drawing;
using System.Windows.Forms;
using System.Threading;
using Microsoft.Win32;

namespace NexusAI.Installer
{
    public class SetupForm : Form
    {
        private ProgressBar progressBar;
        private Label statusLabel;
        private Label titleLabel;
        private Label subtitleLabel;
        private CheckBox chkDesktopShortcut;
        private CheckBox chkStartMenuShortcut;
        private CheckBox chkLaunchApp;
        private Button btnInstall;
        private Button btnCancel;
        private TextBox txtInstallDir;
        private bool isSilent = false;
        private string targetDir;

        [STAThread]
        public static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool silent = false;
            string customDir = null;

            foreach (string arg in args)
            {
                if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("-s", StringComparison.OrdinalIgnoreCase))
                {
                    silent = true;
                }
                else if (arg.StartsWith("/D=", StringComparison.OrdinalIgnoreCase))
                {
                    customDir = arg.Substring(3).Trim('"', ' ');
                }
            }

            if (silent)
            {
                try
                {
                    PerformSilentInstall(customDir);
                    return 0;
                }
                catch (Exception ex)
                {
                    Console.Error.WriteLine("Silent install error: " + ex.Message);
                    return 1;
                }
            }

            SetupForm form = new SetupForm(customDir);
            Application.Run(form);
            return 0;
        }

        public SetupForm(string customDir)
        {
            targetDir = !string.IsNullOrEmpty(customDir)
                ? customDir
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "NEXUS.AI");

            InitializeComponents();
        }

        private void InitializeComponents()
        {
            this.Text = "NEXUS.AI v1.0.0 Setup";
            this.Size = new Size(540, 420);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.BackColor = Color.FromArgb(7, 10, 18);
            this.ForeColor = Color.FromArgb(240, 240, 240);

            // Title
            titleLabel = new Label();
            titleLabel.Text = "NEXUS.AI";
            titleLabel.Font = new Font("Segoe UI", 18, FontStyle.Bold);
            titleLabel.ForeColor = Color.FromArgb(96, 165, 250);
            titleLabel.Location = new Point(30, 25);
            titleLabel.AutoSize = true;
            this.Controls.Add(titleLabel);

            // Subtitle
            subtitleLabel = new Label();
            subtitleLabel.Text = "Autonomous AI Coding Assistant Platform — Version 1.0.0";
            subtitleLabel.Font = new Font("Segoe UI", 10, FontStyle.Regular);
            subtitleLabel.ForeColor = Color.FromArgb(156, 163, 175);
            subtitleLabel.Location = new Point(32, 60);
            subtitleLabel.AutoSize = true;
            this.Controls.Add(subtitleLabel);

            // Divider panel
            Panel divider = new Panel();
            divider.BackColor = Color.FromArgb(31, 41, 55);
            divider.Location = new Point(30, 95);
            divider.Size = new Size(465, 1);
            this.Controls.Add(divider);

            // Install Dir Label
            Label dirLabel = new Label();
            dirLabel.Text = "Destination Folder:";
            dirLabel.Font = new Font("Segoe UI", 9, FontStyle.Bold);
            dirLabel.ForeColor = Color.FromArgb(209, 213, 219);
            dirLabel.Location = new Point(30, 115);
            dirLabel.AutoSize = true;
            this.Controls.Add(dirLabel);

            // Install Dir TextBox
            txtInstallDir = new TextBox();
            txtInstallDir.Text = targetDir;
            txtInstallDir.Location = new Point(32, 140);
            txtInstallDir.Size = new Size(463, 25);
            txtInstallDir.ReadOnly = true;
            txtInstallDir.BackColor = Color.FromArgb(17, 24, 39);
            txtInstallDir.ForeColor = Color.FromArgb(229, 231, 235);
            txtInstallDir.BorderStyle = BorderStyle.FixedSingle;
            this.Controls.Add(txtInstallDir);

            // Checkboxes
            chkDesktopShortcut = new CheckBox();
            chkDesktopShortcut.Text = "Create Desktop shortcut";
            chkDesktopShortcut.Checked = true;
            chkDesktopShortcut.ForeColor = Color.FromArgb(209, 213, 219);
            chkDesktopShortcut.Location = new Point(35, 185);
            chkDesktopShortcut.AutoSize = true;
            this.Controls.Add(chkDesktopShortcut);

            chkStartMenuShortcut = new CheckBox();
            chkStartMenuShortcut.Text = "Create Start Menu shortcut";
            chkStartMenuShortcut.Checked = true;
            chkStartMenuShortcut.ForeColor = Color.FromArgb(209, 213, 219);
            chkStartMenuShortcut.Location = new Point(35, 215);
            chkStartMenuShortcut.AutoSize = true;
            this.Controls.Add(chkStartMenuShortcut);

            chkLaunchApp = new CheckBox();
            chkLaunchApp.Text = "Launch NEXUS.AI when installation completes";
            chkLaunchApp.Checked = true;
            chkLaunchApp.ForeColor = Color.FromArgb(209, 213, 219);
            chkLaunchApp.Location = new Point(35, 245);
            chkLaunchApp.AutoSize = true;
            this.Controls.Add(chkLaunchApp);

            // Status Label
            statusLabel = new Label();
            statusLabel.Text = "Ready to install NEXUS.AI on your computer.";
            statusLabel.Font = new Font("Segoe UI", 9, FontStyle.Italic);
            statusLabel.ForeColor = Color.FromArgb(156, 163, 175);
            statusLabel.Location = new Point(32, 285);
            statusLabel.Size = new Size(463, 20);
            this.Controls.Add(statusLabel);

            // Progress Bar
            progressBar = new ProgressBar();
            progressBar.Location = new Point(32, 310);
            progressBar.Size = new Size(463, 18);
            progressBar.Style = ProgressBarStyle.Blocks;
            progressBar.Visible = false;
            this.Controls.Add(progressBar);

            // Buttons
            btnInstall = new Button();
            btnInstall.Text = "Install";
            btnInstall.Size = new Size(100, 32);
            btnInstall.Location = new Point(285, 338);
            btnInstall.BackColor = Color.FromArgb(37, 99, 235);
            btnInstall.ForeColor = Color.White;
            btnInstall.FlatStyle = FlatStyle.Flat;
            btnInstall.FlatAppearance.BorderSize = 0;
            btnInstall.Cursor = Cursors.Hand;
            btnInstall.Click += BtnInstall_Click;
            this.Controls.Add(btnInstall);

            btnCancel = new Button();
            btnCancel.Text = "Cancel";
            btnCancel.Size = new Size(100, 32);
            btnCancel.Location = new Point(395, 338);
            btnCancel.BackColor = Color.FromArgb(31, 41, 55);
            btnCancel.ForeColor = Color.FromArgb(209, 213, 219);
            btnCancel.FlatStyle = FlatStyle.Flat;
            btnCancel.FlatAppearance.BorderSize = 0;
            btnCancel.Cursor = Cursors.Hand;
            btnCancel.Click += (s, e) => this.Close();
            this.Controls.Add(btnCancel);
        }

        private void BtnInstall_Click(object sender, EventArgs e)
        {
            btnInstall.Enabled = false;
            btnCancel.Enabled = false;
            chkDesktopShortcut.Enabled = false;
            chkStartMenuShortcut.Enabled = false;
            progressBar.Visible = true;
            progressBar.Value = 10;
            statusLabel.Text = "Installing NEXUS.AI application binaries...";

            Thread installThread = new Thread(() =>
            {
                try
                {
                    InstallCore(targetDir, (msg, pct) =>
                    {
                        this.Invoke((MethodInvoker)delegate
                        {
                            statusLabel.Text = msg;
                            progressBar.Value = Math.Min(100, Math.Max(0, pct));
                        });
                    });

                    if (chkDesktopShortcut.Checked)
                    {
                        CreateDesktopShortcut(targetDir);
                    }
                    if (chkStartMenuShortcut.Checked)
                    {
                        CreateStartMenuShortcut(targetDir);
                    }

                    RegisterUninstall(targetDir);

                    this.Invoke((MethodInvoker)delegate
                    {
                        progressBar.Value = 100;
                        statusLabel.Text = "Installation complete!";
                        btnCancel.Text = "Close";
                        btnCancel.Enabled = true;

                        if (chkLaunchApp.Checked)
                        {
                            LaunchInstalledApp(targetDir);
                            this.Close();
                        }
                        else
                        {
                            MessageBox.Show(this, "NEXUS.AI has been successfully installed!", "Setup Complete", MessageBoxButtons.OK, MessageBoxIcon.Information);
                            this.Close();
                        }
                    });
                }
                catch (Exception ex)
                {
                    this.Invoke((MethodInvoker)delegate
                    {
                        statusLabel.Text = "Installation failed: " + ex.Message;
                        MessageBox.Show(this, "Installation error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        btnCancel.Enabled = true;
                    });
                }
            });

            installThread.IsBackground = true;
            installThread.Start();
        }

        public static void PerformSilentInstall(string customDir)
        {
            string dir = !string.IsNullOrEmpty(customDir)
                ? customDir
                : Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "NEXUS.AI");

            InstallCore(dir, (msg, pct) => { });
            CreateDesktopShortcut(dir);
            CreateStartMenuShortcut(dir);
            RegisterUninstall(dir);
        }

        public static void InstallCore(string destDir, Action<string, int> progress)
        {
            progress("Creating installation directory...", 15);
            if (!Directory.Exists(destDir))
            {
                Directory.CreateDirectory(destDir);
            }

            progress("Extracting application payload...", 30);

            // 1. Try embedded resource "NEXUS_PAYLOAD"
            Assembly asm = Assembly.GetExecutingAssembly();
            Stream resStream = asm.GetManifestResourceStream("NEXUS_PAYLOAD");

            if (resStream != null)
            {
                using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read))
                {
                    int total = archive.Entries.Count;
                    int current = 0;
                    foreach (ZipArchiveEntry entry in archive.Entries)
                    {
                        current++;
                        // Avoid top-level root folder prefix if archived with NEXUS_AI-win32-x64/
                        string entryName = entry.FullName.Replace('\\', '/');
                        if (entryName.StartsWith("NEXUS_AI-win32-x64/"))
                        {
                            entryName = entryName.Substring("NEXUS_AI-win32-x64/".Length);
                        }

                        if (string.IsNullOrEmpty(entryName)) continue;

                        string destPath = Path.Combine(destDir, entryName.Replace('/', Path.DirectorySeparatorChar));

                        if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                        {
                            if (!Directory.Exists(destPath)) Directory.CreateDirectory(destPath);
                        }
                        else
                        {
                            string parent = Path.GetDirectoryName(destPath);
                            if (!Directory.Exists(parent)) Directory.CreateDirectory(parent);
                            entry.ExtractToFile(destPath, true);
                        }

                        if (current % 25 == 0 || current == total)
                        {
                            int pct = 30 + (int)((float)current / total * 55.0f);
                            progress("Extracting " + Path.GetFileName(entryName) + "...", pct);
                        }
                    }
                }
            }
            else
            {
                // Fallback: look for sibling zip archive NEXUS_AI_Windows_x64.zip
                string siblingZip = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "NEXUS_AI_Windows_x64.zip");
                if (File.Exists(siblingZip))
                {
                    using (ZipArchive archive = ZipFile.OpenRead(siblingZip))
                    {
                        int total = archive.Entries.Count;
                        int current = 0;
                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            current++;
                            string entryName = entry.FullName.Replace('\\', '/');
                            if (entryName.StartsWith("NEXUS_AI-win32-x64/"))
                            {
                                entryName = entryName.Substring("NEXUS_AI-win32-x64/".Length);
                            }
                            if (string.IsNullOrEmpty(entryName)) continue;

                            string destPath = Path.Combine(destDir, entryName.Replace('/', Path.DirectorySeparatorChar));
                            if (entry.FullName.EndsWith("/") || entry.FullName.EndsWith("\\"))
                            {
                                if (!Directory.Exists(destPath)) Directory.CreateDirectory(destPath);
                            }
                            else
                            {
                                string parent = Path.GetDirectoryName(destPath);
                                if (!Directory.Exists(parent)) Directory.CreateDirectory(parent);
                                entry.ExtractToFile(destPath, true);
                            }
                            if (current % 25 == 0 || current == total)
                            {
                                int pct = 30 + (int)((float)current / total * 55.0f);
                                progress("Extracting files...", pct);
                            }
                        }
                    }
                }
                else
                {
                    throw new FileNotFoundException("Could not locate NEXUS.AI application archive payload.");
                }
            }

            progress("Configuring uninstaller...", 90);
            // Write uninstall.exe if bundled adjacent or embedded
            Stream uninstallerStream = asm.GetManifestResourceStream("UNINSTALLER_EXE");
            if (uninstallerStream != null)
            {
                string uninstallerPath = Path.Combine(destDir, "uninstall.exe");
                using (FileStream fs = new FileStream(uninstallerPath, FileMode.Create, FileAccess.Write))
                {
                    uninstallerStream.CopyTo(fs);
                }
            }
        }

        public static void CreateDesktopShortcut(string appDir)
        {
            string desktopDir = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            string shortcutPath = Path.Combine(desktopDir, "NEXUS.AI.lnk");
            string targetExe = Path.Combine(appDir, "NEXUS_AI.exe");
            string iconPath = Path.Combine(appDir, "assets", "icon.ico");
            if (!File.Exists(iconPath)) iconPath = targetExe;

            CreateShortcut(shortcutPath, targetExe, appDir, iconPath, "NEXUS.AI — Autonomous AI Coding Assistant");
        }

        public static void CreateStartMenuShortcut(string appDir)
        {
            string programsDir = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
            string appMenuDir = Path.Combine(programsDir, "NEXUS.AI");
            if (!Directory.Exists(appMenuDir)) Directory.CreateDirectory(appMenuDir);

            string shortcutPath = Path.Combine(appMenuDir, "NEXUS.AI.lnk");
            string targetExe = Path.Combine(appDir, "NEXUS_AI.exe");
            string iconPath = Path.Combine(appDir, "assets", "icon.ico");
            if (!File.Exists(iconPath)) iconPath = targetExe;

            CreateShortcut(shortcutPath, targetExe, appDir, iconPath, "NEXUS.AI — Autonomous AI Coding Assistant");

            string uninstallExe = Path.Combine(appDir, "uninstall.exe");
            if (File.Exists(uninstallExe))
            {
                string uninstallLnk = Path.Combine(appMenuDir, "Uninstall NEXUS.AI.lnk");
                CreateShortcut(uninstallLnk, uninstallExe, appDir, uninstallExe, "Uninstall NEXUS.AI");
            }
        }

        private static void CreateShortcut(string shortcutPath, string targetPath, string workingDir, string iconLocation, string description)
        {
            Type shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType != null)
            {
                dynamic shell = Activator.CreateInstance(shellType);
                dynamic shortcut = shell.CreateShortcut(shortcutPath);
                shortcut.TargetPath = targetPath;
                shortcut.WorkingDirectory = workingDir;
                shortcut.Description = description;
                if (File.Exists(iconLocation))
                {
                    shortcut.IconLocation = iconLocation + ",0";
                }
                shortcut.Save();
            }
        }

        public static void RegisterUninstall(string appDir)
        {
            try
            {
                string keyPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\NEXUS.AI";
                using (RegistryKey key = Registry.CurrentUser.CreateSubKey(keyPath))
                {
                    if (key != null)
                    {
                        string exePath = Path.Combine(appDir, "NEXUS_AI.exe");
                        string uninstPath = Path.Combine(appDir, "uninstall.exe");
                        string iconPath = Path.Combine(appDir, "assets", "icon.ico");

                        key.SetValue("DisplayName", "NEXUS.AI");
                        key.SetValue("DisplayVersion", "1.0.0");
                        key.SetValue("Publisher", "NEXUS.AI");
                        key.SetValue("InstallLocation", appDir);
                        key.SetValue("UninstallString", "\"" + uninstPath + "\"");
                        key.SetValue("QuietUninstallString", "\"" + uninstPath + "\" /S");
                        key.SetValue("DisplayIcon", File.Exists(iconPath) ? iconPath : exePath);
                        key.SetValue("HelpLink", "https://github.com/mohanshankarbotcha/nexux");
                        key.SetValue("URLInfoAbout", "https://github.com/mohanshankarbotcha/nexux");
                        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
                        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);
                    }
                }
            }
            catch { }
        }

        public static void LaunchInstalledApp(string appDir)
        {
            try
            {
                string exePath = Path.Combine(appDir, "NEXUS_AI.exe");
                if (File.Exists(exePath))
                {
                    ProcessStartInfo psi = new ProcessStartInfo(exePath);
                    psi.WorkingDirectory = appDir;
                    Process.Start(psi);
                }
            }
            catch { }
        }
    }
}
