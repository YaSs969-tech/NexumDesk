const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const db = new sqlite3.Database('data/nexumdesk.db');

const adminEmail = 'dv@nexumdesk.com';
const adminUsername = 'admin';
const adminPassword = 'admin123'; // Schimbă parola după prima logare!
const adminFullName = 'Admin User';

db.serialize(() => {
  db.get('SELECT COUNT(*) as count FROM users', async (err, row) => {
    if (err) {
      console.error('DB error:', err);
      db.close();
      return;
    }
    if (row.count === 0) {
      // Nu există useri, inserează admin
      const id = uuidv4();
      const hash = await bcrypt.hash(adminPassword, 10);
      const now = new Date().toISOString();
      db.run(
        `INSERT INTO users (id, username, email, password_hash, full_name, role, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, adminUsername, adminEmail, hash, adminFullName, 'ADMIN', 'ACTIVE', now, now],
        function (err) {
          if (err) {
            console.error('Error inserting admin:', err);
          } else {
            console.log('Admin user created!');
            console.log('Email:', adminEmail);
            console.log('Password:', adminPassword);
          }
          showUsers();
        }
      );
    } else {
      // Există useri, promovează primul la admin
      const stmt = db.prepare('UPDATE users SET role = ? WHERE id = (SELECT id FROM users LIMIT 1)');
      stmt.run('ADMIN', function (err) {
        if (err) {
          console.error('Error updating role:', err);
        } else {
          console.log(`Updated ${this.changes} user(s) to ADMIN`);
        }
        stmt.finalize();
        showUsers();
      });
    }
  });
});

function showUsers() {
  db.all('SELECT id, username, email, role FROM users', (err, users) => {
    if (err) {
      console.error('Error fetching users:', err);
    } else {
      console.log('\nCurrent users:');
      console.table(users);
    }
    db.close();
  });
}
