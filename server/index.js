require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { parseVideosFromFeed } = require('./rssParser');
const { schedulePolling, updateYtSubsPlaylists, removePolling, pollPlaylist, normalizeCheckIntervalMinutes } = require('./polling');
const { runPostProcessor } = require('./postProcessors');
const {
  DEFAULT_DOWNLOAD_DIR,
  DEFAULT_OUTPUT_TEMPLATE,
  DEFAULT_FORMAT,
  DEFAULT_MEDIA_TYPE,
  DEFAULT_VIDEO_CONTAINER,
  DEFAULT_AUDIO_FORMAT,
  DEFAULT_SUBTITLES,
  DEFAULT_SUBTITLE_LANGS,
  downloadVideo,
} = require('./downloads');
const { tryParseAdditionalChannelData, getMeta, getYtdlpVersion, updateYtdlp } = require('./utils');
const {
  getPlaylists,
  getSettings,
  insertPlaylist,
  getPlaylist,
  insertActivity,
  updatePlaylist,
  updatePlaylistSettings,
  deletePlaylist,
  deleteVideosForPlaylist,
  getActivitiesCount,
  getActivities,
  insertSettings,
  getPostProcessors,
  insertPostProcessor,
  updatePostProcessor,
  deletePostProcessor,
  getVideosForPlaylist,
  getVideoForPlaylist,
  insertDownload,
  updateDownload,
  getDownloadsCount,
  getDownloads
} = require('./dbQueries');

const playlists = getPlaylists();
for (const playlist of playlists) {
  schedulePolling(playlist);
}

// Schedule YTSubs.app polling
setInterval(() => {
  updateYtSubsPlaylists();
}, 60 * 60 * 1000); // YTSubs.app data only updates every 12 hours, but it might be changed to be less
updateYtSubsPlaylists(); // also run on startup

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/filesystem/directories', async (req, res) => {
  const requestedPath = req.query.path || DEFAULT_DOWNLOAD_DIR;
  const resolvedPath = path.resolve(requestedPath);

  try {
    const stat = await fs.promises.stat(resolvedPath);
    if (!stat.isDirectory()) {
      return res.status(400).json({ error: 'Path is not a directory' });
    }

    const entries = await fs.promises.readdir(resolvedPath, { withFileTypes: true });
    const directories = entries
      .filter(entry => entry.isDirectory())
      .map(entry => path.join(resolvedPath, entry.name))
      .sort((a, b) => a.localeCompare(b))
      .map(dirPath => ({
        name: path.basename(dirPath) || dirPath,
        path: dirPath,
      }));

    res.json({
      path: resolvedPath,
      parent: path.dirname(resolvedPath) === resolvedPath ? null : path.dirname(resolvedPath),
      roots: [
        { name: 'Downloads', path: DEFAULT_DOWNLOAD_DIR },
        { name: 'App data', path: '/app/data' },
        { name: 'Filesystem', path: '/' },
      ],
      directories,
    });
  }
  catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.get('/api/playlists', (req, res) => {
  res.json(getPlaylists());
});

