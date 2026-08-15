import { useEffect, useState } from 'react';
import DirectoryInput from '../components/DirectoryInput';
import PostProcessorDialog from '../components/PostProcessorDialog';
import { showToast } from '../utils/utils';

function SettingsPage() {
  const [ytsubsApiKey, setYtsubsApiKey] = useState('');
  const [excludeShorts, setExcludeShorts] = useState(false);
  const [downloadEnabled, setDownloadEnabled] = useState(false);
  const [downloadDir, setDownloadDir] = useState('/downloads');
  const [ytdlpPath, setYtdlpPath] = useState('yt-dlp');
  const [downloadOutputTemplate, setDownloadOutputTemplate] = useState('[[playlist.title]]/%(title)s.%(ext)s');
  const [ytdlpFormat, setYtdlpFormat] = useState('bestvideo+bestaudio/best');
  const [ytdlpQualityPreset, setYtdlpQualityPreset] = useState('best');
  const [ytdlpMediaType, setYtdlpMediaType] = useState('video');
  const [ytdlpVideoContainer, setYtdlpVideoContainer] = useState('mp4');
  const [ytdlpAudioFormat, setYtdlpAudioFormat] = useState('mp3');
  const [ytdlpSubtitles, setYtdlpSubtitles] = useState('none');
  const [ytdlpSubtitleLangs, setYtdlpSubtitleLangs] = useState('en.*');
  const [ytdlpEmbedSubtitles, setYtdlpEmbedSubtitles] = useState(false);
  const [ytdlpExtraArgs, setYtdlpExtraArgs] = useState('');
  const [postProcessors, setPostProcessors] = useState([]);
  const [ytdlpVersion, setYtdlpVersion] = useState(null);
  const [ytdlpUpdating, setYtdlpUpdating] = useState(false);

  const [editingPostProcessor, setEditingPostProcessor] = useState(null);

  const defaultWebhook = {
    name: '',
    type: 'webhook',
    target: '',
    data: "{\"method\":\"GET\"}", // Todo
  };

  useEffect(() => {
    refreshPostProcessors();
    refreshYtdlpVersion();

    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        setYtsubsApiKey(data.ytsubs_apikey ?? '');
        setExcludeShorts((data.exclude_shorts ?? 'false') === 'true'); // SQLite can't store bool
        setDownloadEnabled((data.download_enabled ?? 'false') === 'true');
        setDownloadDir(data.download_dir ?? '/downloads');
        setYtdlpPath(data.ytdlp_path ?? 'yt-dlp');
        setDownloadOutputTemplate(data.download_output_template ?? '[[playlist.title]]/%(title)s.%(ext)s');
        setYtdlpFormat(data.ytdlp_format ?? 'bestvideo+bestaudio/best');
        setYtdlpQualityPreset(data.ytdlp_quality_preset ?? 'best');
        setYtdlpMediaType(data.ytdlp_media_type ?? 'video');
        setYtdlpVideoContainer(data.ytdlp_video_container ?? 'mp4');
        setYtdlpAudioFormat(data.ytdlp_audio_format ?? 'mp3');
        setYtdlpSubtitles(data.ytdlp_subtitles ?? 'none');
        setYtdlpSubtitleLangs(data.ytdlp_subtitle_langs ?? 'en.*');
        setYtdlpEmbedSubtitles((data.ytdlp_embed_subtitles ?? 'false') === 'true');
        setYtdlpExtraArgs(data.ytdlp_extra_args ?? '');
      })
      .catch(err => {
        console.error('Failed to fetch settings', err);
      });
  }, []);

  const refreshPostProcessors = async () => {
    try {
      const res = await fetch('/api/postprocessors');
      setPostProcessors(await res.json());
    }
    catch (err) {
      console.error('Failed to fetch postprocessors', err);
    }
  };

  const refreshYtdlpVersion = async () => {
    try {
      const res = await fetch('/api/ytdlp/version');
      const data = await res.json();
      setYtdlpVersion(data.version);
    }
    catch (err) {
      console.error('Failed to fetch yt-dlp version', err);
    }
  };

  const handleUpdateYtdlp = async () => {
    setYtdlpUpdating(true);
    try {
      const res = await fetch('/api/ytdlp/update', { method: 'POST' });
      const data = await res.json();
      if (!res.ok || !data.success)
        throw new Error(data.error || 'Update failed');

      setYtdlpVersion(data.version);
      showToast(`yt-dlp updated to ${data.version}`, 'success');
    }
    catch (err) {
      console.error(err);
      showToast(`Failed to update yt-dlp: ${err.message}`, 'error');
    }
    finally {
      setYtdlpUpdating(false);
    }
  };

  const handleSave = async () => {
    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ytsubs_apikey: ytsubsApiKey,
          exclude_shorts: String(excludeShorts), // SQLite can't store bool
          download_enabled: String(downloadEnabled),
          download_dir: downloadDir,
          ytdlp_path: ytdlpPath,
          download_output_template: downloadOutputTemplate,
          ytdlp_format: ytdlpFormat,
          ytdlp_quality_preset: ytdlpQualityPreset,
          ytdlp_media_type: ytdlpMediaType,
          ytdlp_video_container: ytdlpVideoContainer,
          ytdlp_audio_format: ytdlpAudioFormat,
          ytdlp_subtitles: ytdlpSubtitles,
          ytdlp_subtitle_langs: ytdlpSubtitleLangs,
          ytdlp_embed_subtitles: String(ytdlpEmbedSubtitles),
          ytdlp_extra_args: ytdlpExtraArgs,
        }),
      });
  
      if (!res.ok)
        throw new Error('Failed to save settings');
      
      showToast('Saved settings', 'success');
    }
    catch (err) {
      console.error(err);
      showToast('Error saving settings', 'error');
    }
  };

  return (
    <div style={{height: '100%'}}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0px 20px', gap: 10, backgroundColor: '#262626', height: 60 }}>
        <button
          className='hover-blue'
          onClick={handleSave}
          title="Save Settings"
        >
          <i className="bi bi-floppy-fill"/>
          <div style={{fontSize: 'small'}}>Save</div>
        </button>
      </div>
      <div style={{display: 'flex', flexDirection: 'column', height: 'calc(100% - 120px)' /* Todo: not sure why this has to be 120 and not 60 */, padding: 30, overflowY: 'auto'}}>
        <div style={{fontWeight: 'bold', fontSize: 'xx-large'}}>
          Settings
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>YTSubs.app API key</div>
          <input type="text"
            value={ytsubsApiKey}
            onChange={e => setYtsubsApiKey(e.target.value)}
          />
        </div>
        <div className='setting flex-column-mobile'>
          {/* Todo: maybe instead of just "exclude shorts", we could let users choose from one of these prefixes: https://stackoverflow.com/a/77816885*/}
          <div style={{minWidth: 175}}>Exclude shorts</div>
          <label className='container'>
            <div style={{fontSize: 'small', textAlign: 'center'}}>Whether to exclude shorts videos from playlists</div>
            <input type='checkbox' checked={excludeShorts} onChange={e => setExcludeShorts(e.target.checked)}/>
            <span className="checkmark"></span>
          </label>
        </div>
        <div style={{marginTop: 50, fontWeight: 'bold', fontSize: 'xx-large'}}>
          Downloads
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Download new videos</div>
          <label className='container'>
            <div style={{fontSize: 'small', textAlign: 'center'}}>Run yt-dlp when a watched playlist finds a new video</div>
            <input type='checkbox' checked={downloadEnabled} onChange={e => setDownloadEnabled(e.target.checked)}/>
            <span className="checkmark"></span>
          </label>
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Download directory</div>
          <DirectoryInput
            value={downloadDir}
            onChange={setDownloadDir}
          />
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>yt-dlp path</div>
          <input type="text"
            value={ytdlpPath}
            onChange={e => setYtdlpPath(e.target.value)}
          />
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>yt-dlp version</div>
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <div>{ytdlpVersion ?? 'Unknown'}</div>
            <button className='hover-blue' onClick={handleUpdateYtdlp} disabled={ytdlpUpdating} title="Download and install the latest yt-dlp release">
              <i className={`bi bi-arrow-repeat${ytdlpUpdating ? ' spin' : ''}`}/>
              <div style={{fontSize: 'small'}}>{ytdlpUpdating ? 'Updating...' : 'Update yt-dlp'}</div>
            </button>
          </div>
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Output template</div>
          <textarea style={{resize: 'vertical', width: 'calc(100% - 18px)', minHeight: 70}}
            value={downloadOutputTemplate}
            onChange={e => setDownloadOutputTemplate(e.target.value)}
          />
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Quality preset</div>
          <select value={ytdlpQualityPreset} onChange={e => {
            const preset = e.target.value;
            setYtdlpQualityPreset(preset);
            // Auto-set format based on preset. Each prefers h264 video + AAC (m4a) audio first,
            // since that combination plays natively on the widest range of devices (older smart
            // TVs, game consoles, QuickTime, etc) - falling back to whatever streams are actually
            // available (which may include vp9/opus) if no h264/AAC version exists.
            const presetFormats = {
              '2160p': 'bestvideo[vcodec^=avc1][height<=2160]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio[ext=m4a]/bestvideo[height<=2160]+bestaudio/best[height<=2160]',
              '1440p': 'bestvideo[vcodec^=avc1][height<=1440]+bestaudio[ext=m4a]/bestvideo[height<=1440]+bestaudio[ext=m4a]/bestvideo[height<=1440]+bestaudio/best[height<=1440]',
              '1080p': 'bestvideo[vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio[ext=m4a]/bestvideo[height<=1080]+bestaudio/best[height<=1080]',
              '720p': 'bestvideo[vcodec^=avc1][height<=720]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio[ext=m4a]/bestvideo[height<=720]+bestaudio/best[height<=720]',
              '480p': 'bestvideo[vcodec^=avc1][height<=480]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio[ext=m4a]/bestvideo[height<=480]+bestaudio/best[height<=480]',
              '360p': 'bestvideo[vcodec^=avc1][height<=360]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio[ext=m4a]/bestvideo[height<=360]+bestaudio/best[height<=360]',
              '240p': 'bestvideo[vcodec^=avc1][height<=240]+bestaudio[ext=m4a]/bestvideo[height<=240]+bestaudio[ext=m4a]/bestvideo[height<=240]+bestaudio/best[height<=240]',
              'best': 'bestvideo[vcodec^=avc1]+bestaudio[ext=m4a]/bestvideo+bestaudio[ext=m4a]/bestvideo+bestaudio/best',
              'custom': ytdlpFormat // Keep current format for custom
            };
            if (preset !== 'custom') {
              setYtdlpFormat(presetFormats[preset]);
            }
          }}>
            <option value="best">Best quality</option>
            <option value="2160p">4K (2160p)</option>
            <option value="1440p">1440p</option>
            <option value="1080p">1080p</option>
            <option value="720p">720p</option>
            <option value="480p">480p</option>
            <option value="360p">360p</option>
            <option value="240p">240p</option>
            <option value="custom">Custom format</option>
          </select>
        </div>
        {ytdlpQualityPreset === 'custom' && 
          <div className='setting flex-column-mobile'>
            <div style={{minWidth: 175}}>Custom format selector</div>
            <input type="text"
              value={ytdlpFormat}
              onChange={e => setYtdlpFormat(e.target.value)}
              placeholder="e.g. bestvideo[height<=1080]+bestaudio/best"
            />
          </div>
        }
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Media type</div>
          <select value={ytdlpMediaType} onChange={e => setYtdlpMediaType(e.target.value)}>
            <option value="video">Video</option>
            <option value="audio">Audio only</option>
          </select>
        </div>
        {ytdlpMediaType === 'video' ?
          <div className='setting flex-column-mobile'>
            <div style={{minWidth: 175}}>Video container</div>
            <select value={ytdlpVideoContainer} onChange={e => setYtdlpVideoContainer(e.target.value)}>
              <option value="mp4">MP4 (recommended, most compatible)</option>
              <option value="mkv">MKV</option>
              <option value="webm">WebM</option>
              <option value="mov">MOV</option>
              <option value="default">Best available (may not play on older devices)</option>
            </select>
          </div>
        :
          <div className='setting flex-column-mobile'>
            <div style={{minWidth: 175}}>Audio format</div>
            <select value={ytdlpAudioFormat} onChange={e => setYtdlpAudioFormat(e.target.value)}>
              <option value="mp3">MP3</option>
              <option value="m4a">M4A</option>
              <option value="flac">FLAC</option>
              <option value="opus">Opus</option>
              <option value="wav">WAV</option>
              <option value="best">Best available</option>
            </select>
          </div>
        }
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Subtitles</div>
          <select value={ytdlpSubtitles} onChange={e => setYtdlpSubtitles(e.target.value)}>
            <option value="none">None</option>
            <option value="manual">Creator subtitles</option>
            <option value="auto">Auto-generated subtitles</option>
            <option value="both">Creator + auto-generated</option>
          </select>
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Subtitle languages</div>
          <input type="text"
            value={ytdlpSubtitleLangs}
            onChange={e => setYtdlpSubtitleLangs(e.target.value)}
          />
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Embed subtitles</div>
          <label className='container'>
            <div style={{fontSize: 'small', textAlign: 'center'}}>Embed subtitles into video files when yt-dlp can</div>
            <input type='checkbox' checked={ytdlpEmbedSubtitles} onChange={e => setYtdlpEmbedSubtitles(e.target.checked)}/>
            <span className="checkmark"></span>
          </label>
        </div>
        <div className='setting flex-column-mobile'>
          <div style={{minWidth: 175}}>Extra yt-dlp args</div>
          <textarea style={{resize: 'vertical', width: 'calc(100% - 18px)', minHeight: 70}}
            value={ytdlpExtraArgs}
            onChange={e => setYtdlpExtraArgs(e.target.value)}
          />
        </div>
        {/* Todo: eventually, I think "Post Processors" should be a separate page under Settings (like Sonarr's "Connect") */}
        <div style={{marginTop: 50, fontWeight: 'bold', fontSize: 'xx-large'}}>
          Post Processors
        </div>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '20px',
          marginTop: 10,
        }}>
          {postProcessors.map(postProcessor =>
            <div key={postProcessor.id} className='card' style={{padding: 10}}>
              <button onClick={() => setEditingPostProcessor(postProcessor)} style={{display: 'flex', flexDirection: 'column', alignItems: 'start', width: '100%', height: '100%'}}>
                <h3 style={{fontSize: 'x-large', margin: '0 0 5px 0',}}>{postProcessor.name}</h3>
                <div style={{display: 'flex', backgroundColor: 'var(--accent-color)', padding: 5, margin: 10, gap: 5, borderRadius: 2}}>
                  <i style={{fontSize: 'medium'}} className={`bi bi-${postProcessor.type === 'webhook' ? 'broadcast' : 'cpu-fill'}`}/>
                  <div style={{fontSize: 'small'}}>{postProcessor.type}</div>
                </div>
              </button>
            </div>
          )}
          <div className='card' style={{display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10}}>
            <button style={{width: '100%', height: '100%'}} onClick={() => setEditingPostProcessor(defaultWebhook)}>
              <i style={{fontSize: 'xx-large'}} className="bi bi-plus-square"/>
            </button>
          </div>
        </div>
        <br />
        <PostProcessorDialog editingItem={editingPostProcessor} onClose={() => setEditingPostProcessor(null)} onRefreshPostProcessors={() => refreshPostProcessors()}/>
        <div style={{flexGrow: 1}}/>
        <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
          <a style={{height: 36}} href='https://ko-fi.com/E1E5RZJY' target='_blank' rel='noreferrer'>
            <img height='36' style={{border: 0, height: 36}} src='https://storage.ko-fi.com/cdn/kofi6.png?v=6' border='0' alt='Buy Me a Coffee at ko-fi.com' />
          </a>
          <a href='https://github.com/derekantrican/subarr' target='_blank' rel='noreferrer'>
            <i style={{height: 36, width: 36, fontSize: '36px', color: 'white', textAlign: 'center'}} className='bi bi-github'/>
          </a>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;
