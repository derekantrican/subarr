const fs = require('fs');
const path = require('path');
const { runCommand } = require('./utils');

const DEFAULT_DOWNLOAD_DIR = '/downloads';
const DEFAULT_OUTPUT_TEMPLATE = '[[playlist.title]]/%(title)s.%(ext)s';
const DEFAULT_FORMAT = 'bestvideo+bestaudio/best';
const DEFAULT_MEDIA_TYPE = 'video';
const DEFAULT_VIDEO_CONTAINER = 'default';
const DEFAULT_AUDIO_FORMAT = 'mp3';
const DEFAULT_SUBTITLES = 'none';
const DEFAULT_SUBTITLE_LANGS = 'en.*';

function isTruthy(value) {
  return String(value ?? 'false').toLowerCase() === 'true';
}

function sanitizePathSegment(value) {
  return String(value ?? '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_')
    .replace(/\.+$/g, '')
    .trim() || 'Unknown';
}

function replaceDownloadVariables(text, { video, playlist }) {
  const replacements = {
    '[[video.title]]': sanitizePathSegment(video.title),
    '[[video.video_id]]': video.video_id,
    '[[video.published_at]]': video.published_at,
    '[[playlist.title]]': sanitizePathSegment(playlist.title),
  };

  let result = text;
  for (const [key, value] of Object.entries(replacements)) {
    result = result.replaceAll(key, value ?? '');
  }
  return result;
}

function quoteArg(value) {
  return JSON.stringify(String(value));
}

function firstNonEmpty(...values) {
  return values.find(value => value !== undefined && value !== null && value !== '');
}

function getDownloadSettings(settings, playlist = {}, options = {}) {
  const playlistEnabled = playlist.download_enabled;
  return {
    enabled: options.force || (playlistEnabled ? isTruthy(playlistEnabled) : isTruthy(settings.download_enabled)),
    dir: firstNonEmpty(playlist.download_dir, settings.download_dir, DEFAULT_DOWNLOAD_DIR),
    ytdlpPath: settings.ytdlp_path || 'yt-dlp',
    outputTemplate: firstNonEmpty(playlist.download_output_template, settings.download_output_template, DEFAULT_OUTPUT_TEMPLATE),
    format: firstNonEmpty(playlist.ytdlp_format, settings.ytdlp_format, DEFAULT_FORMAT),
    mediaType: firstNonEmpty(playlist.ytdlp_media_type, settings.ytdlp_media_type, DEFAULT_MEDIA_TYPE),
    videoContainer: firstNonEmpty(playlist.ytdlp_video_container, settings.ytdlp_video_container, DEFAULT_VIDEO_CONTAINER),
    audioFormat: firstNonEmpty(playlist.ytdlp_audio_format, settings.ytdlp_audio_format, DEFAULT_AUDIO_FORMAT),
    subtitles: firstNonEmpty(playlist.ytdlp_subtitles, settings.ytdlp_subtitles, DEFAULT_SUBTITLES),
    subtitleLangs: firstNonEmpty(playlist.ytdlp_subtitle_langs, settings.ytdlp_subtitle_langs, DEFAULT_SUBTITLE_LANGS),
    embedSubtitles: isTruthy(firstNonEmpty(playlist.ytdlp_embed_subtitles, settings.ytdlp_embed_subtitles, 'false')),
    extraArgs: firstNonEmpty(playlist.ytdlp_extra_args, settings.ytdlp_extra_args, ''),
  };
}

function buildYtdlpArgs(downloadSettings, outputPath, videoUrl) {
  const args = [
    '--no-playlist',
    '--download-archive',
    path.join(downloadSettings.dir, '.subarr-yt-dlp-archive.txt'),
    '-f',
    downloadSettings.format,
    '-o',
    outputPath,
  ];

  if (downloadSettings.mediaType === 'audio') {
    args.push('-x', '--audio-format', downloadSettings.audioFormat);
  }
  else if (downloadSettings.videoContainer && downloadSettings.videoContainer !== 'default') {
    args.push('--merge-output-format', downloadSettings.videoContainer);
  }

  if (downloadSettings.subtitles === 'manual' || downloadSettings.subtitles === 'both') {
    args.push('--write-subs');
  }
  if (downloadSettings.subtitles === 'auto' || downloadSettings.subtitles === 'both') {
    args.push('--write-auto-subs');
  }
  if (downloadSettings.subtitles !== 'none' && downloadSettings.subtitleLangs) {
    args.push('--sub-langs', downloadSettings.subtitleLangs);
  }
  if (downloadSettings.mediaType !== 'audio' && downloadSettings.embedSubtitles) {
    args.push('--embed-subs');
  }

  const quotedArgs = args.map(quoteArg).join(' ');
  return `${quotedArgs}${downloadSettings.extraArgs ? ` ${downloadSettings.extraArgs}` : ''} ${quoteArg(videoUrl)}`;
}

async function downloadVideo(settings, videoInfo, options = {}) {
  const downloadSettings = getDownloadSettings(settings, videoInfo.playlist, options);
  if (!downloadSettings.enabled) {
    return null;
  }

  const relativeOutput = replaceDownloadVariables(downloadSettings.outputTemplate, videoInfo);
  const outputPath = path.isAbsolute(relativeOutput)
    ? relativeOutput
    : path.join(downloadSettings.dir, relativeOutput);
  fs.mkdirSync(downloadSettings.dir, { recursive: true });

  const videoUrl = `https://www.youtube.com/watch?v=${videoInfo.video.video_id}`;
  const args = buildYtdlpArgs(downloadSettings, outputPath, videoUrl);

  const stdout = await runCommand(downloadSettings.ytdlpPath, args);
  return { outputPath, stdout };
}

module.exports = {
  DEFAULT_DOWNLOAD_DIR,
  DEFAULT_OUTPUT_TEMPLATE,
  DEFAULT_FORMAT,
  DEFAULT_MEDIA_TYPE,
  DEFAULT_VIDEO_CONTAINER,
  DEFAULT_AUDIO_FORMAT,
  DEFAULT_SUBTITLES,
  DEFAULT_SUBTITLE_LANGS,
  downloadVideo,
  getDownloadSettings,
};
