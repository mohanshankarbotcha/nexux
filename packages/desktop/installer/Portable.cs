using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Windows.Forms;

namespace NexusAI.Portable
{
    public class PortableRunner
    {
        [STAThread]
        public static int Main(string[] args)
        {
            try
            {
                string tempDir = Path.Combine(Path.GetTempPath(), "NEXUS_AI_PORTABLE_v100");
                string exePath = Path.Combine(tempDir, "NEXUS_AI.exe");

                if (!File.Exists(exePath))
                {
                    if (Directory.Exists(tempDir))
                    {
                        try { Directory.Delete(tempDir, true); } catch { }
                    }
                    Directory.CreateDirectory(tempDir);

                    Assembly asm = Assembly.GetExecutingAssembly();
                    Stream resStream = asm.GetManifestResourceStream("NEXUS_PAYLOAD");
                    if (resStream == null)
                    {
                        string siblingZip = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "NEXUS_AI_Windows_x64.zip");
                        if (File.Exists(siblingZip))
                        {
                            resStream = File.OpenRead(siblingZip);
                        }
                    }

                    if (resStream != null)
                    {
                        using (ZipArchive archive = new ZipArchive(resStream, ZipArchiveMode.Read))
                        {
                            foreach (ZipArchiveEntry entry in archive.Entries)
                            {
                                string entryName = entry.FullName.Replace('\\', '/');
                                if (entryName.StartsWith("NEXUS_AI-win32-x64/"))
                                {
                                    entryName = entryName.Substring("NEXUS_AI-win32-x64/".Length);
                                }
                                if (string.IsNullOrEmpty(entryName)) continue;

                                string destPath = Path.Combine(tempDir, entryName.Replace('/', Path.DirectorySeparatorChar));
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
                            }
                        }
                        resStream.Dispose();
                    }
                }

                if (!File.Exists(exePath))
                {
                    MessageBox.Show("Could not unpack portable NEXUS.AI runtime.", "Launch Error", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    return 1;
                }

                ProcessStartInfo psi = new ProcessStartInfo(exePath);
                psi.WorkingDirectory = tempDir;
                psi.Arguments = string.Join(" ", args);

                Process p = Process.Start(psi);
                p.WaitForExit();
                return p.ExitCode;
            }
            catch (Exception ex)
            {
                MessageBox.Show("NEXUS.AI Portable failed to launch:\n" + ex.Message, "Portable Launch Failure", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
        }
    }
}
