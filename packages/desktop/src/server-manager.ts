import net from 'node:net';
import http from 'node:http';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { createNexusApp, globalStorage } from '@nexus/server';
import { logger, DEFAULT_SERVER_CONFIG } from '@nexus/core';

export interface ServerManagerOptions {
  preferredPort?: number;
  dataDir?: string;
  host?: string;
}

export interface RunningServerInfo {
  server: http.Server;
  port: number;
  host: string;
  url: string;
  dataDir: string;
  stop: () => Promise<void>;
}

/**
 * Checks if a specific port is free on the specified host (default 127.0.0.1).
 */
export function isPortAvailable(port: number, host: string = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once('error', () => {
      resolve(false);
    });
    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });
    tester.listen(port, host);
  });
}

/**
 * Finds an available port starting from startPort up to maxAttempts.
 */
export async function findAvailablePort(
  startPort: number = DEFAULT_SERVER_CONFIG.defaultPort,
  maxAttempts: number = 30,
  host: string = '127.0.0.1'
): Promise<number> {
  for (let p = startPort; p < startPort + maxAttempts; p++) {
    if (await isPortAvailable(p, host)) {
      return p;
    }
  }
  // Fallback: pick any random free port assigned by OS
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, host, () => {
      const address = srv.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      srv.close((err) => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    srv.on('error', reject);
  });
}

/**
 * Resolves the persistent application data directory for the desktop app.
 * Follows Windows %APPDATA%\NEXUS_AI_DATA conventions.
 */
export function resolveUserDataDir(customDir?: string): string {
  const full = customDir
    ? path.resolve(customDir)
    : path.join(
        process.env.APPDATA || process.env.LOCALAPPDATA || path.join(os.homedir(), '.nexus_ai'),
        'NEXUS_AI_DATA'
      );
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true, mode: 0o700 });
  }
  return full;
}

export class ServerManager {
  private activeServer: http.Server | null = null;
  private activePort: number | null = null;
  private isStopping = false;

  /**
   * Starts the embedded NEXUS backend HTTP server on loopback interface (127.0.0.1).
   */
  async start(options: ServerManagerOptions = {}): Promise<RunningServerInfo> {
    if (this.activeServer) {
      throw new Error(`Server is already running on port ${this.activePort}`);
    }

    const host = options.host || '127.0.0.1';
    const preferredPort = options.preferredPort ?? DEFAULT_SERVER_CONFIG.defaultPort;
    const port = (await isPortAvailable(preferredPort, host))
      ? preferredPort
      : await findAvailablePort(preferredPort + 1, 50, host);

    const dataDir = resolveUserDataDir(options.dataDir);
    process.env.NEXUS_DATA_DIR = dataDir;
    globalStorage.setDataDir(dataDir);

    const app = createNexusApp();

    return new Promise<RunningServerInfo>((resolve, reject) => {
      const server = http.createServer(app);
      const connections = new Set<net.Socket>();

      server.on('connection', (socket) => {
        connections.add(socket);
        socket.once('close', () => connections.delete(socket));
      });

      server.once('error', (err) => {
        logger.error(`Desktop ServerManager failed to listen on ${host}:${port}:`, err);
        reject(err);
      });

      server.listen(port, host, () => {
        this.activeServer = server;
        this.activePort = port;
        this.isStopping = false;

        const url = `http://${host}:${port}`;
        logger.info(`Desktop ServerManager: Embedded server running on ${url} (DataDir: ${dataDir})`);

        const stop = async (): Promise<void> => {
          if (this.isStopping) return;
          this.isStopping = true;

          return new Promise<void>((res) => {
            // Destroy all active keep-alive sockets for immediate shutdown
            for (const socket of connections) {
              socket.destroy();
            }
            connections.clear();

            server.close(() => {
              this.activeServer = null;
              this.activePort = null;
              this.isStopping = false;
              logger.info(`Desktop ServerManager: Server on ${url} stopped cleanly`);
              res();
            });
          });
        };

        resolve({
          server,
          port,
          host,
          url,
          dataDir,
          stop,
        });
      });
    });
  }

  /**
   * Returns current active port if running.
   */
  getPort(): number | null {
    return this.activePort;
  }

  /**
   * Shuts down active server if one is running.
   */
  async stop(): Promise<void> {
    if (this.activeServer) {
      return new Promise<void>((resolve) => {
        this.activeServer?.close(() => {
          this.activeServer = null;
          this.activePort = null;
          resolve();
        });
      });
    }
  }
}
