import { readConfig } from './config/server-config.js';
import { createServiceServer, closeServer } from './server/http-server.js';

let config;
try {
  config = readConfig();
} catch (error) {
  console.error(`Configuration error: ${error.message}`);
  process.exitCode = 1;
}

if (config) {
  const server = createServiceServer();
  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log('Stopping Dynamic Adverts.');
    try {
      await closeServer(server);
    } catch {
      console.error('Server did not shut down cleanly.');
      process.exitCode = 1;
    }
  };
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
