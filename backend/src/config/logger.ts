type LogLevel = "info" | "warn" | "error";

function write(level: LogLevel, message: string, metadata?: unknown): void {
  const payload = {
    level,
    time: new Date().toISOString(),
    message,
    ...(metadata ? { metadata } : {})
  };

  if (level === "error") {
    console.error(JSON.stringify(payload));
    return;
  }
  if (level === "warn") {
    console.warn(JSON.stringify(payload));
    return;
  }
  console.log(JSON.stringify(payload));
}

export const logger = {
  info: (message: string, metadata?: unknown) => write("info", message, metadata),
  warn: (message: string, metadata?: unknown) => write("warn", message, metadata),
  error: (message: string, metadata?: unknown) => write("error", message, metadata)
};
