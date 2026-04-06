type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const levels: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

const envLevel = (process.env.LOG_LEVEL || 'info').toLowerCase() as LogLevel;
const activeLevel = levels[envLevel] ? envLevel : 'info';

function canLog(level: LogLevel): boolean {
  return levels[level] >= levels[activeLevel];
}

function formatMessage(level: LogLevel, message: string): string {
  return `[${new Date().toISOString()}] [${level.toUpperCase()}] ${message}`;
}

export const logger = {
  debug(message: string, ...args: unknown[]) {
    if (canLog('debug')) {
      // eslint-disable-next-line no-console
      console.debug(formatMessage('debug', message), ...args);
    }
  },

  info(message: string, ...args: unknown[]) {
    if (canLog('info')) {
      // eslint-disable-next-line no-console
      console.info(formatMessage('info', message), ...args);
    }
  },

  warn(message: string, ...args: unknown[]) {
    if (canLog('warn')) {
      // eslint-disable-next-line no-console
      console.warn(formatMessage('warn', message), ...args);
    }
  },

  error(message: string, ...args: unknown[]) {
    if (canLog('error')) {
      // eslint-disable-next-line no-console
      console.error(formatMessage('error', message), ...args);
    }
  },
};

export default logger;