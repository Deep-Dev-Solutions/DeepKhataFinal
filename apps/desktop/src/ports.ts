import * as net from 'node:net';

/** Ask the OS for a free TCP port (listen on 0, read it back, close). */
export function getFreePort(host = '127.0.0.1'): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      if (address && typeof address === 'object') {
        const { port } = address;
        server.close((err) => (err ? reject(err) : resolve(port)));
      } else {
        server.close(() => reject(new Error('Could not determine free port')));
      }
    });
  });
}

/** True when `port` can be bound on `host` right now. */
export function isPortFree(port: number, host = '127.0.0.1'): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, host, () => server.close(() => resolve(true)));
  });
}

/**
 * Use `preferred` when free, otherwise any free port. The client bakes
 * NEXT_PUBLIC_API_URL at build time, so the API should get its preferred port.
 */
export async function getPortOrFree(preferred: number | undefined, host = '127.0.0.1'): Promise<number> {
  if (preferred && (await isPortFree(preferred, host))) return preferred;
  return getFreePort(host);
}
