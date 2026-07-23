import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistance } from "date-fns";
import LoadingIndicator from "../components/LoadingIndicator";

function statusColor(status) {
  if (status === 'completed') return 'var(--success-color)';
  if (status === 'failed') return 'var(--danger-color)';
  return 'cornflowerblue';
}

function DownloadsPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [downloads, setDownloads] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    refreshDownloads(page);
  }, [page]);

  const refreshDownloads = page => {
    setIsLoading(true);
    setDownloads([]);

    fetch(`/api/downloads/${page}`)
      .then(res => res.json())
      .then(data => {
        setDownloads(data.downloads || []);
        setPage(data.page);
        setTotalPages(data.totalPages);
      })
      .catch(err => {
        console.error('Error loading downloads', err);
      })
      .finally(() => setIsLoading(false));
  };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', padding: '0px 20px', gap: 10, backgroundColor: '#262626', height: 60 }}>
        <button
          className='hover-blue'
          onClick={() => refreshDownloads(page)}
          title="Refresh Downloads">
          <i className="bi bi-arrow-clockwise"/>
          <div style={{fontSize: 'small'}}>Refresh</div>
        </button>
      </div>
      <div style={{padding: 20, overflowX: 'auto'}}>
        <table style={{width: '100%', borderCollapse: 'collapse'}}>
          <thead>
            <tr>
              <th>Status</th>
              <th>Playlist</th>
              <th>Title</th>
              <th>Path</th>
              <th>Type</th>
              <th>Started</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {downloads.map(download =>
              <tr key={download.id} title={download.error || ''}>
                <td className="fixed" style={{color: statusColor(download.status)}}>
                  <i className={`bi bi-${download.status === 'completed' ? 'check-circle-fill' : download.status === 'failed' ? 'x-circle-fill' : 'hourglass-split'}`} style={{marginRight: 6}}/>
                  {download.status}
                </td>
                <td className="fixed">
                  {download.playlist_db_id ?
                  <Link to={`/playlist/${download.playlist_db_id}`}>{download.playlist_title}</Link>
                  : <div style={{fontStyle: 'italic'}}>Playlist deleted</div>}
                </td>
                <td className="fixed">
                  <a href={`https://www.youtube.com/watch?v=${download.video_id}`} target='_blank' rel="noreferrer">{download.title}</a>
                </td>
                <td className="expand fixed" style={{fontFamily: 'monospace'}}>{download.output_path || download.error || ''}</td>
                <td className="fixed">{download.manual === 'true' ? 'Manual' : 'Automatic'}</td>
                <td className="fixed">{formatDistance(new Date(download.started_at), new Date(), { addSuffix: true })}</td>
                <td className="fixed">{download.finished_at ? formatDistance(new Date(download.finished_at), new Date(), { addSuffix: true }) : ''}</td>
              </tr>
            )}
          </tbody>
        </table>
        {isLoading ?
          <div style={{display: 'flex', justifyContent: 'center'}}>
            <LoadingIndicator/>
          </div>
        : null}
      </div>
      <div style={{display: 'flex', justifyContent: 'center'}}>
        <button style={{fontSize: '1rem'}} disabled={page === 1} onClick={() => setPage(1)}>
          <i className="bi bi-skip-start-fill"></i>
        </button>
        <button style={{fontSize: '1rem'}} disabled={page === 1} onClick={() => setPage(page - 1)}>
          <i className="bi bi-rewind-fill"></i>
        </button>
        <div style={{margin: '0px 10px'}}>{page} / {totalPages}</div>
        <button style={{fontSize: '1rem'}} disabled={page === totalPages} onClick={() => setPage(page + 1)}>
          <i className="bi bi-fast-forward-fill"></i>
        </button>
        <button style={{fontSize: '1rem'}} disabled={page === totalPages} onClick={() => setPage(totalPages)}>
          <i className="bi bi-skip-end-fill"></i>
        </button>
      </div>
    </div>
  );
}

export default DownloadsPage;
