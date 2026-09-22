import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Thumbnail from '../components/Thumbnail';
import { getErrorResponse, showToast } from '../utils/utils';
import LoadingIndicator from '../components/LoadingIndicator';

function AddPlaylistPage() {
  const navigate = useNavigate();

  const [playlistInput, setPlaylistInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [playlistInfo, setPlaylistInfo] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setPlaylistInfo(null);
  
    if (!playlistInput)
      return;
  
    setError('');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      (async () => {
        try {
          setIsSearching(true);
  
          const res = await fetch(`/api/search?q=${encodeURIComponent(playlistInput)}`, {
            signal: controller.signal,
          });
  
          if (!res.ok) {
            throw new Error(await getErrorResponse(res, true));
          }
  
          const data = await res.json();
          setPlaylistInfo(data);
        }
        catch (err) {
          if (err.name !== 'AbortError') {
            console.error(err);
            setError(err.message);
          }
        }
        finally {
          setIsSearching(false);
        }
      })();
    }, 300);
  
    return () => {
      clearTimeout(timeoutId);     // Cancel debounce
      controller.abort();          // Cancel previous fetch
    };
  }, [playlistInput]);  

  const handleSubmit = async () => {
    setError('');
    const res = await fetch('/api/playlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 'playlistId': playlistInfo.playlist_id, 'feedUrl': playlistInfo.feed_url })
    });

    if (res.ok) {
      showToast('Playlist added!', 'success');
      setPlaylistInput('');

      const data = await res.json();
      navigate(`/playlist/${data.id}`); //Navigate to new playlist page (NOTE: this is a little different than Sonarr - Sonarr doesn't go anywhere after adding a show)
    }
    else {
      const addError = await getErrorResponse(res);
      showToast(`Error adding playlist: ${addError}`, 'error');
    }
  };

  return (
    <div style={{ padding: '20px' }}>
      <div style={{ display: 'flex', width: '100%', alignItems: 'center', height: 46}}>
        <i className="bi bi-search" style={{fontSize: 'large', padding: '10px 15px', height: 'calc(100% - 22px)', border: 'solid 1px white', borderRight: 'none', borderRadius: '4px 0px 0px 4px'}}/>
        <input
          style={{flexGrow: 1, backgroundColor: '#333', border: 'solid 1px white', padding: '6px 16px', height: 'calc(100% - 14px)', color: 'inherit', fontSize: 'medium', outline: 'none'}}
          placeholder='Enter a youtube channel url (eg youtube.com/@MrBeast), playlist id/url (eg UU..., PL..., etc), or a custom feed url (RSS-formatted)'
          type='text'
          value={playlistInput}
          onChange={e => setPlaylistInput(e.target.value)}/>
        <button
          style={{ display: 'flex', alignItems: 'center', height: '100%', padding: '10px 15px', border: 'solid 1px white', borderLeft: 'none', borderRadius: '0px 4px 4px 0px' }}
          onClick={() => setPlaylistInput('')}>
          <i className="bi bi-x-lg" style={{fontSize: 'large'}}/>
        </button>
      </div>
      {playlistInfo ?
      <div className='flex-column-mobile' 
        style={{display: 'flex', marginTop: 20, padding: 20, gap: 20, backgroundImage: playlistInfo.banner ? `url(${playlistInfo.banner})` : '',
                backgroundColor: playlistInfo.banner ? 'rgb(0, 0, 0, 0.7)' : '#2a2a2a', backgroundSize: 'cover', backgroundBlendMode: 'darken'}}>
        <Thumbnail height='180' width='320' src={playlistInfo.thumbnail}/>{/* Todo: we should have a note for UC & UU playlists that RSS feeds don't provide the channel thumbnail, but the user can customize the thumbnail later */}
        <div style={{display: 'flex', flexDirection: 'column', flexGrow: 1}}>
          <div style={{display: 'flex', marginBottom: 20}}>
            <div style={{fontSize: 'xx-large'}}>{playlistInfo.title}</div>
            <button
              style={{marginLeft: 'auto'}}
              onClick={() => window.open(`https://www.youtube.com/playlist?list=${playlistInfo.playlist_id}` /* NOTE: because we're only doing "exclude shorts" on "add", this link will still show shorts */, '_blank')}>
              <i className="bi bi-box-arrow-up-right" style={{fontSize: 'x-large'}}/>
            </button>
          </div>
          <button 
            style={{marginTop: 'auto', marginLeft: 'auto', backgroundColor: 'var(--success-color)', padding: '6px 16px', borderRadius: 4, fontSize: 'medium'}}
            onClick={() => handleSubmit()}>
            Add
          </button>
          {/* Todo: maybe in the future clicking on this 'card' pops up a dialog where you can customize check_interval_minutes and stuff when adding */}
        </div>
      </div>
      : null}
      {isSearching ?
      <div style={{display: 'flex', justifyContent: 'center'}}>
        <LoadingIndicator/>
      </div>
      : null}
      {error ?
      <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 20}}>
        <div style={{ fontSize: 'x-large', textAlign: 'center' }}>
          {error}
        </div>
        <p style={{marginBottom: 0}}>Valid values are:</p>
        <ol>
          <li style={{overflowWrap: 'anywhere'}}>
            YouTube channel urls (eg youtube.com/@MrBeast or<br />https://www.youtube.com/channel/UCY1kMZp36IQSyNx_9h4mpCg)
          </li>
          <li style={{overflowWrap: 'anywhere'}}>
            YouTube playlist urls or ids (eg UUuAXFkgsw1L7xaCfnd5JJOw or<br />https://www.youtube.com/playlist?list=PLopY4n17t8RCqmupsW66yOsR5eDPRUN_y)
          </li>
          <li style={{overflowWrap: 'anywhere'}}>
            Custom feed urls that use the same format as YouTube's RSS feeds<br />(eg https://www.youtube.com/feeds/videos.xml?playlist_id=... but from a different source)
          </li>
        </ol>
      </div>
      : null}
      {/(PL|LL|FL)[\w-]{10,}/.test(playlistInput) && !playlistInfo?.feed_url && <p style={{ color: 'var(--warning-color)', overflowWrap: 'anywhere', textAlign: 'center' }}>
        Warning: YouTube playlist RSS feeds only return the top 15 items, so if this playlist is not ordered Newest → Oldest,
        Subarr may never see new videos on this playlist (see <a href='https://issuetracker.google.com/issues/429563457' target='_blank' rel='noreferrer'>
        https://issuetracker.google.com/issues/429563457</a>). If this is the case, you may want to use the channel's
        uploads playlist and a regex filter.
      </p>}
    </div>
  );
}

export default AddPlaylistPage;