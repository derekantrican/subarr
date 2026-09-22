import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Thumbnail from '../components/Thumbnail';
import { showToast } from '../utils/utils';

function PlaylistDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [playlist, setPlaylist] = useState(null);
  const [interval, setInterval] = useState(60);
  const [regex, setRegex] = useState('');
  const [videos, setVideos] = useState([]);
  const [testingRegex, setTestingRegex] = useState(false);

  useEffect(() => {
    fetch(`/api/playlists/${id}`)
      .then(res => res.json())
      .then(data => {
        setPlaylist(data.playlist);
        setInterval(data.playlist.check_interval_minutes || 60);
        setRegex(data.playlist.regex_filter || '');
        setVideos(data.videos || []);
      })
      .catch(err => {
        console.error('Error loading playlist', err);
      });
  }, [id]);  

  const handleSave = async () => {
    try {
      const res = await fetch(`/api/playlists/${id}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          check_interval_minutes: parseInt(interval),
          regex_filter: regex,
        }),
      });
  
      if (!res.ok)
        throw new Error('Failed to save');
      
      showToast('Settings saved!', 'success');
    }
    catch (err) {
      console.error(err);
      showToast('Error saving settings', 'error');
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
        <button className='hover-danger' onClick={handleDelete} title="Delete Playlist">
          <i className="bi bi-trash-fill"></i>
          <div style={{ fontSize: 'small' }}>Delete</div>
        </button>
      </div>
      <div style={{height: 425, width: '100%', backgroundImage: playlist.banner ? `url(https://wsrv.nl/?url=${playlist.banner})` : '', backgroundColor: 'rgb(0, 0, 0, 0.7)',
                   backgroundSize: 'cover', backgroundBlendMode: 'darken'}}>
        <div style={{height: 'calc(100% - 60px)', padding: 30, display: 'flex', gap: 40}}>
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
            {playlist.feed_url ?
            <div className='setting flex-column-mobile'>
              <div style={{minWidth: 190}}>Custom Feed URL:</div>
              <div style={{overflowWrap: 'anywhere'}}>{playlist.feed_url}</div>
            </div>
            : null}
          {/* Todo: allow editing the custom feed url (currently it can only be set when adding a playlist).
          Custom feeds are expected to use YouTube's RSS format - rss-bridge's Atom output mostly works (video ids are parsed
          from the link), but it doesn't provide yt:channelId or media:group thumbnails. */}
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
                <div style={{ display: 'flex', flexDirection: 'column', padding: '10px' }}>
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
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default PlaylistDetailsPage;