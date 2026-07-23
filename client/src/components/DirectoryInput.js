import { useCallback, useEffect, useState } from "react";
import DialogBase from "./DialogBase";
import { showToast } from "../utils/utils";

function DirectoryInput({ value, onChange, placeholder, style }) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentPath, setCurrentPath] = useState(value || '/downloads');
  const [browserData, setBrowserData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  const loadDirectory = useCallback(async (path) => {
    setIsLoading(true);

    try {
      const res = await fetch(`/api/filesystem/directories?path=${encodeURIComponent(path)}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Unable to read directory');
      }

      setBrowserData(data);
      setCurrentPath(data.path);
    }
    catch (err) {
      console.error(err);
      showToast(`Directory browser error: ${err.message}`, 'error');
    }
    finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadDirectory(value || '/downloads');
    }
  }, [isOpen, loadDirectory, value]);

  const selectCurrent = () => {
    onChange(currentPath);
    setIsOpen(false);
  };

  return (
    <>
      <div style={{display: 'flex', width: '100%'}}>
        <input
          type="text"
          value={value}
          placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          style={{...style, marginTop: 0}}
        />
        <button
          title="Browse directories"
          onClick={() => setIsOpen(true)}
          style={{backgroundColor: '#393f45', marginLeft: 8, borderRadius: 4, width: 42, flexShrink: 0}}>
          <i className="bi bi-folder2-open" style={{fontSize: 'large'}}/>
        </button>
      </div>
      <DialogBase
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title="Choose Directory"
        buttons={
          <>
            <button onClick={() => setIsOpen(false)} style={{backgroundColor: '#393f45', fontSize: 'medium', padding: '6px 16px', borderRadius: 4, marginLeft: 'auto'}}>Cancel</button>
            <button onClick={selectCurrent} style={{backgroundColor: 'var(--success-color)', fontSize: 'medium', padding: '6px 16px', borderRadius: 4, marginLeft: 10}}>Select</button>
          </>
        }>
        <div style={{display: 'flex', flexDirection: 'column', gap: 12}}>
          <div style={{display: 'flex', gap: 8, flexWrap: 'wrap'}}>
            {browserData?.roots?.map(root =>
              <button
                key={root.path}
                onClick={() => loadDirectory(root.path)}
                style={{backgroundColor: '#393f45', fontSize: 'small', padding: '6px 10px', borderRadius: 4}}>
                {root.name}
              </button>
            )}
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <input
              type="text"
              value={currentPath}
              onChange={e => setCurrentPath(e.target.value)}
              onKeyDown={e => e.key === 'Enter' ? loadDirectory(currentPath) : null}
              style={{fontFamily: 'monospace'}}
            />
            <button
              onClick={() => loadDirectory(currentPath)}
              style={{backgroundColor: 'cornflowerblue', fontSize: 'medium', padding: '6px 12px', borderRadius: 4}}>
              Go
            </button>
          </div>
          <div style={{display: 'flex', flexDirection: 'column', borderTop: '1px solid #555'}}>
            {browserData?.parent ?
              <button
                onClick={() => loadDirectory(browserData.parent)}
                style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 'medium', padding: 10, borderBottom: '1px solid #444'}}>
                <i className="bi bi-arrow-up"/>
                ..
              </button>
            : null}
            {isLoading ?
              <div style={{padding: 10, color: '#aaa'}}>Loading...</div>
            : browserData?.directories?.length ?
              browserData.directories.map(directory =>
                <button
                  key={directory.path}
                  onClick={() => loadDirectory(directory.path)}
                  style={{display: 'flex', alignItems: 'center', gap: 8, fontSize: 'medium', padding: 10, borderBottom: '1px solid #444', textAlign: 'left'}}>
                  <i className="bi bi-folder-fill" style={{color: 'cornflowerblue'}}/>
                  <span style={{overflowWrap: 'anywhere'}}>{directory.name}</span>
                </button>
              )
            :
              <div style={{padding: 10, color: '#aaa'}}>No child directories</div>
            }
          </div>
        </div>
      </DialogBase>
    </>
  );
}

export default DirectoryInput;
