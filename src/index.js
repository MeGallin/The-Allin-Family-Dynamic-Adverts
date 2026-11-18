import { readConfig } from './config/server-config.js';
import { createServiceServer, createShutdownHandler } from './server/http-server.js';

let config;
try {
  config = readConfig();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exitCode = 1;
}

if (config) {
  const server = createServiceServer();
  const shutdown = createShutdownHandler(server);
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
  server.on('error', () => {
    console.error('Server error: unable to run the HTTP listener.');
    process.exitCode = 1;
    if (server.listening) void shutdown();
  });
  server.listen(config.port, config.host, () => {
    console.log(`Dynamic Adverts is online on port ${config.port}.`);
  });
}
