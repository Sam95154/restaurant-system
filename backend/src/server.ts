import http from 'http';
import { app } from './app';
import { env } from './config/env';
import { initSockets } from './sockets';

const server = http.createServer(app);
initSockets(server);

server.listen(env.port, () => {
  // eslint-disable-next-line no-console
  console.log(`Sam's Cafe backend listening on http://localhost:${env.port} (${env.nodeEnv})`);
});
