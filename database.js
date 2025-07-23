const mysql = require('mysql2');

const connection = mysql.createConnection({
  host: 'yamabiko.proxy.rlwy.net',
  user: 'root',
  password: 'MzElXIBeDgBaCExawqzjGfQDSZsJNhWS',
  database: 'railway',
  port: 23584
});

module.exports = connection; 