const sqlite3 = require('sqlite3');
const db = new sqlite3.Database('data/nexumdesk.db');
const q = (sql, p = []) => new Promise((res, rej) => db.all(sql, p, (e, r) => e ? rej(e) : res(r)));
(async () => {
  const statuses = await q("SELECT UPPER(COALESCE(status,'')) as status, COUNT(*) as cnt FROM incidents GROUP BY UPPER(COALESCE(status,'')) ORDER BY cnt DESC");
  console.log('STATUSES', JSON.stringify(statuses, null, 2));

  const points = { sev1:60, sev2:35, sev3:20, sev4:10 };
  const oldSql = `SELECT u.id,u.full_name,u.tier,COALESCE((SELECT SUM(CASE i.severity WHEN 'SEV-1' THEN ? WHEN 'SEV-2' THEN ? WHEN 'SEV-3' THEN ? WHEN 'SEV-4' THEN ? ELSE ? END) FROM incidents i WHERE i.assigned_to=u.id AND i.status NOT IN ('RESOLVED','Canceled')),0) as points_used_old FROM users u WHERE u.role='ENGINEER' AND u.status='ACTIVE' ORDER BY u.full_name`;
  const newSql = `SELECT u.id,u.full_name,u.tier,COALESCE((SELECT SUM(CASE i.severity WHEN 'SEV-1' THEN ? WHEN 'SEV-2' THEN ? WHEN 'SEV-3' THEN ? WHEN 'SEV-4' THEN ? ELSE ? END) FROM incidents i WHERE i.assigned_to=u.id AND UPPER(COALESCE(i.status,'')) NOT IN ('RESOLVED','CANCELED','CANCELLED')),0) as points_used_new FROM users u WHERE u.role='ENGINEER' AND u.status='ACTIVE' ORDER BY u.full_name`;
  const oldRows = await q(oldSql,[points.sev1,points.sev2,points.sev3,points.sev4,points.sev4]);
  const newRows = await q(newSql,[points.sev1,points.sev2,points.sev3,points.sev4,points.sev4]);
  const merged = oldRows.map((o,idx)=>({...o, points_used_new:newRows[idx]?.points_used_new}));
  console.log('POINTS_COMPARISON', JSON.stringify(merged, null, 2));
  db.close();
})().catch((e)=>{console.error(e); db.close(); process.exit(1);});
