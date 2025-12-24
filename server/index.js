require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { parseVideosFromFeed } = require('./rssParser');
const { schedulePolling, updateYtSubsPlaylists, removePolling } = require('./polling');
const { runPostProcessor } = require('./postProcessors');
const { tryParseAdditionalChannelData, getMeta } = require('./utils');
const {
  getPlaylists,
  getSettings,
  insertPlaylist,
  getPlaylist,
  insertActivity,
  updatePlaylist,
  deletePlaylist,
  deleteVideosForPlaylist,
  getActivitiesCount,
  getActivities,
  insertSettings,
  getPostProcessors,
  insertPostProcessor,
  deletePostProcessor,
  getVideosForPlaylist
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

app.get('/api/playlists', (req, res) => {
  res.json(getPlaylists());
});

app.post('/api/playlists', async (req, res) => {
  let { playlistId } = req.body;
  if (!/^(PL|UU|LL|FL)[\w-]{10,}$/.test(playlistId)) {
    return res.status(400).json({ error: 'Invalid playlist ID' });
  }

  const settings = Object.fromEntries(getSettings().map(row => [row.key, row.value]));
  const exclude_shorts = (settings.exclude_shorts ?? 'false') === 'true'; // SQLite can't store bool
  if (exclude_shorts) {
    playlistId = playlistId.replace(/^^UU(?!LF)/, 'UULF'); // Reference: other possible prefixes: https://stackoverflow.com/a/77816885
    // Todo: it's worth noting that "UULF" WON'T contain recordings from past live streams (those are still in "UU", however)
  }

  try {
    let playlistDbId = null;
    await parseVideosFromFeed(playlistId, async playlist => {
      if (playlistId.startsWith('UU')) {
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
  const { check_interval_minutes, regex_filter } = req.body;

  const playlist = getPlaylist(req.params.id);
  if (!playlist)
    return res.status(404).json({ error: 'Not found' });

  updatePlaylist(playlist.playlist_id, check_interval_minutes, regex_filter);

  const updatedPlaylist = getPlaylist(req.params.id);
  schedulePolling(updatedPlaylist); // reschedules with updated values

  res.json({ success: true });
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
      const adjustedPlaylistId = req.query.q.match(/(UC|UU|PL|LL|FL)[\w-]{10,}/)[0].replace(/^UC/, 'UU');
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

// Sonarr general settings (apikey, urlbase, port, etc) are stored in C:\ProgramData\Sonarr\config.xml. Maybe we should do the same for our .env or something

app.get('/api/settings', (req, res) => {
  const settings = Object.fromEntries(getSettings().map(row => [row.key, row.value]));
  res.json(settings);
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

  const result = updatePostProcessor(name, type, target, data, req.params.id);

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