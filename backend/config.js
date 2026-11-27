const { existsSync } = require('node:fs');
const path = require('node:path');

const envFile = path.join(__dirname, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);
