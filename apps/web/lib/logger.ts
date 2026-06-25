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
      // Customer PII — never log in plaintext (covers top-level fields and a
      // single level of nesting, e.g. log({ customerEmail }) or log({ order: {…} })).
      "customerEmail",
      "customerPhone",
      "customerName",
      "*.customerEmail",
      "*.customerPhone",
      "*.customerName",
      "body.customerEmail",
      "body.customerPhone",
      "body.customerName",
      "email",
      "phone",
      "*.email",
      "*.phone",
    ],
    censor: "[REDACTED]",
  },
});

export function createRequestLogger(reqId: string) {
  return logger.child({ reqId });
}

export type Logger = typeof logger;
