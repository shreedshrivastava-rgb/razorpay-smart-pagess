import * as Sentry from "@sentry/nextjs";

const dsn = process.env.SENTRY_DSN;
if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    environment: process.env.NODE_ENV ?? "development",
    beforeSend(event) {
      if (process.env.NODE_ENV === "development") return null;
      return event;
    },
  });
}
