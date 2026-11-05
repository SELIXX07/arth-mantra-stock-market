import db from './db.js';
import { generateFullBackup, saveLocalSnapshot, uploadToSupabaseStorage } from './backupManager.js';

export function purgeTestTeams() {
  console.log('[Cleanup] Checking for test teams (artharambachalil@gmail.com / Team test)...');

  const testTeams = db.prepare(`
    SELECT id, team_code, team_name, leader_email, leader_name 
    FROM teams 
    WHERE leader_email LIKE '%artharambachalil%' 
       OR team_name = 'test' 
       OR id = 'reg-1792865102756-u1tny'
  `).all();

  if (testTeams.length === 0) {
    console.log('[Cleanup] No test teams found in database.');
    return 0;
  }

  for (const t of testTeams) {
    console.log(`[Cleanup] Permanently deleting team: ${t.team_name} (${t.team_code}, ${t.leader_email}, ID: ${t.id})`);
    try { db.prepare('DELETE FROM holdings WHERE team_id = ?').run(t.id); } catch (e) {}
    try { db.prepare('DELETE FROM orders WHERE team_id = ?').run(t.id); } catch (e) {}
    try { db.prepare('DELETE FROM trades WHERE team_id = ?').run(t.id); } catch (e) {}
    db.prepare('DELETE FROM teams WHERE id = ?').run(t.id);
  }

  const remainingCount = db.prepare('SELECT COUNT(*) as count FROM teams').get().count;
  console.log(`[Cleanup] Done! Total valid teams remaining: ${remainingCount}`);

  try {
    const backup = generateFullBackup();
    saveLocalSnapshot(backup);
    uploadToSupabaseStorage(backup).then(() => {
      console.log('[Cleanup] Updated cloud backup synchronized to Supabase.');
    }).catch(() => {});
  } catch (e) {}

  return testTeams.length;
}

purgeTestTeams();
