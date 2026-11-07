'use strict';
const path = require('path');
const Database = require('better-sqlite3');

// Find the database
const dbPath = process.argv[2] || path.join(__dirname, 'data', 'app.db');
console.log('Opening DB:', dbPath);

const db = new Database(dbPath);

const rows = db.prepare('SELECT id, options, correct FROM questions').all();
console.log(`Found ${rows.length} questions`);

let fixed = 0;
const update = db.prepare('UPDATE questions SET options=?, correct=? WHERE id=?');

const fixMany = db.transaction(() => {
  for (const row of rows) {
    let opts = JSON.parse(row.options);
    let corr = JSON.parse(row.correct);
    let changed = false;

    // Fix options: [{id,text}] → ["text"]
    if (Array.isArray(opts) && opts.length > 0 && typeof opts[0] === 'object' && opts[0] !== null) {
      const idToNum = {};
      opts.forEach((o, i) => { idToNum[o.id] = i + 1; });
      const newOpts = opts.map(o => o.text);

      // Fix correct: ["opt_1"] → [1]
      let newCorr = corr.map(c => {
        if (typeof c === 'string' && c.startsWith('opt_')) return idToNum[c] || Number(c.replace('opt_',''));
        return Number(c);
      }).filter(Boolean);

      update.run(JSON.stringify(newOpts), JSON.stringify(newCorr), row.id);
      fixed++;
      changed = true;
    }

    // Fix correct only: ["opt_1"] → [1] even if options already strings
    if (!changed && Array.isArray(corr) && corr.length > 0 && typeof corr[0] === 'string' && corr[0].startsWith('opt_')) {
      let newCorr = corr.map(c => Number(c.replace('opt_',''))).filter(Boolean);
      update.run(row.options, JSON.stringify(newCorr), row.id);
      fixed++;
    }
  }
});

fixMany();
console.log(`Fixed ${fixed} questions`);

// Verify
const sample = db.prepare('SELECT id, options, correct FROM questions LIMIT 3').all();
sample.forEach(r => {
  console.log(`\nQ${r.id}: options=${r.options.substring(0,60)} | correct=${r.correct}`);
});

db.close();
