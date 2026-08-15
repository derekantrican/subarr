const fetch = require('node-fetch');
const { spawn } = require('node:child_process');
const parseArgs = require('string-argv').default;

async function fetchWithRetry(url, options = {}, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fetch(url, options);
    }
    catch (err) {
      if (attempt === retries - 1)
        throw err;
      
      await new Promise(r => setTimeout(r, 1000)); // wait before retry
    }
  }
}

async function runCommand(command, args) {
  console.log(`Launching command '${command}' with args '${args}'`);
  return new Promise((resolve, reject) => {
    const child = spawn(command, parseArgs(args));

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      // Todo: for yt-dlp (or youtube-dl) it would be nice if we could parse the output to get real-time download progress and return it to the UI
      stdout += data.toString();
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
    });

    child.on('close', code => {
      if (code === 0) {
        resolve(stdout.trim());
      }
      else {
        reject(new Error(`Process exited with code ${code}:\n${stderr.trim()}`));
      }
    });

    child.on('error', err => {
      reject(new Error(`Failed to start process: ${err.message}`));
    });
  });
}

async function tryRunYtDlpJson(args) {
  try {
    const output = await runCommand('yt-dlp', `--js-runtime node ${args}`);
    return output ? JSON.parse(output) : null;
  }
  catch (err) {
    console.warn(`yt-dlp JSON fallback failed: ${err.message}`);
    return null;
  }
}

function uploadsPlaylistIdFromChannelId(channelId) {
  return channelId?.startsWith('UC') ? `UU${channelId.slice(2)}` : channelId;
}

function channelIdFromUploadsPlaylistId(playlistId) {
  return playlistId?.startsWith('UU') ? `UC${playlistId.slice(2)}` : playlistId;
}

async function tryParseAdditionalChannelData(url) {
  const response = await fetch(url);
  const responseText = await response.text();
  const channelFeedMatches = [...responseText.matchAll(/https:\/\/www\.youtube\.com\/feeds\/videos\.xml\?channel_id=(UC|UU|PL|LL|FL)[\w-]{10,}/g)];

  const channelInfo = {};

  if (channelFeedMatches.length > 0 && channelFeedMatches[0][0]) {
    channelInfo.channel_id = channelFeedMatches[0][0].match(/(UC|UU|PL|LL|FL)[\w-]{10,}/)[0].replace(/^UU/, 'UC');
    channelInfo.playlist_id = channelInfo.channel_id;
  }

  // Also grep the channel thumbnail from the HTML source code (which could also be done for description, etc in the future)
  // Use the more specific "decoratedAvatarViewModel" pattern to target the channel's own header avatar,
  // avoiding false matches from collaborator/featured channel avatars elsewhere on the page.
  const channelThumbnailMatch = (
    /"decoratedAvatarViewModel":\{"avatar":\{"avatarViewModel":\{"image":\{"sources":(?<avatar_array>\[[^\]]+\])/.exec(responseText)
    ?? /"avatarViewModel":\{"image":\{"sources":(?<avatar_array>\[[^\]]+\])/.exec(responseText)
  );
  
  if (channelThumbnailMatch) {
    const avatarArray = JSON.parse(channelThumbnailMatch.groups.avatar_array);
    channelInfo.thumbnail = avatarArray.find(a => a.width === 160)?.url ?? avatarArray[0].url;
  }

  const channelBannerMatch = /"imageBannerViewModel":{"image":{"sources":(?<banner_array>\[[^\]]+\])/.exec(responseText);
  if (channelBannerMatch) {
    const bannerArray = JSON.parse(channelBannerMatch.groups.banner_array);
    channelInfo.banner = bannerArray.find(b => b.height === 424)?.url ?? bannerArray[0].url;
  }

  if (!channelInfo.channel_id && /youtube\.com\/(@|channel)/.test(url)) {
    const ytdlpInfo = await tryRunYtDlpJson(`--dump-single-json --flat-playlist --playlist-end 1 "${url.replace(/\/$/, '')}/videos"`);
    if (ytdlpInfo?.channel_id || ytdlpInfo?.id?.startsWith('UC')) {
      channelInfo.channel_id = ytdlpInfo.channel_id || ytdlpInfo.id;
      channelInfo.playlist_id = channelInfo.channel_id;
      channelInfo.thumbnail = channelInfo.thumbnail || ytdlpInfo.thumbnails?.find(t => t.width >= 160)?.url || ytdlpInfo.thumbnail;
      channelInfo.banner = channelInfo.banner || ytdlpInfo.thumbnails?.find(t => t.width >= 1000)?.url;
    }
  }

  return channelInfo;
}

async function getYtdlpVersion(ytdlpPath = 'yt-dlp') {
  try {
    return (await runCommand(ytdlpPath, '--version')).trim();
  }
  catch (err) {
    console.warn(`Failed to get yt-dlp version: ${err.message}`);
    return null;
  }
}

// yt-dlp is installed via `pip install --user` (see Dockerfile), so it has to be updated the
// same way - yt-dlp's own self-update flag (-U) refuses to run for pip installs and just tells
// you to use pip instead. This only works for the bundled pip-managed install; if the user has
// pointed "yt-dlp path" at a custom binary, this will still try (and likely fail) via pip.
async function updateYtdlp() {
  const output = await runCommand('pip3', 'install --no-cache-dir --user --upgrade --break-system-packages yt-dlp');
  const version = await getYtdlpVersion();
  return { output, version };
}

function getMeta() {
  return {
    versions: {
      subarr: 1.2,
      node: process.version,
    },
  };
}

module.exports = { fetchWithRetry, runCommand, tryRunYtDlpJson, tryParseAdditionalChannelData, uploadsPlaylistIdFromChannelId, channelIdFromUploadsPlaylistId, getMeta, getYtdlpVersion, updateYtdlp }