app.post('/api/playlists', async (req, res) => {
  let { playlistId } = req.body;
  if (!/^(UC|PL|UU|LL|FL)[\w-]{10,}$/.test(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID' });
  }

  const settings = Object.fromEntries(getSettings().map(row => [row.key, row.value]));
  const exclude_shorts = (settings.exclude_shorts ?? 'false') === 'true'; // SQLite can't store bool
  if (exclude_shorts && playlistId.startsWith('UU')) {
    playlistId = playlistId.replace(/^UU(?!LF)/, 'UULF'); // Reference: other possible prefixes: https://stackoverflow.com/a/77816885
    // Todo: it's worth noting that "UULF" WON'T contain recordings from past live streams (those are still in "UU", however)
  }

  try {
    let playlistDbId = null;
    await parseVideosFromFeed(playlistId, async playlist => {
      if (playlistId.startsWith('UC') || playlistId.startsWith('UU')) {
        const channelInfo = await tryParseAdditionalChannelData(`https://www.youtube.com/channel/${playlist.channel_id}`);
        playlist.thumbnail = channelInfo.thumbnail;
        playlist.banner = channelInfo.banner;
      }

      const info = insertPlaylist(playlist, 'manual');
      playlistDbId = info.lastInsertRowid;

      insertActivity(playlistId, playlist.title, `https://www.youtube.com/playlist?list=${playlistId}`, 'Playlist added (manual)', 'view-list');
  
      // Fetch newly added playlist to pass into schedulePolling
      const newPlaylist = getPlaylist(playlistDbId);
      schedulePolling(newPlaylist);
    });

    res.status(201).json({ id: playlistDbId });
  }
  catch (err) {
    if (err.message.includes('UNIQUE constraint failed')) {
      res.status(500).json({ error: 'Playlist is already added' });
    }

    console.error('Failed to fetch RSS feed', err);
    res.status(500).json({ error: 'Failed to fetch playlist metadata' });
  }
});

app.get('/api/playlists/:id', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist)
    return res.status(404).json({ error: 'Not found' });

  const videos = getVideosForPlaylist(playlist.playlist_id);
  res.json({ playlist, videos });
});

app.put('/api/playlists/:id/settings', (req, res) => {
  const {
    check_interval_minutes,
    regex_filter,
    download_enabled,
    download_dir,
    download_output_template,
    ytdlp_format,
    ytdlp_quality_preset,
    ytdlp_media_type,
    ytdlp_video_container,
    ytdlp_audio_format,
    ytdlp_subtitles,
    ytdlp_subtitle_langs,
    ytdlp_embed_subtitles,
    ytdlp_extra_args,
  } = req.body;

  const playlist = getPlaylist(req.params.id);
  if (!playlist)
    return res.status(404).json({ error: 'Not found' });

  updatePlaylistSettings(playlist.playlist_id, {
    check_interval_minutes: normalizeCheckIntervalMinutes(check_interval_minutes),
    regex_filter,
    download_enabled,
    download_dir,
    download_output_template,
    ytdlp_format,
    ytdlp_quality_preset,
    ytdlp_media_type,
    ytdlp_video_container,
    ytdlp_audio_format,
    ytdlp_subtitles,
    ytdlp_subtitle_langs,
    ytdlp_embed_subtitles,
    ytdlp_extra_args,
  });

  const updatedPlaylist = getPlaylist(req.params.id);
  schedulePolling(updatedPlaylist); // reschedules with updated values

  res.json({ success: true });
});

