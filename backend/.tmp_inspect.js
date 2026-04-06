const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('data/nexumdesk.db');
const q = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
(async () => {
  const recent = await q("SELECT rowid,id,title,severity,priority,calculated_priority,assignment_status,assigned_to,pending_assigned_to,created_by,created_at FROM incidents ORDER BY datetime(created_at) DESC LIMIT 15");
  console.log('RECENT', JSON.stringify(recent, null, 2));
  const withCreator = await q("SELECT i.rowid,i.id,i.title,i.severity,i.priority,i.assignment_status,u.full_name as creator_name,u.role as creator_role,u.tier as creator_tier,i.assigned_to,i.pending_assigned_to,i.created_at FROM incidents i LEFT JOIN users u ON u.id=i.created_by ORDER BY datetime(i.created_at) DESC LIMIT 15");
  console.log('RECENT_WITH_CREATOR', JSON.stringify(withCreator, null, 2));
  const s = await q("SELECT key,value FROM system_settings WHERE key LIKE 'auto_assign.%' ORDER BY key");
  console.log('AUTO_ASSIGN_SETTINGS', JSON.stringify(s, null, 2));
  db.close();
})().catch((e) => {
  console.error(e);
  db.close();
  process.exit(1);
});
