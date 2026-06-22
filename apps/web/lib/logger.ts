import pino from "pino";

const isProduction = process.env.NODE_ENV === "production";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isProduction ? "info" : "debug"),
  transport: isProduction
    ? undefined
    : {
        target: "pino/file",
        options: { destination: 1 },
      },
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "req.headers['x-api-key']",
      "body.razorpayKeySecret",
      "body.key_secret",
      "body.secret",
    ],
    censor: "[REDACTED]",
  },
});

export function createRequestLogger(reqId: string) {
  return logger.child({ reqId });
}

export type Logger = typeof logger;
