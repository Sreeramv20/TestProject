import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';

const logDir = process.env.DATA_DIR
  ? path.join(process.env.DATA_DIR, 'logs')
  : path.join(process.cwd(), 'data', 'logs');

fs.mkdirSync(logDir, { recursive: true });

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL ?? 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple(),
      ),
    }),
    new winston.transports.File({
      filename: path.join(logDir, 'app.log'),
      maxsize: 5_000_000,
      maxFiles: 5,
    }),
  ],
});
