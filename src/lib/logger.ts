import winston from "winston";

const isDev = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

// File transports only make sense on a persistent, writable filesystem.
// Vercel functions run on a read-only FS (aside from /tmp), so writing to
// /var/log/pim there throws at startup and takes down every route that
// imports this module. Gate file logging behind an explicit opt-in for
// environments that actually have that disk (e.g. a traditional VM/host).
const enableFileLogging = process.env.LOG_TO_FILE === "true";

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isDev ? "debug" : "info"),
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.errors({ stack: true }),
    isProduction
      ? winston.format.json()
      : winston.format.combine(winston.format.colorize(), winston.format.simple())
  ),
  defaultMeta: { service: "pim-webapp" },
  transports: [
    new winston.transports.Console(),
    ...(enableFileLogging
      ? [
          new winston.transports.File({
            filename: "/var/log/pim/error.log",
            level: "error",
            maxsize: 10485760, // 10MB
            maxFiles: 5,
          }),
          new winston.transports.File({
            filename: "/var/log/pim/combined.log",
            maxsize: 10485760,
            maxFiles: 10,
          }),
        ]
      : []),
  ],
});

export default logger;