app.post('/api/playlists/:id/sync', async (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist)
    return res.status(404).json({ error: 'Not found' });

  try {
    await pollPlaylist(playlist, true, true);
    insertActivity(playlist.playlist_id, playlist.title, null, 'Manual sync completed', 'arrow-repeat');
    res.json({ success: true });
  }
  catch (err) {
    insertActivity(playlist.playlist_id, playlist.title, null, `Manual sync failed: ${err.message}`, 'exclamation-triangle-fill');
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/playlists/:id/videos/:videoId/download', async (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist)
    return res.status(404).json({ error: 'Playlist not found' });

  const video = getVideoForPlaylist(playlist.playlist_id, req.params.videoId);
  if (!video)
    return res.status(404).json({ error: 'Video not found' });

  const settings = Object.fromEntries(getSettings().map(row => [row.key, row.value]));
  const downloadId = insertDownload({
    playlist_id: playlist.playlist_id,
    video_id: video.video_id,
    title: video.title,
    status: 'downloading',
    started_at: new Date().toISOString(),
    manual: 'true',
  }).lastInsertRowid;

  try {
    const result = await downloadVideo(settings, {
      playlist,
      video: {
        title: video.title,
        video_id: video.video_id,
        thumbnail: video.thumbnail,
        published_at: video.published_at,
      },
    }, { force: true });

    updateDownload(downloadId, {
      status: 'completed',
      output_path: result.outputPath,
      finished_at: new Date().toISOString(),
    });
    insertActivity(playlist.playlist_id, video.title, null, 'Manual download requested', 'download');
    res.json({ success: true });
  }
  catch (err) {
    updateDownload(downloadId, {
      status: 'failed',
      error: err.message,
      finished_at: new Date().toISOString(),
    });
    insertActivity(playlist.playlist_id, video.title, null, `Manual download failed: ${err.message}`, 'exclamation-triangle-fill');
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/playlists/:id', (req, res) => {
  const playlist = getPlaylist(req.params.id);
  if (!playlist) {
    return res.status(404).json({ error: 'Not found' });
  }

  removePolling(playlist.playlist_id);

  deletePlaylist(playlist.playlist_id);
  deleteVideosForPlaylist(playlist.playlist_id);

  insertActivity(playlist.playlist_id, playlist.title, `https://www.youtube.com/playlist?list=${playlist.id}`, 'Playlist removed (manual)', 'trash');

  res.json({ success: true });
});

app.get('/api/search', async (req, res) => {
  try {
    let playlistInfo;
  
    const hasValidPlaylistId = query => /(UC|UU|PL|LL|FL)[\w-]{10,}/.test(query);
    if (hasValidPlaylistId(req.query.q)) {
      const adjustedPlaylistId = req.query.q.match(/(UC|UU|PL|LL|FL)[\w-]{10,}/)[0];
      await parseVideosFromFeed(adjustedPlaylistId, playlist => { // Todo: this will print a number of things to the server console output if it fails, so we should try to prevent that
        playlistInfo = playlist
        // Todo: also call tryParseAdditionalChannelData here for UU type playlist ids (so we get the proper thumbnail & banner)
      });
    }
    else if (/(https:\/\/)?(www\.)?youtube\.com\/(@|channel)/.test(req.query.q)) {
      // If this is a youtube channel URL, we can actually find the uploads playlist by grepping it from the HTML source code of the webpage

      const channelInfo = await tryParseAdditionalChannelData(req.query.q.startsWith('https://') ? req.query.q : `https://${req.query.q}`);
      if (channelInfo.playlist_id) {
        console.log(`Successfully grabbed channel playlist id from source code of ${req.query.q}`);
        await parseVideosFromFeed(channelInfo.playlist_id, playlist => { // Todo: this will print a number of things to the server console output if it fails, so we should try to prevent that
          playlistInfo = playlist
        });

        playlistInfo.thumbnail = channelInfo.thumbnail;
        playlistInfo.banner = channelInfo.banner;
      }
      else {
        throw new Error(`Could not extract playlist id from source code of ${req.query.q}`);
      }
    }
    else {
      throw new Error(`Could not understand '${req.query.q}'`);
    }
  
    res.json(playlistInfo);
  }
  catch (err) {
    console.error('Failed to parse playlist:', err.message);
    res.status(400).json({ error: `Couldn't find any results for '${req.query.q}'` });
  }
});

app.get('/api/activity/:page', (req, res) => {
  const pageSize = 20;

  // Total count
  const totalCountRow = getActivitiesCount();
  const totalPages = Math.ceil(totalCountRow.count / pageSize);

  // Clamp requested page between 1 and totalPages
  const requestedPage = parseInt(req.params.page) || 1;
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;

  // Paged result with playlist title
  const activities = getActivities(pageSize, offset);

  res.json({
    page,
    totalPages,
    activities
  });
});

app.get('/api/downloads/:page', (req, res) => {
  const pageSize = 20;
  const totalCountRow = getDownloadsCount();
  const totalPages = Math.max(1, Math.ceil(totalCountRow.count / pageSize));
  const requestedPage = parseInt(req.params.page) || 1;
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const offset = (page - 1) * pageSize;

  res.json({
    page,
    totalPages,
    downloads: getDownloads(pageSize, offset),
  });
});

// Sonarr general settings (apikey, urlbase, port, etc) are stored in C:\ProgramData\Sonarr\config.xml. Maybe we should do the same for our .env or something

app.get('/api/settings', (req, res) => {
  const settings = Object.fromEntries(getSettings().map(row => [row.key, row.value]));
  res.json({
    download_enabled: 'false',
    download_dir: DEFAULT_DOWNLOAD_DIR,
    ytdlp_path: 'yt-dlp',
    download_output_template: DEFAULT_OUTPUT_TEMPLATE,
    ytdlp_format: DEFAULT_FORMAT,
    ytdlp_quality_preset: 'best',
    ytdlp_media_type: DEFAULT_MEDIA_TYPE,
    ytdlp_video_container: DEFAULT_VIDEO_CONTAINER,
    ytdlp_audio_format: DEFAULT_AUDIO_FORMAT,
    ytdlp_subtitles: DEFAULT_SUBTITLES,
    ytdlp_subtitle_langs: DEFAULT_SUBTITLE_LANGS,
    ytdlp_embed_subtitles: 'false',
    ytdlp_extra_args: '',
    ...settings,
  });
});

app.put('/api/settings', (req, res) => {
  const settings = req.body;

  try {
    insertSettings(settings);
    res.json({ success: true });
  }
  catch (err) {
    console.error('Failed to update settings:', err);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.get('/api/postprocessors', (req, res) => {
  res.json(getPostProcessors());
});

app.post('/api/postprocessors', (req, res) => {
  const { name, type, target, data } = req.body;
  if (!name || !type || !target || !data)
    return res.status(400).json({ error: 'Missing fields' });

  const result = insertPostProcessor(name, type, target, data);

  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

app.put('/api/postprocessors/:id', (req, res) => {
  const { name, type, target, data } = req.body;
  if (!name || !type || !target || !data)
    return res.status(400).json({ error: 'Missing fields' });

  const result = updatePostProcessor(req.params.id, name, type, target, data);

  if (result.changes === 0)
    return res.status(404).json({ error: 'Not found' });
  
  res.json({ success: true });
});

app.delete('/api/postprocessors/:id', (req, res) => {
  const result = deletePostProcessor(req.params.id);
  if (result.changes === 0)
    return res.status(404).json({ error: 'Not found' });
  
  res.json({ success: true });
});

app.post('/api/postprocessors/test', async (req, res) => {
  const { type, target, data } = req.body;
  if (!type || !target || !data)
    return res.status(400).json({ error: 'Missing fields' });

  try {
    const response = await runPostProcessor(type, target, data);
    res.json({ success: true, status: response.status, response: `Post processor responded with: ${response}` });
  }
  catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/meta', (req, res) => {
  res.json(getMeta());
})

app.get('/api/ytdlp/version', async (req, res) => {
  const settings = Object.fromEntries(getSettings().map(row => [row.key, row.value]));
  const version = await getYtdlpVersion(settings.ytdlp_path || 'yt-dlp');
  res.json({ version });
});

app.post('/api/ytdlp/update', async (req, res) => {
  try {
    const { output, version } = await updateYtdlp();
    res.json({ success: true, output, version });
  }
  catch (err) {
    console.error('Failed to update yt-dlp:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});


if (process.env.NODE_ENV === 'production') { // In production, allow the express server to serve both the api & the client UI
  // Serve static files from the React build folder
  app.use(express.static(path.join(__dirname, '..', 'client', 'build')));

  // If React app uses client-side routing, fallback to index.html for all other routes
  app.use((req, res, next) => {
    const accept = req.headers.accept || '';
    if (req.method === 'GET' && accept.includes('text/html')) {
      res.sendFile(path.resolve(__dirname, '..', 'client', 'build', 'index.html'));
    }
    else {
      next();
    }
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
