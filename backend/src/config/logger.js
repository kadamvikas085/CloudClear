const pino = require('pino');
const path = require('path');
const fs = require('fs');
const config = require('./env');

const logsDir = path.join(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const transport = config.isProduction
  ? undefined
  : {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
        ignore: 'pid,hostname',
      },
    };

const logger = pino({
  level: process.env.LOG_LEVEL || (config.isProduction ? 'info' : 'debug'),
  transport,
  base: { service: 'cloudvision-backend' },
  timestamp: pino.stdTimeFunctions.isoTime,
});

const authLogger = logger.child({ scope: 'auth' });
const aiJobLogger = logger.child({ scope: 'ai-job' });
const httpLogger = logger.child({ scope: 'http' });
const dbLogger = logger.child({ scope: 'db' });

module.exports = {
  logger,
  authLogger,
  aiJobLogger,
  httpLogger,
  dbLogger,
};