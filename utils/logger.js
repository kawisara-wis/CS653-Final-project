const winston = require('winston');
const config = require('../config');

// This function returns the current timestamp in the desired format.
function getCurrentTimestamp() {
    const date = new Date();
    return `${String(+date).padStart(10, '0')} ${date.getUTCFullYear()}/${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')} ${String(date.getUTCHours()).padStart(2, '0')}:${String(date.getUTCMinutes()).padStart(2, '0')}:${String(date.getUTCSeconds()).padStart(2, '0')}`;
}

// Custom format for log output
const customFormat = winston.format.printf(({ timestamp, level, message }) => {
    return `${timestamp} ${level}: ${message}`;
});

module.exports = winston.createLogger({
    level: config.mode,
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.timestamp({ format: getCurrentTimestamp }),
                customFormat
            )
        }),
    ]
});
