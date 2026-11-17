import { createServer } from 'node:http';
import { createApp } from '../http/app.js';

export function createServiceServer() {
  const server = createServer({ maxHeaderSize: 16 * 1024 }, createApp());
  server.requestTimeout = 15_000;
  server.headersTimeout = 10_000;
  server.timeout = 15_000;
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
