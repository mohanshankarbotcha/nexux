using System;
using System.IO;
using System.Diagnostics;
using System.Windows.Forms;
using Microsoft.Win32;

namespace NexusAI.Uninstaller
{
    public class UninstallProgram
    {
        [STAThread]
        public static int Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);

            bool silent = false;
            foreach (string arg in args)
            {
                if (arg.Equals("/S", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("/silent", StringComparison.OrdinalIgnoreCase) ||
                    arg.Equals("-s", StringComparison.OrdinalIgnoreCase))
                {
                    silent = true;
                }
            }

            if (!silent)
            {
                DialogResult dr = MessageBox.Show(
                    "Are you sure you want to uninstall NEXUS.AI?\n\nNote: Your personal workspace projects and stored API credentials in AppData will NOT be deleted.",
                    "NEXUS.AI Uninstall",
                    MessageBoxButtons.YesNo,
                    MessageBoxIcon.Question
                );

                if (dr != DialogResult.Yes)
                {
                    return 0;
                }
            }

            try
            {
                // 1. Terminate running NEXUS.AI instances
                foreach (Process p in Process.GetProcessesByName("NEXUS_AI"))
                {
                    try
                    {
                        p.Kill();
                        p.WaitForExit(3000);
                    }
                    catch { }
                }

                // 2. Remove Shortcuts
                string desktopShortcut = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "NEXUS.AI.lnk");
                if (File.Exists(desktopShortcut))
                {
                    try { File.Delete(desktopShortcut); } catch { }
                }

                string startMenuDir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.Programs), "NEXUS.AI");
                if (Directory.Exists(startMenuDir))
                {
                    try { Directory.Delete(startMenuDir, true); } catch { }
                }

                // 3. Remove Registry Key
                try
                {
                    Registry.CurrentUser.DeleteSubKeyTree(@"Software\Microsoft\Windows\CurrentVersion\Uninstall\NEXUS.AI", false);
                }
                catch { }

                // 4. Remove Installation Directory via self-deleting cmd delayed execution
                string appDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');

                string batchDelete = string.Format(
                    "/c ping 127.0.0.1 -n 2 > nul & rmdir /s /q \"{0}\"",
                    appDir
                );

                ProcessStartInfo psi = new ProcessStartInfo("cmd.exe", batchDelete);
                psi.WindowStyle = ProcessWindowStyle.Hidden;
                psi.CreateNoWindow = true;
                Process.Start(psi);

                if (!silent)
                {
                    MessageBox.Show(
                        "NEXUS.AI was successfully uninstalled from your computer.",
                        "Uninstall Complete",
                        MessageBoxButtons.OK,
                        MessageBoxIcon.Information
                    );
                }

                return 0;
            }
            catch (Exception ex)
            {
                if (!silent)
                {
                    MessageBox.Show("Uninstall error: " + ex.Message, "Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }
                return 1;
            }
        }
    }
}
