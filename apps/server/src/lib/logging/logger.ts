type LogFields = {
  requestId?: string;
  method?: string;
  pathname?: string;
  status?: number;
  duration?: number;
  code?: string;
  stack?: string;
};

const allowedKeys = new Set<keyof LogFields>([
  "requestId",
  "method",
  "pathname",
  "status",
  "duration",
  "code",
  "stack",
]);

function sanitize(fields: LogFields): LogFields {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key, value]) => allowedKeys.has(key as keyof LogFields) && value !== undefined,
    ),
  );
}

function entry(level: "info" | "error", fields: LogFields, message: string) {
  return JSON.stringify({
    level,
    message,
    ...sanitize(fields),
    timestamp: new Date().toISOString(),
  });
}

export const logger = {
  info(fields: LogFields, message: string) {
    console.info(entry("info", fields, message));
  },
  error(fields: LogFields, message: string) {
    console.error(entry("error", fields, message));
  },
};
