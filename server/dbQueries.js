const db = require('./db');

function getPlaylists(filteredSource) {
  const stmt = db.prepare(`
    SELECT 
      p.*, 
      v.last_updated
    FROM playlists p
    LEFT JOIN (
      SELECT 
        playlist_id, 
        MAX(published_at) AS last_updated
      FROM videos
      GROUP BY playlist_id
    ) v ON p.playlist_id = v.playlist_id
    ${filteredSource ? `WHERE p.source = ?` : ''}
  `);

  return filteredSource ? stmt.all(filteredSource) : stmt.all();
}

function getPlaylist(playlistDbId) {
  return db.prepare('SELECT * FROM playlists WHERE id = ?').get(playlistDbId);
}

function insertPlaylist(playlist, source, updateOnConflict = false) {
  return db.prepare(`
    INSERT INTO playlists (playlist_id, author_name, author_uri, title, check_interval_minutes, regex_filter, last_checked, thumbnail, banner, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ${updateOnConflict ? // In the below conflict handling, "excluded" is "the thing we're trying to insert (the incoming thing)"
    `ON CONFLICT(playlist_id) DO UPDATE SET
    author_name = excluded.author_name,
    author_uri = excluded.author_uri,
    title = excluded.title,
    /* don't overwrite check_interval_minutes, regex_filter, or last_checked */
    thumbnail = excluded.thumbnail,
    banner = excluded.banner,
    source = excluded.source`
    : ''}
  `).run(
    playlist.playlist_id,
    playlist.author_name,
    playlist.author_uri,
    playlist.title,
    playlist.check_interval_minutes ?? 60, // Todo: allow customization (maybe via a "default check interval" setting)
    '',
    null,
    playlist.thumbnail,
    playlist.banner,
    source
  );
}

function updatePlaylist(playlist_id, check_interval_minutes = undefined, regex_filter = undefined, last_checked = undefined) {
  const sets = [];
  const params = { playlist_id };

  if (check_interval_minutes !== undefined) {
    sets.push('check_interval_minutes = @check_interval_minutes');
    params.check_interval_minutes = check_interval_minutes; // number
  }
  if (regex_filter !== undefined) {
    sets.push('regex_filter = @regex_filter');
    params.regex_filter = regex_filter; // string (can be empty '')
  }
  if (last_checked !== undefined) {
    sets.push('last_checked = @last_checked');
    params.last_checked = last_checked; // ISO string
  }

  if (sets.length === 0) 
    return; // nothing to update

  const sql = `UPDATE playlists SET ${sets.join(', ')} WHERE playlist_id = @playlist_id`;
  db.prepare(sql).run(params);
}

function updatePlaylistSettings(playlist_id, settings) {
  const allowedFields = [
    'check_interval_minutes',
    'regex_filter',
    'download_enabled',
    'download_dir',
    'download_output_template',
    'ytdlp_format',
    'ytdlp_media_type',
    'ytdlp_video_container',
    'ytdlp_audio_format',
    'ytdlp_subtitles',
    'ytdlp_subtitle_langs',
    'ytdlp_embed_subtitles',
    'ytdlp_extra_args',
  ];
  const sets = [];
  const params = { playlist_id };

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(settings, field) && settings[field] !== undefined) {
      sets.push(`${field} = @${field}`);
      params[field] = settings[field];
    }
  }

  if (sets.length === 0) {
    return { changes: 0 };
  }

  return db.prepare(`UPDATE playlists SET ${sets.join(', ')} WHERE playlist_id = @playlist_id`).run(params);
}

function deletePlaylist(playlistId) {
  db.prepare('DELETE FROM playlists WHERE playlist_id = ?').run(playlistId);
}

function getVideosForPlaylist(playlistId) {
  return db.prepare('SELECT * FROM videos WHERE playlist_id = ? ORDER BY published_at DESC').all(playlistId);
}

function getVideoForPlaylist(playlistId, videoId) {
  return db.prepare('SELECT * FROM videos WHERE playlist_id = ? AND video_id = ?').get(playlistId, videoId);
}

