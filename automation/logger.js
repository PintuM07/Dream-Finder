/**
 * logger.js
 * Coloured console logger + writes a run log to automation/logs/
 */
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

const logFile = path.join(logsDir, `run_${new Date().toISOString().replace(/[:.]/g, '-')}.log`);

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
  bold: '\x1b[1m',
};

function fmt(color, prefix, msg) {
  const timestamp = new Date().toLocaleTimeString('en-IN');
  const line = `[${timestamp}] ${prefix} ${msg}`;
  // Write to file (no ANSI codes)
  fs.appendFileSync(logFile, line + '\n');
  // Print to console with colour
  console.log(`${COLORS.gray}[${timestamp}]${COLORS.reset} ${color}${prefix}${COLORS.reset} ${msg}`);
}

module.exports = {
  info:    (msg) => fmt(COLORS.cyan,    'ℹ️ ', msg),
  success: (msg) => fmt(COLORS.green,   '✅', msg),
  warn:    (msg) => fmt(COLORS.yellow,  '⚠️ ', msg),
  error:   (msg) => fmt(COLORS.red,     '❌', msg),
  skip:    (msg) => fmt(COLORS.gray,    '⏩', msg),
  ai:      (msg) => fmt(COLORS.magenta, '🤖', msg),
  apply:   (msg) => fmt(COLORS.green + COLORS.bold, '🚀', msg),
  section: (msg) => {
    const line = '─'.repeat(60);
    console.log(`\n${COLORS.cyan}${line}${COLORS.reset}`);
    console.log(`${COLORS.bold}  ${msg}${COLORS.reset}`);
    console.log(`${COLORS.cyan}${line}${COLORS.reset}\n`);
    fs.appendFileSync(logFile, `\n${line}\n  ${msg}\n${line}\n\n`);
  },
  logFile,
};
