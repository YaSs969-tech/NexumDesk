import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { startSLAMonitor } from './utils/slaMonitor';
import logger from './utils/logger';

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  logger.info(`NexumDesk backend listening on port ${PORT}`);

  // Start SLA monitoring service
  startSLAMonitor();
});

server.on('error', (error) => {
  logger.error('Backend server failed to start', error);
  process.exit(1);
});