function insertVideo(playlistId, videoId, videoTitle, publishedAt, videoThumbnail) {
  const insertVideo = db.prepare(`
    INSERT OR IGNORE INTO videos (playlist_id, video_id, title, published_at, thumbnail)
    VALUES (?, ?, ?, ?, ?)
  `); // "OR IGNORE" will ignore conflicts (we could also update the item on conflicts, but we'll handle that elsewhere)
  return insertVideo.run(playlistId, videoId, videoTitle, publishedAt, videoThumbnail);
}

function deleteVideosForPlaylist(playlistId) {
  db.prepare('DELETE FROM videos WHERE playlist_id = ?').run(playlistId);
}

function getSettings() {
  // Todo: we should do the "string to bool" conversion here, rather than having the "SQLite can't store bool" comments elsewhere
  return db.prepare('SELECT key, value FROM settings').all();
}

function insertSettings(settings) {
  const stmt = db.prepare(`
    INSERT INTO settings (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  const insertMany = db.transaction((settingsObj) => {
    for (const [key, value] of Object.entries(settingsObj)) {
      stmt.run(key, value);
    }
  });

  insertMany(settings);
}

function getPostProcessors() {
  return db.prepare('SELECT * FROM post_processors').all();
}

function insertPostProcessor(name, type, target, data) {
  const stmt = db.prepare(`
    INSERT INTO post_processors (name, type, target, data)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(name, type, target, data);
}

function updatePostProcessor(postProcessorId, name, type, target, data) {
  return db.prepare(`
    UPDATE post_processors SET name = ?, type = ?, target = ?, data = ? WHERE id = ?
  `).run(name, type, target, data, postProcessorId);
}

function deletePostProcessor(postProcessorId) {
  return db.prepare(`DELETE FROM post_processors WHERE id = ?`).run(postProcessorId);
}

function getActivitiesCount() {
  return db.prepare(`SELECT COUNT(*) as count FROM activity`).get();
}

function getActivities(pageSize, offset) {
  return db.prepare(`
    SELECT a.id, a.datetime, a.playlist_id, a.title, a.url, a.message, a.icon, p.id AS playlist_db_id, p.title AS playlist_title
    FROM activity a
    LEFT JOIN playlists p ON a.playlist_id = p.playlist_id
    ORDER BY a.id DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset);
}

function insertActivity(playlistId, title, url, message, icon) {
  db.prepare(`INSERT INTO activity (datetime, playlist_id, title, url, message, icon) VALUES (?, ?, ?, ?, ?, ?)`)
  .run(new Date().toISOString(), playlistId, title, url, message, icon);
}

function insertDownload(download) {
  return db.prepare(`
    INSERT INTO downloads (playlist_id, video_id, title, status, output_path, error, started_at, finished_at, manual)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    download.playlist_id,
    download.video_id,
    download.title,
    download.status,
    download.output_path,
    download.error,
    download.started_at,
    download.finished_at,
    download.manual ?? 'false'
  );
}

function updateDownload(downloadId, fields) {
  const allowedFields = ['status', 'output_path', 'error', 'finished_at'];
  const sets = [];
  const params = { id: downloadId };

  for (const field of allowedFields) {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      sets.push(`${field} = @${field}`);
      params[field] = fields[field];
    }
  }

  if (sets.length === 0) {
    return { changes: 0 };
  }

  return db.prepare(`UPDATE downloads SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function getDownloadsCount() {
  return db.prepare(`SELECT COUNT(*) as count FROM downloads`).get();
}

function getDownloads(pageSize, offset) {
  return db.prepare(`
    SELECT d.*, p.id AS playlist_db_id, p.title AS playlist_title
    FROM downloads d
    LEFT JOIN playlists p ON d.playlist_id = p.playlist_id
    ORDER BY d.id DESC
    LIMIT ? OFFSET ?
  `).all(pageSize, offset);
}

module.exports = { 
  getPlaylists,
  getPlaylist,
  insertPlaylist,
  updatePlaylist,
  updatePlaylistSettings,
  deletePlaylist,
  getVideosForPlaylist,
  getVideoForPlaylist,
  insertVideo,
  deleteVideosForPlaylist,
  getSettings,
  insertSettings,
  getPostProcessors,
  insertPostProcessor,
  updatePostProcessor,
  deletePostProcessor,
  getActivitiesCount,
  getActivities,
  insertActivity,
  insertDownload,
  updateDownload,
  getDownloadsCount,
  getDownloads,
};
