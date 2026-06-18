type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

function resolveLevel(): LogLevel {
  const configured = (process.env.LOCALAI_LOG_LEVEL ?? "info").toLowerCase();
  return (["debug", "info", "warn", "error"] as const).includes(configured as LogLevel)
    ? (configured as LogLevel)
    : "info";
}

const activeLevel = resolveLevel();

function shouldLog(level: LogLevel): boolean {
  return levelOrder[level] >= levelOrder[activeLevel];
}

function format(scope: string, message: string): string {
  return `${new Date().toISOString()} [${scope}] ${message}`;
}

export type Logger = {
  debug: (message: string) => void;
  info: (message: string) => void;
  warn: (message: string) => void;
  error: (message: string) => void;
};

export function createLogger(scope: string): Logger {
  return {
    debug: (message) => shouldLog("debug") && console.debug(format(scope, message)),
    info: (message) => shouldLog("info") && console.log(format(scope, message)),
    warn: (message) => shouldLog("warn") && console.warn(format(scope, message)),
    error: (message) => shouldLog("error") && console.error(format(scope, message))
  };
}
