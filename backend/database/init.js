const { readFileSync } = require('node:fs');
const path = require('node:path');
const { createConnection } = require('mysql2/promise');
const { mysqlOptions } = require('./pool');

async function init() {
  const schema = readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const connection = await createConnection({ ...mysqlOptions, multipleStatements: true });
  try {
    await connection.query(schema);
    console.log('Đã khởi tạo bảng MySQL cho Auth, Weather và NLP.');
  } finally {
    await connection.end();
  }
}

init().catch((error) => {
  console.error('Không khởi tạo được MySQL:', error.code || error.name);
  process.exitCode = 1;
});
