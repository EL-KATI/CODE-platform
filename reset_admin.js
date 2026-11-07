const db = require('./server/db');
const bcrypt = require('bcryptjs');
db.open();
const hash = bcrypt.hashSync('admin123', 12);
db.get().prepare('UPDATE users SET password_hash=? WHERE role=?').run(hash, 'admin');
const u = db.get().prepare('SELECT email FROM users WHERE role=?').get('admin');
console.log('Done!');
console.log('Email:', u ? u.email : 'not found');
console.log('Password: admin123');
