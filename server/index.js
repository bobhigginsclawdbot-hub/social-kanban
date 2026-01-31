const express = require('express');
const Database = require('better-sqlite3');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Database setup
const db = new Database(path.join(__dirname, '../data/kanban.db'));

// Initialize database tables
db.exec(`
  CREATE TABLE IF NOT EXISTS cards (
    id TEXT PRIMARY KEY,
    platform TEXT NOT NULL,
    status TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    type TEXT DEFAULT 'post',
    date TEXT,
    priority TEXT DEFAULT 'medium',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS platforms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    enabled INTEGER DEFAULT 1
  );

  CREATE INDEX IF NOT EXISTS idx_cards_platform ON cards(platform);
  CREATE INDEX IF NOT EXISTS idx_cards_status ON cards(status);
`);

// Insert default platforms if empty
const platformCount = db.prepare('SELECT COUNT(*) as count FROM platforms').get();
if (platformCount.count === 0) {
  const insertPlatform = db.prepare('INSERT INTO platforms (id, name, icon, color) VALUES (?, ?, ?, ?)');
  const platforms = [
    ['x', 'X / Twitter', '𝕏', '#1da1f2'],
    ['instagram', 'Instagram', '📸', '#e1306c'],
    ['youtube', 'YouTube', '▶️', '#ff0000'],
    ['tiktok', 'TikTok', '🎵', '#00f2ea'],
    ['substack-ai', 'SubStack AInsights', '📰', '#ff6719'],
    ['substack-rtl', 'SubStack RyanTechLabs', '📰', '#ff6719'],
    ['medium', 'Medium', '📝', '#00ab6c']
  ];
  platforms.forEach(p => insertPlatform.run(...p));
}

// API Routes

// Get all cards
app.get('/api/cards', (req, res) => {
  try {
    const cards = db.prepare('SELECT * FROM cards ORDER BY created_at DESC').all();
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get cards by platform
app.get('/api/cards/platform/:platform', (req, res) => {
  try {
    const cards = db.prepare('SELECT * FROM cards WHERE platform = ? ORDER BY created_at DESC').all(req.params.platform);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get cards by status
app.get('/api/cards/status/:status', (req, res) => {
  try {
    const cards = db.prepare('SELECT * FROM cards WHERE status = ? ORDER BY created_at DESC').all(req.params.status);
    res.json(cards);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single card
app.get('/api/cards/:id', (req, res) => {
  try {
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    if (!card) {
      return res.status(404).json({ error: 'Card not found' });
    }
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create card
app.post('/api/cards', (req, res) => {
  try {
    const { id, platform, status, title, description, type, date, priority } = req.body;
    const cardId = id || Date.now().toString();
    
    const stmt = db.prepare(`
      INSERT INTO cards (id, platform, status, title, description, type, date, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    stmt.run(cardId, platform, status, title, description || '', type || 'post', date || null, priority || 'medium');
    
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId);
    res.status(201).json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update card
app.put('/api/cards/:id', (req, res) => {
  try {
    const { platform, status, title, description, type, date, priority } = req.body;
    
    const stmt = db.prepare(`
      UPDATE cards 
      SET platform = COALESCE(?, platform),
          status = COALESCE(?, status),
          title = COALESCE(?, title),
          description = COALESCE(?, description),
          type = COALESCE(?, type),
          date = COALESCE(?, date),
          priority = COALESCE(?, priority),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run(platform, status, title, description, type, date, priority, req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(req.params.id);
    res.json(card);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Move card (quick update for drag-drop)
app.patch('/api/cards/:id/move', (req, res) => {
  try {
    const { platform, status } = req.body;
    
    const stmt = db.prepare(`
      UPDATE cards 
      SET platform = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `);
    
    const result = stmt.run(platform, status, req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete card
app.delete('/api/cards/:id', (req, res) => {
  try {
    const result = db.prepare('DELETE FROM cards WHERE id = ?').run(req.params.id);
    
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Card not found' });
    }
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all platforms
app.get('/api/platforms', (req, res) => {
  try {
    const platforms = db.prepare('SELECT * FROM platforms WHERE enabled = 1').all();
    res.json(platforms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get stats
app.get('/api/stats', (req, res) => {
  try {
    const total = db.prepare('SELECT COUNT(*) as count FROM cards').get().count;
    const scheduled = db.prepare("SELECT COUNT(*) as count FROM cards WHERE status = 'scheduled'").get().count;
    const published = db.prepare("SELECT COUNT(*) as count FROM cards WHERE status = 'published'").get().count;
    const byPlatform = db.prepare('SELECT platform, COUNT(*) as count FROM cards GROUP BY platform').all();
    const byStatus = db.prepare('SELECT status, COUNT(*) as count FROM cards GROUP BY status').all();
    
    res.json({ total, scheduled, published, byPlatform, byStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve frontend for root and catch-all
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Social Kanban server running on http://0.0.0.0:${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit();
});
