const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

// Prefer an explicit DB_PATH for Docker/persistent installs, and keep supporting
// the original server-folder database names for manual installs.
const configuredDbPath = process.env.DB_PATH;
const legacyDbPath = path.join(__dirname, 'youtubarr.db');
const dbPath = configuredDbPath
  ? configuredDbPath
  : fs.existsSync(legacyDbPath)
    ? legacyDbPath
    : path.join(__dirname, 'subarr.db');

fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Initialization: create tables if they don't exist
db.exec(`
CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT NOT NULL UNIQUE,
  author_name TEXT,
  author_uri TEXT,
  title TEXT,
  check_interval_minutes INTEGER DEFAULT 60,
  regex_filter TEXT,
  last_checked TEXT,
  thumbnail TEXT,
  banner TEXT,
  download_enabled TEXT,
  download_dir TEXT,
  download_output_template TEXT,
  ytdlp_format TEXT,
  ytdlp_media_type TEXT,
  ytdlp_video_container TEXT,
  ytdlp_audio_format TEXT,
  ytdlp_subtitles TEXT,
  ytdlp_subtitle_langs TEXT,
  ytdlp_embed_subtitles TEXT,
  ytdlp_extra_args TEXT,
  source TEXT DEFAULT 'manual'
);

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT,
  published_at TEXT,
  thumbnail TEXT,
  UNIQUE (playlist_id, video_id)  -- Unique by both playlist_id & video_id (since the same video could exist on multiple playlists)
);

CREATE TABLE IF NOT EXISTS activity (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  datetime TEXT NOT NULL,
  playlist_id TEXT,
  title TEXT,
  url TEXT,
  message TEXT,
  icon TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS post_processors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  target TEXT NOT NULL,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS downloads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  playlist_id TEXT NOT NULL,
  video_id TEXT NOT NULL,
  title TEXT,
  status TEXT NOT NULL,
  output_path TEXT,
  error TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  manual TEXT DEFAULT 'false'
);
`);

function ensureColumn(table, column, definition) {
  const existingColumns = db.prepare(`PRAGMA table_info(${table});`).all();
  if (!existingColumns.some(col => col.name === column)) {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
  }
}

ensureColumn('playlists', 'banner', 'TEXT');
ensureColumn('playlists', 'download_enabled', 'TEXT');
ensureColumn('playlists', 'download_dir', 'TEXT');
ensureColumn('playlists', 'download_output_template', 'TEXT');
ensureColumn('playlists', 'ytdlp_format', 'TEXT');
ensureColumn('playlists', 'ytdlp_media_type', 'TEXT');
ensureColumn('playlists', 'ytdlp_video_container', 'TEXT');
ensureColumn('playlists', 'ytdlp_audio_format', 'TEXT');
ensureColumn('playlists', 'ytdlp_subtitles', 'TEXT');
ensureColumn('playlists', 'ytdlp_subtitle_langs', 'TEXT');
ensureColumn('playlists', 'ytdlp_embed_subtitles', 'TEXT');
ensureColumn('playlists', 'ytdlp_extra_args', 'TEXT');
ensureColumn('downloads', 'manual', 'TEXT DEFAULT "false"');

module.exports = db;
