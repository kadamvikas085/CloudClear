const http = require('http');
const app = require('./app');
const config = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const { initSocket } = require('./socket/index');
const { logger } = require('./config/logger');

const httpServer = http.createServer(app);

async function start() {
  await connectDB();

  initSocket(httpServer);

  httpServer.listen(config.port, () => {
    logger.info(`CloudVision AI backend running in ${config.env} mode on port ${config.port}`);
  });
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'UNHANDLED PROMISE REJECTION — shutting down');
  gracefulShutdown(1);
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'UNCAUGHT EXCEPTION — shutting down');
  gracefulShutdown(1);
});

['SIGTERM', 'SIGINT'].forEach((signal) => {
  process.on(signal, () => {
    logger.info(`${signal} received — starting graceful shutdown`);
    gracefulShutdown(0);
  });
});

function gracefulShutdown(exitCode) {
  httpServer.close(async () => {
    await disconnectDB();
    logger.info('Server closed. Exiting process.');
    process.exit(exitCode);
  });

  setTimeout(() => process.exit(exitCode), 10000).unref();
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start server');
  process.exit(1);
});