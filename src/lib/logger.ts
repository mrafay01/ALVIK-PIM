import winston from "winston";

const isDev = process.env.NODE_ENV === "development";
const isProduction = process.env.NODE_ENV === "production";

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
    ...(isProduction
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
