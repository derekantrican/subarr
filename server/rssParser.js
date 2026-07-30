const Parser = require('rss-parser');
const { insertVideo } = require('./dbQueries');
const { runCommand, channelIdFromUploadsPlaylistId } = require('./utils');

const parser = new Parser({
  customFields: {
    feed: ['yt:channelId', 'yt:playlistId', ['author', 'author', { keepArray: false }]],
    item: ['media:group', 
      ['media:thumbnail', 'thumbnail', { keepArray: false }],
      ['media:statistics', 'statistics', { keepArray: false }],
    ],
  }
});

async function parseUrlWithRetry(url, retries = 3, delay = 1000) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const feed = await parser.parseURL(url);
      return feed;
    }
    catch (err) {
      if (attempt === retries - 1)
        throw err; // rethrow final failure
      
      console.warn(`parseURL failed (attempt ${attempt + 1}):`, err.message);
      await new Promise(res => setTimeout(res, delay));
    }
  }
}

function getFeedUrl(sourceId) {
  if (sourceId.startsWith('UC')) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${sourceId}`;
  }

  return `https://www.youtube.com/feeds/videos.xml?playlist_id=${sourceId}`;
}

function getYtDlpSourceUrl(sourceId) {
  if (sourceId.startsWith('UC')) {
    return `https://www.youtube.com/channel/${sourceId}/videos`;
  }
  if (sourceId.startsWith('UU')) {
    return `https://www.youtube.com/channel/${channelIdFromUploadsPlaylistId(sourceId)}/videos`;
  }

  return `https://www.youtube.com/playlist?list=${sourceId}`;
}

function formatYtDlpDate(entry) {
  if (entry.timestamp) {
    return new Date(entry.timestamp * 1000).toISOString();
  }
  if (entry.upload_date && /^(\d{8})$/.test(entry.upload_date)) {
    const year = entry.upload_date.slice(0, 4);
    const month = entry.upload_date.slice(4, 6);
    const day = entry.upload_date.slice(6, 8);
    return new Date(`${year}-${month}-${day}T00:00:00.000Z`).toISOString();
  }

  return null;
}

async function parseVideosWithYtDlp(sourceId, playlistInfoCallback, videoInfoCallback) {
  const sourceUrl = getYtDlpSourceUrl(sourceId);
  const output = await runCommand('yt-dlp', `--js-runtime node --ignore-errors --dump-json --playlist-end 15 "${sourceUrl}"`);
  const entries = output
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line));
  const firstEntry = entries[0];
  const channelId = firstEntry?.channel_id || (sourceId.startsWith('UC') ? sourceId : channelIdFromUploadsPlaylistId(sourceId));
  const playlistTitle = firstEntry?.channel || firstEntry?.playlist_title || `Playlist ${sourceId.slice(0, 6)}`;

  if (playlistInfoCallback) {
    await playlistInfoCallback({
      channel_id: channelId,
      playlist_id: sourceId.startsWith('UU') ? channelIdFromUploadsPlaylistId(sourceId) : sourceId,
      author_name: firstEntry?.channel,
      author_uri: firstEntry?.channel_url,
      title: playlistTitle,
      thumbnail: firstEntry?.thumbnail,
    });
  }

  for (const entry of entries) {
    const videoId = entry.id;
    const videoTitle = entry.title || 'Untitled';
    const publishedAt = formatYtDlpDate(entry);
    const videoThumbnail = entry.thumbnail || null;
    const link = entry.webpage_url || `https://www.youtube.com/watch?v=${videoId}`;

    let alreadyExists = false;
    if (videoId) {
      const result = insertVideo(sourceId.startsWith('UU') ? channelIdFromUploadsPlaylistId(sourceId) : sourceId, videoId, videoTitle, publishedAt, videoThumbnail);
      alreadyExists = result.changes === 0;
    }

    if (videoInfoCallback) {
      await videoInfoCallback({
        title: videoTitle,
        video_id: videoId,
        link,
        thumbnail: videoThumbnail,
        published_at: publishedAt,
        playlist_title: playlistTitle,
      }, alreadyExists);
    }
  }
}

async function parseVideosFromFeed(playlistId, playlistInfoCallback, videoInfoCallback) {
  const normalizedSourceId = playlistId.startsWith('UU') ? channelIdFromUploadsPlaylistId(playlistId) : playlistId;
  const feedUrl = getFeedUrl(normalizedSourceId);

  let feed;
  try {
    feed = await parseUrlWithRetry(feedUrl);
  }
  catch (err) {
    console.warn(`RSS feed failed for ${playlistId}: ${err.message}. Falling back to yt-dlp.`);
    return await parseVideosWithYtDlp(playlistId, playlistInfoCallback, videoInfoCallback);
  }
  const channelId = feed['yt:channelId'];
  const playlistAuthor = feed.author || {};
  const playlistTitle = feed.title === 'Videos' && feed.author?.name ? 
    feed.author.name : // If a user is adding a UU playlist, we should use the author name instead of the playlist name (which will always be "Videos") to avoid confusion
    feed.title || `Playlist ${playlistId.slice(0, 6)}`;
  const playlistThumbnail = feed.items?.[0]?.['media:group']?.['media:thumbnail']?.[0]?.$?.url || null;

  if (playlistInfoCallback) {
    await playlistInfoCallback({
      channel_id: channelId, // This isn't part of the db item, but it will be used to grab the banner, etc info for the channel
      playlist_id: normalizedSourceId,
      author_name : playlistAuthor?.name,
      author_uri : playlistAuthor?.uri,
      title: playlistTitle,
      thumbnail: playlistThumbnail,
    });
  }

  for (const item of feed.items) {
    const videoId = item.id?.split(':')?.[2];
    const videoTitle = item.title || 'Untitled';
    const publishedAt = item.pubDate || null;
    const videoThumbnail = item?.['media:group']?.['media:thumbnail']?.[0]?.$?.url || null;

    let alreadyExists = false;
    if (videoId) {
      const result = insertVideo(normalizedSourceId, videoId, videoTitle, publishedAt, videoThumbnail);
      alreadyExists = result.changes === 0;
    }

    if (videoInfoCallback) {
      await videoInfoCallback({
        title: videoTitle,
        video_id: videoId,
        link: item.link, // Currently only used for videoInfoCallback (not stored in DB). If we want to exclude shorts from the UI as well, then we'll have to exclude these videos earlier in this method
        thumbnail: videoThumbnail,
        published_at: publishedAt,
        playlist_title: playlistTitle,
      }, alreadyExists);
    }
  }
}

module.exports = { parseVideosFromFeed };
