import { createServer } from 'node:http';
import { createApp } from '../http/app.js';

export function createServiceServer(options) {
  const server = createServer({ maxHeaderSize: 16 * 1024 }, createApp(options));
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  // Responses may include two sequential bounded45s provider calls plus bridge
  // handshakes. Headers/bodies keep their independent short upload deadlines.
  server.timeout = 360_000;
  server.keepAliveTimeout = 5_000;
  server.maxRequestsPerSocket = 100;
  return server;
}

export function closeServer(server, deadlineMs = 10_000) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      server.closeAllConnections();
      reject(new Error('Shutdown deadline exceeded.'));
    }, deadlineMs);
    server.close((error) => {
      clearTimeout(deadline);
      if (error) reject(error);
      else resolve();
    });
  });
}

export function createShutdownHandler(server, deadlineMs = 10_000) {
  let stopping = false;
  return async () => {
    if (stopping) return;
    stopping = true;
    console.log('Stopping Dynamic Adverts.');
    // Keep a deadline even if the caller disconnected before shutdown: closing
    // inbound sockets alone cannot observe retained outbound provider work.
    const forceExit = setTimeout(() => {
      console.error('Server did not shut down cleanly.');
      process.exit(1);
    }, deadlineMs);
    forceExit.unref(); // A genuinely drained process can exit normally at once.
    try {
      await closeServer(server, deadlineMs);
    } catch {
      console.error('Server did not shut down cleanly.');
      // In-flight outbound provider/bridge fetches can still hold handles after
      // inbound sockets close. Durable PHP grants retain unknown reservations.
      process.exit(1);
    }
  };
}
