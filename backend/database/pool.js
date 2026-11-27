require('../config');
const mysql = require('mysql2/promise');

const mysqlOptions = {
  host: process.env.MYSQL_HOST || '127.0.0.1',
  port: Number(process.env.MYSQL_PORT) || 3306,
  user: process.env.MYSQL_USER || 'muagiday',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'muagiday',
  charset: 'UTF8MB4_UNICODE_CI',
  timezone: 'Z',
  connectTimeout: 3500
};

const pool = mysql.createPool({ ...mysqlOptions, connectionLimit: 8, queueLimit: 32 });

module.exports = { pool, mysqlOptions };
