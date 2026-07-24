import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import DirectoryInput from '../components/DirectoryInput';
import Thumbnail from '../components/Thumbnail';
import { showToast } from '../utils/utils';

function PlaylistDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [playlist, setPlaylist] = useState(null);
  const [interval, setInterval] = useState(60);
  const [regex, setRegex] = useState('');
  const [downloadEnabled, setDownloadEnabled] = useState('');
  const [downloadDir, setDownloadDir] = useState('');
  const [downloadOutputTemplate, setDownloadOutputTemplate] = useState('');
  const [ytdlpFormat, setYtdlpFormat] = useState('');
  const [ytdlpMediaType, setYtdlpMediaType] = useState('');
  const [ytdlpVideoContainer, setYtdlpVideoContainer] = useState('');
  const [ytdlpAudioFormat, setYtdlpAudioFormat] = useState('');
  const [ytdlpSubtitles, setYtdlpSubtitles] = useState('');
  const [ytdlpSubtitleLangs, setYtdlpSubtitleLangs] = useState('');
  const [ytdlpEmbedSubtitles, setYtdlpEmbedSubtitles] = useState('');
  const [ytdlpExtraArgs, setYtdlpExtraArgs] = useState('');
  const [videos, setVideos] = useState([]);
  const [testingRegex, setTestingRegex] = useState(false);
  const [downloadingVideoIds, setDownloadingVideoIds] = useState(new Set());
  const [isSyncing, setIsSyncing] = useState(false);

  const refreshPlaylist = useCallback(() => {
    fetch(`/api/playlists/${id}`)
      .then(res => res.json())
      .then(data => {
        setPlaylist(data.playlist);
        setInterval(data.playlist.check_interval_minutes || 60);
        setRegex(data.playlist.regex_filter || '');
        setDownloadEnabled(data.playlist.download_enabled ?? '');
        setDownloadDir(data.playlist.download_dir ?? '');
        setDownloadOutputTemplate(data.playlist.download_output_template ?? '');
        setYtdlpFormat(data.playlist.ytdlp_format ?? '');
        setYtdlpMediaType(data.playlist.ytdlp_media_type ?? '');
        setYtdlpVideoContainer(data.playlist.ytdlp_video_container ?? '');
        setYtdlpAudioFormat(data.playlist.ytdlp_audio_format ?? '');
        setYtdlpSubtitles(data.playlist.ytdlp_subtitles ?? '');
        setYtdlpSubtitleLangs(data.playlist.ytdlp_subtitle_langs ?? '');
        setYtdlpEmbedSubtitles(data.playlist.ytdlp_embed_subtitles ?? '');
        setYtdlpExtraArgs(data.playlist.ytdlp_extra_args ?? '');
        setVideos(data.videos || []);
      })
      .catch(err => {
        console.error('Error loading playlist', err);
      });
  }, [id]);

  useEffect(() => {
    refreshPlaylist();
  }, [refreshPlaylist]);  

  const handleSave = async () => {
    const normalizedInterval = Math.max(5, Math.ceil(Number(interval) || 5));

    try {
      const res = await fetch(`/api/playlists/${id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_interval_minutes: normalizedInterval,
          regex_filter: regex,
          download_enabled: downloadEnabled,
          download_dir: downloadDir,
          download_output_template: downloadOutputTemplate,
          ytdlp_format: ytdlpFormat,
          ytdlp_media_type: ytdlpMediaType,
          ytdlp_video_container: ytdlpVideoContainer,
          ytdlp_audio_format: ytdlpAudioFormat,
          ytdlp_subtitles: ytdlpSubtitles,
          ytdlp_subtitle_langs: ytdlpSubtitleLangs,
          ytdlp_embed_subtitles: ytdlpEmbedSubtitles,
          ytdlp_extra_args: ytdlpExtraArgs,
        }),
      });
  
      if (!res.ok)
        throw new Error('Failed to save');
      
      setInterval(normalizedInterval);
      showToast('Settings saved!', 'success');
    }
    catch (err) {
      console.error(err);
      showToast('Error saving settings', 'error');
    }
  };  

  const handleSync = async () => {
    setIsSyncing(true);

    try {
      const res = await fetch(`/api/playlists/${id}/sync`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Sync failed' }));
        throw new Error(error.error || 'Sync failed');
      }

      refreshPlaylist();
      showToast('Sync completed', 'success');
    }
    catch (err) {
      console.error(err);
      showToast(`Sync failed: ${err.message}`, 'error');
    }
    finally {
      setIsSyncing(false);
    }
  };

  const handleManualDownload = async (video) => {
    setDownloadingVideoIds(prev => new Set(prev).add(video.video_id));

    try {
      const res = await fetch(`/api/playlists/${id}/videos/${video.video_id}/download`, {
        method: 'POST',
      });

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Download failed' }));
        throw new Error(error.error || 'Download failed');
      }

      showToast(`Download finished for '${video.title}'`, 'success');
    }
    catch (err) {
      console.error(err);
      showToast(`Download failed: ${err.message}`, 'error');
    }
    finally {
      setDownloadingVideoIds(prev => {
        const next = new Set(prev);
        next.delete(video.video_id);
        return next;
      });
    }
  };

  const handleDelete = async () => {
    const confirmDelete = window.confirm('Are you sure you want to remove this playlist?'); // Todo: use DialogBase instead
    if (!confirmDelete)
      return;
  
    try {
      const res = await fetch(`/api/playlists/${id}`, {
        method: 'DELETE',
      });
  
      if (!res.ok)
        throw new Error('Failed to delete');
      
      showToast('Playlist removed', 'success');
      navigate('/'); //Navigate back to homepage
    }
    catch (err) {
      console.error(err);
      showToast('Error deleting playlist', 'error');
    }
  };  

  if (!playlist)
    return <p>Loading...</p>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0px 20px', gap: 10, backgroundColor: '#262626', height: 60 }}>
        <button className='hover-blue' onClick={handleSave} title="Save Settings">
          <i className="bi bi-floppy-fill"></i>
          <div style={{ fontSize: 'small' }}>Save</div>
        </button>
        <button className='hover-blue' onClick={handleSync} title="Sync Now" disabled={isSyncing}>
          <i className={`bi bi-${isSyncing ? 'hourglass-split' : 'arrow-repeat'}`}></i>
          <div style={{ fontSize: 'small' }}>Sync</div>
        </button>
        <button className='hover-danger' onClick={handleDelete} title="Delete Playlist">
          <i className="bi bi-trash-fill"></i>
          <div style={{ fontSize: 'small' }}>Delete</div>
        </button>
      </div>
      <div style={{minHeight: 425, width: '100%', backgroundImage: playlist.banner ? `url(https://wsrv.nl/?url=${playlist.banner})` : '', backgroundColor: 'rgb(0, 0, 0, 0.7)',
                   backgroundSize: 'cover', backgroundBlendMode: 'darken'}}>
        <div style={{minHeight: 365, padding: 30, display: 'flex', gap: 40}}>
          <Thumbnail className='playlistDetails-poster' height='350' width='350' src={playlist.thumbnail}/>
          <div style={{display: 'flex', flexDirection: 'column', width: '100%'}}>
            <div style={{fontSize: 'xxx-large', overflowWrap: 'anywhere'}} title={playlist.playlist_id}>{playlist.title}</div>
            {!playlist.playlist_id.startsWith('UU') ? <div style={{fontStyle: 'italic', marginBottom: 10}}>{`By ${playlist.author_name}`}</div> : null}
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Check Interval (minutes):</div>
              <input
                type="number"
                value={interval}
                min={5} // A minimum of 5 minutes will help avoid too many iterations on the server (which might hit YouTube API limits?)
                step={1}
                onChange={e => setInterval(e.target.value)}
                style={{ width: 60 }}
              />
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Regex Filter (optional):</div>
              <div style={{display: 'flex', alignItems: 'center', width: '100%', marginTop: 5}}>
                <input
                  type="text"
                  value={regex}
                  onChange={e => setRegex(e.target.value)}
                  style={{ width: 300, marginTop: 0 }}
                />
                <button
                  style={{fontSize: 'medium', backgroundColor: 'cornflowerblue', borderRadius: 4, marginLeft: 5, height: 30}}
                  onClick={() => setTestingRegex(true)}>
                  Test
                </button>
              </div>
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Downloads:</div>
              <select
                value={downloadEnabled}
                onChange={e => setDownloadEnabled(e.target.value)}
                style={{ width: 170 }}>
                <option value="">Use global setting</option>
                <option value="true">Enabled</option>
                <option value="false">Disabled</option>
              </select>
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Download dir override:</div>
              <DirectoryInput
                value={downloadDir}
                placeholder="Use global directory"
                onChange={setDownloadDir}
                style={{ width: 300 }}
              />
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Output template override:</div>
              <input
                type="text"
                value={downloadOutputTemplate}
                placeholder="Use global template"
                onChange={e => setDownloadOutputTemplate(e.target.value)}
                style={{ width: 300 }}
              />
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Format override:</div>
              <input
                type="text"
                value={ytdlpFormat}
                placeholder="Use global format"
                onChange={e => setYtdlpFormat(e.target.value)}
                style={{ width: 300 }}
              />
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Media type override:</div>
              <select
                value={ytdlpMediaType}
                onChange={e => setYtdlpMediaType(e.target.value)}
                style={{ width: 170 }}>
                <option value="">Use global type</option>
                <option value="video">Video</option>
                <option value="audio">Audio only</option>
              </select>
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Video container override:</div>
              <select
                value={ytdlpVideoContainer}
                onChange={e => setYtdlpVideoContainer(e.target.value)}
                style={{ width: 170 }}>
                <option value="">Use global container</option>
                <option value="default">Best available</option>
                <option value="mp4">MP4</option>
                <option value="mkv">MKV</option>
                <option value="webm">WebM</option>
                <option value="mov">MOV</option>
              </select>
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Audio format override:</div>
              <select
                value={ytdlpAudioFormat}
                onChange={e => setYtdlpAudioFormat(e.target.value)}
                style={{ width: 170 }}>
                <option value="">Use global audio</option>
                <option value="mp3">MP3</option>
                <option value="m4a">M4A</option>
                <option value="flac">FLAC</option>
                <option value="opus">Opus</option>
                <option value="wav">WAV</option>
                <option value="best">Best available</option>
              </select>
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Subtitles override:</div>
              <select
                value={ytdlpSubtitles}
                onChange={e => setYtdlpSubtitles(e.target.value)}
                style={{ width: 230 }}>
                <option value="">Use global subtitles</option>
                <option value="none">None</option>
                <option value="manual">Creator subtitles</option>
                <option value="auto">Auto-generated subtitles</option>
                <option value="both">Creator + auto-generated</option>
              </select>
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Subtitle langs override:</div>
              <input
                type="text"
                value={ytdlpSubtitleLangs}
                placeholder="Use global languages"
                onChange={e => setYtdlpSubtitleLangs(e.target.value)}
                style={{ width: 300 }}
              />
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Embed subtitles override:</div>
              <select
                value={ytdlpEmbedSubtitles}
                onChange={e => setYtdlpEmbedSubtitles(e.target.value)}
                style={{ width: 190 }}>
                <option value="">Use global embed</option>
                <option value="true">Embed</option>
                <option value="false">Do not embed</option>
              </select>
            </div>
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Extra args override:</div>
              <input
                type="text"
                value={ytdlpExtraArgs}
                placeholder="Use global extra args"
                onChange={e => setYtdlpExtraArgs(e.target.value)}
                style={{ width: 300 }}
              />
            </div>
          {/* Todo: allow overriding the feed url with a different url (eg rss-bridge) which can allow getting more than 15 items.
          HOWEVER, this might require custom parsing to get details like thumbnail (and I tested a rss-bridge URL for a playlist
          of 114 items - some rss-bridge instances timed out and some capped the return at 99 items).
          Looks like more can be provided via https://www.scriptbarrel.com/xml.cgi?channel_id=UCshoKvlZGZ20rVgazZp5vnQ&name=%40captainsparklez
          (both channel_id & name are required, I think)*/}
          </div>
        </div>
      </div>
      <div className='small-padding-mobile' style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 30, minHeight: 0 }}>
        {/* Todo: it would be nice if the list of recent uploads was updated dynamically when the server does its polling check */}
        {/* Todo: show a "sort by" selector (because "PL" playlists might not be in any specific order) */}
        <div className='playlistDetails-recentUploads'>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
              paddingRight: '5px',
            }}
          >
            {videos.map(video => (
              <div
                key={video.id}
                style={{
                  display: 'flex',
                  height: '90px',
                  backgroundColor: 'var(--card-bg)',
                  borderRadius: '6px',
                  overflow: 'hidden',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
                }}
              >
                <a
                  href={`https://www.youtube.com/watch?v=${video.video_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ flexShrink: 0 }}
                >
                  <Thumbnail src={video.thumbnail} placeholder='https://placehold.co/160x90?text=No+Thumbnail'/>
                </a>
                <div style={{ display: 'flex', flexDirection: 'column', padding: '10px', flex: 1, minWidth: 0 }}>
                  <div style={{ 
                    fontSize: '1em',
                    fontWeight: 'bold',
                    color: testingRegex ? new RegExp(regex, 'i').test(video.title) ? 'var(--success-color)' : 'var(--danger-color)' : 'inherit',
                    // The below styles limit the title to two lines on small screens & truncate the title with an ellipsis (...)
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}>
                    {video.title}
                  </div>
                  <div style={{flex: 1}}/>
                  <div style={{ fontSize: '0.75em', color: '#aaa', marginTop: '4px' }}>
                    {new Date(video.published_at).toLocaleString()}
                  </div>
                </div>
                <button
                  className='hover-blue'
                  title="Download Video"
                  disabled={downloadingVideoIds.has(video.video_id)}
                  onClick={() => handleManualDownload(video)}
                  style={{ width: 46, flexShrink: 0, borderRadius: 0 }}>
                  <i className={`bi bi-${downloadingVideoIds.has(video.video_id) ? 'hourglass-split' : 'download'}`}/>
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlaylistDetailsPage;
