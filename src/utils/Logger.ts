import * as dotenv from 'dotenv';
dotenv.config();

class Logger {
  static isDebug: boolean =
    process.env.SDK_DEBUG === 'true'
      ? true
      : process.env.REACT_APP_SDK_DEBUG === 'true'
        ? true
        : false;

  static log(message: string, value?: unknown): void {
    const timestamp = new Date().toISOString();
    const logMessage = `\x1b[35m[${timestamp}]\x1b[0m \x1b[36m${message}\x1b[0m:`;

    if (Logger.isDebug) {
      console.log(logMessage, value === undefined ? '' : value);
    }
  }

  static warn(message: string, value?: unknown): void {
    const timestamp = new Date().toISOString();
    const warnMessage = `\x1b[35m[${timestamp}]\x1b[0m \x1b[33mWARN\x1b[0m: \x1b[36m${message}\x1b[0m`;

    if (Logger.isDebug) {
      console.warn(warnMessage, value === undefined ? '' : value);
    }
  }

  static error(message: string, value?: unknown): void {
    const timestamp = new Date().toISOString();
    const errorMessage = `\x1b[35m[${timestamp}]\x1b[0m \x1b[31mERROR\x1b[0m: \x1b[36m${message}\x1b[0m`;

    if (Logger.isDebug) {
      console.error(errorMessage, value === undefined ? '' : value);
    }
  }
}

export { Logger };
