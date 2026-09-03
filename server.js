/**
 * AirLink — Local-network file & text sharing tool
 * Single-file Node.js + Express application.
 *
 * Run:
 *   npm install express multer
 *   node server.js
 *
 * Then open http://<your-local-ip>:3000 on any device on the same Wi-Fi.
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;
const HOST = '0.0.0.0';

// ---------------------------------------------------------------------------
// Setup: uploads directory
// ---------------------------------------------------------------------------
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ---------------------------------------------------------------------------
// In-memory shared clipboard
// ---------------------------------------------------------------------------
let sharedText = '';

// ---------------------------------------------------------------------------
// Multer configuration — timestamp-prefixed filenames to prevent collisions
// ---------------------------------------------------------------------------
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, UPLOAD_DIR);
  },
  filename: function (req, file, cb) {
    // Sanitize original filename (strip path separators) and prefix with timestamp
    const safeOriginal = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9.\-_ ]/g, '_');
    const prefixed = `${Date.now()}-${safeOriginal}`;
    cb(null, prefixed);
  },
});

const upload = multer({ storage: storage });

// ---------------------------------------------------------------------------
// Helper: strip the "<timestamp>-" prefix to recover the display name
// ---------------------------------------------------------------------------
function toDisplayName(storedFilename) {
  const match = storedFilename.match(/^\d+-(.+)$/);
  return match ? match[1] : storedFilename;
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ---------------------------------------------------------------------------
// API: Shared clipboard
// ---------------------------------------------------------------------------
app.get('/api/text', (req, res) => {
  res.json({ text: sharedText });
});

app.post('/api/text', (req, res) => {
  const { text } = req.body;
  sharedText = typeof text === 'string' ? text : '';
  res.json({ success: true, text: sharedText });
});

// ---------------------------------------------------------------------------
// API: File upload
// ---------------------------------------------------------------------------
app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file received.' });
  }
  res.json({
    success: true,
    file: {
      storedName: req.file.filename,
      displayName: toDisplayName(req.file.filename),
      size: req.file.size,
    },
  });
});

// ---------------------------------------------------------------------------
// API: List uploaded files
// ---------------------------------------------------------------------------
app.get('/api/files', (req, res) => {
  fs.readdir(UPLOAD_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Unable to read uploads directory.' });
    }

    const fileList = files
      .map((filename) => {
        const fullPath = path.join(UPLOAD_DIR, filename);
        let stats;
        try {
          stats = fs.statSync(fullPath);
        } catch (e) {
          return null;
        }
        if (!stats.isFile()) return null;
        return {
          storedName: filename,
          displayName: toDisplayName(filename),
          size: stats.size,
          uploadedAt: stats.mtimeMs,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.uploadedAt - a.uploadedAt);

    res.json({ files: fileList });
  });
});

// ---------------------------------------------------------------------------
// Download: serve a specific uploaded file
// ---------------------------------------------------------------------------
app.get('/download/:filename', (req, res) => {
  const filename = req.params.filename;
  // Prevent directory traversal
  const safeName = path.basename(filename);
  const filePath = path.join(UPLOAD_DIR, safeName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found.');
  }

  res.download(filePath, toDisplayName(safeName));
});

// ---------------------------------------------------------------------------
// Frontend: single-page embedded HTML/CSS/JS
// ---------------------------------------------------------------------------
app.get('/', (req, res) => {
  res.type('html').send(HTML_PAGE);
});

const HTML_PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1" />
<title>AirLink — Local Sync</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #090e17;
    --bg-secondary: #0d1420;
    --card-bg: rgba(19, 27, 42, 0.55);
    --card-border: rgba(148, 163, 184, 0.12);
    --blue: #0284c7;
    --blue-light: #38bdf8;
    --green: #10b981;
    --green-light: #34d399;
    --text-primary: #e8eef7;
    --text-secondary: #94a3b8;
    --text-dim: #5c6b84;
    --radius: 18px;
    --shadow-glow: 0 0 40px rgba(56, 189, 248, 0.08);
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    height: 100%;
  }

  body {
    font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background:
      radial-gradient(circle at 15% 0%, rgba(2, 132, 199, 0.16), transparent 45%),
      radial-gradient(circle at 85% 15%, rgba(16, 185, 129, 0.10), transparent 40%),
      radial-gradient(circle at 50% 100%, rgba(56, 189, 248, 0.06), transparent 50%),
      var(--bg);
    color: var(--text-primary);
    min-height: 100vh;
    padding: 24px 16px 60px;
    -webkit-font-smoothing: antialiased;
  }

  .container {
    max-width: 720px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Header */
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 6px 8px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .brand-mark {
    width: 42px;
    height: 42px;
    border-radius: 12px;
    background: linear-gradient(135deg, var(--blue), var(--green));
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 18px;
    color: #04101c;
    box-shadow: 0 0 24px rgba(56, 189, 248, 0.35);
  }

  .brand-text h1 {
    font-size: 20px;
    font-weight: 800;
    letter-spacing: -0.02em;
    background: linear-gradient(90deg, var(--text-primary), var(--blue-light));
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  .brand-text p {
    font-size: 12.5px;
    color: var(--text-dim);
    font-weight: 500;
    letter-spacing: 0.02em;
  }

  .status-badge {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.08);
    border: 1px solid rgba(16, 185, 129, 0.25);
    font-size: 12.5px;
    font-weight: 600;
    color: var(--green-light);
    white-space: nowrap;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--green-light);
    box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.7);
    animation: pulse 1.8s infinite;
  }

  @keyframes pulse {
    0%   { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0.55); }
    70%  { box-shadow: 0 0 0 9px rgba(52, 211, 153, 0); }
    100% { box-shadow: 0 0 0 0 rgba(52, 211, 153, 0); }
  }

  /* Card */
  .card {
    background: var(--card-bg);
    border: 1px solid var(--card-border);
    border-radius: var(--radius);
    padding: 22px;
    backdrop-filter: blur(18px);
    -webkit-backdrop-filter: blur(18px);
    box-shadow: var(--shadow-glow), 0 8px 30px rgba(0,0,0,0.25);
  }

  .card-title {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 14px;
    color: var(--text-primary);
  }

  .card-title .icon-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--blue-light);
    box-shadow: 0 0 10px var(--blue-light);
  }

  /* Clipboard */
  textarea#clipboard {
    width: 100%;
    min-height: 120px;
    resize: vertical;
    background: rgba(5, 10, 18, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 12px;
    padding: 14px;
    color: var(--text-primary);
    font-family: 'Plus Jakarta Sans', monospace;
    font-size: 14.5px;
    line-height: 1.5;
    outline: none;
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  textarea#clipboard:focus {
    border-color: rgba(56, 189, 248, 0.5);
    box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.12);
  }

  .btn-row {
    display: flex;
    gap: 10px;
    margin-top: 14px;
    flex-wrap: wrap;
  }

  button {
    font-family: inherit;
    cursor: pointer;
    border: none;
    outline: none;
    font-weight: 600;
    font-size: 13.5px;
    border-radius: 10px;
    padding: 11px 18px;
    transition: transform 0.12s ease, box-shadow 0.2s ease, opacity 0.2s ease;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  button:active { transform: scale(0.97); }

  .btn-primary {
    background: linear-gradient(135deg, var(--blue), var(--blue-light));
    color: #04121e;
    box-shadow: 0 4px 18px rgba(2, 132, 199, 0.35);
  }

  .btn-secondary {
    background: rgba(148, 163, 184, 0.08);
    color: var(--text-primary);
    border: 1px solid rgba(148, 163, 184, 0.18);
  }

  .btn-secondary:hover {
    background: rgba(148, 163, 184, 0.14);
  }

  .toast-inline {
    font-size: 12px;
    color: var(--green-light);
    font-weight: 600;
    opacity: 0;
    transition: opacity 0.3s ease;
    align-self: center;
  }

  .toast-inline.show { opacity: 1; }

  /* Dropzone */
  .dropzone {
    border: 2px dashed rgba(56, 189, 248, 0.28);
    border-radius: 14px;
    padding: 34px 16px;
    text-align: center;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
    background: rgba(56, 189, 248, 0.03);
  }

  .dropzone.dragover {
    border-color: var(--green-light);
    background: rgba(16, 185, 129, 0.08);
  }

  .dropzone .dz-icon {
    font-size: 30px;
    margin-bottom: 10px;
    filter: drop-shadow(0 0 10px rgba(56, 189, 248, 0.5));
  }

  .dropzone .dz-title {
    font-size: 14.5px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .dropzone .dz-sub {
    font-size: 12.5px;
    color: var(--text-dim);
  }

  #fileInput { display: none; }

  .upload-progress {
    margin-top: 12px;
    height: 6px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.12);
    overflow: hidden;
    display: none;
  }

  .upload-progress.active { display: block; }

  .upload-progress-bar {
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, var(--blue), var(--green-light));
    transition: width 0.15s ease;
  }

  /* File list */
  .file-list {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 4px;
  }

  .file-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    background: rgba(148, 163, 184, 0.05);
    border: 1px solid rgba(148, 163, 184, 0.1);
    border-radius: 12px;
    transition: background 0.2s ease;
  }

  .file-item:hover {
    background: rgba(148, 163, 184, 0.09);
  }

  .file-meta {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }

  .file-icon {
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    border-radius: 10px;
    background: linear-gradient(135deg, rgba(2,132,199,0.25), rgba(16,185,129,0.25));
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 16px;
  }

  .file-info {
    min-width: 0;
  }

  .file-name {
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 220px;
  }

  .file-size {
    font-size: 11.5px;
    color: var(--text-dim);
  }

  .pill-download {
    flex-shrink: 0;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 8px 14px;
    border-radius: 999px;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(52, 211, 153, 0.3);
    color: var(--green-light);
    font-size: 12.5px;
    font-weight: 700;
    transition: background 0.2s ease, transform 0.12s ease;
  }

  .pill-download:hover {
    background: rgba(16, 185, 129, 0.2);
  }

  .pill-download:active {
    transform: scale(0.96);
  }

  .empty-state {
    text-align: center;
    padding: 24px 10px;
    color: var(--text-dim);
    font-size: 13px;
  }

  footer {
    text-align: center;
    color: var(--text-dim);
    font-size: 11.5px;
    padding-top: 8px;
    letter-spacing: 0.02em;
  }

  @media (max-width: 480px) {
    .file-name { max-width: 140px; }
    header { flex-direction: column; align-items: flex-start; }
    .card { padding: 18px; }
  }
</style>
</head>
<body>

<div class="container">

  <header>
    <div class="brand">
      <div class="brand-mark">AL</div>
      <div class="brand-text">
        <h1>AirLink</h1>
        <p>Cross-device LAN bridge</p>
      </div>
    </div>
    <div class="status-badge">
      <span class="status-dot"></span>
      Local Sync Active
    </div>
  </header>

  <section class="card">
    <div class="card-title"><span class="icon-dot"></span> Shared Clipboard</div>
    <textarea id="clipboard" placeholder="Type or paste text to sync across devices..."></textarea>
    <div class="btn-row">
      <button class="btn-primary" id="pushBtn">⇪ Push to Devices</button>
      <button class="btn-secondary" id="copyBtn">⧉ Copy Text</button>
      <span class="toast-inline" id="toast">Synced ✓</span>
    </div>
  </section>

  <section class="card">
    <div class="card-title"><span class="icon-dot"></span> File Transfer</div>
    <div class="dropzone" id="dropzone">
      <div class="dz-icon">⇧</div>
      <div class="dz-title">Drop files here or tap to browse</div>
      <div class="dz-sub">Videos, audio, images, GIFs & documents supported</div>
      <input type="file" id="fileInput" />
    </div>
    <div class="upload-progress" id="uploadProgress">
      <div class="upload-progress-bar" id="uploadProgressBar"></div>
    </div>
  </section>

  <section class="card">
    <div class="card-title"><span class="icon-dot"></span> Available Downloads</div>
    <div class="file-list" id="fileList">
      <div class="empty-state">No files yet — upload something above.</div>
    </div>
  </section>

  <footer>AirLink · connected over local Wi-Fi network</footer>

</div>

<script>
  const clipboardEl = document.getElementById('clipboard');
  const pushBtn = document.getElementById('pushBtn');
  const copyBtn = document.getElementById('copyBtn');
  const toastEl = document.getElementById('toast');
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');
  const uploadProgress = document.getElementById('uploadProgress');
  const uploadProgressBar = document.getElementById('uploadProgressBar');
  const fileListEl = document.getElementById('fileList');

  let isTyping = false;
  let typingTimeout = null;

  function showToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    setTimeout(() => toastEl.classList.remove('show'), 1600);
  }

  // ---- Clipboard sync ----
  async function fetchClipboard() {
    if (isTyping) return; // don't override while user is actively typing
    try {
      const res = await fetch('/api/text');
      const data = await res.json();
      if (document.activeElement !== clipboardEl && typeof data.text === 'string') {
        clipboardEl.value = data.text;
      }
    } catch (err) {
      console.error('Failed to fetch clipboard', err);
    }
  }

  async function pushClipboard() {
    try {
      await fetch('/api/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: clipboardEl.value }),
      });
      showToast('Synced ✓');
    } catch (err) {
      console.error('Failed to push clipboard', err);
      showToast('Sync failed');
    }
  }

  clipboardEl.addEventListener('input', () => {
    isTyping = true;
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => { isTyping = false; }, 2000);
  });

  pushBtn.addEventListener('click', pushClipboard);

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(clipboardEl.value);
      showToast('Copied ✓');
    } catch (err) {
      showToast('Copy failed');
    }
  });

  fetchClipboard();
  setInterval(fetchClipboard, 3500);

  // ---- File upload ----
  function openFileBrowser() { fileInput.click(); }

  dropzone.addEventListener('click', openFileBrowser);

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length) {
      uploadFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files.length) {
      uploadFile(fileInput.files[0]);
      fileInput.value = '';
    }
  });

  function uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);

    uploadProgress.classList.add('active');
    uploadProgressBar.style.width = '0%';

    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/upload');

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        uploadProgressBar.style.width = pct + '%';
      }
    });

    xhr.onload = () => {
      uploadProgress.classList.remove('active');
      uploadProgressBar.style.width = '0%';
      if (xhr.status >= 200 && xhr.status < 300) {
        showToast('Uploaded ✓');
        loadFiles();
      } else {
        showToast('Upload failed');
      }
    };

    xhr.onerror = () => {
      uploadProgress.classList.remove('active');
      showToast('Upload failed');
    };

    xhr.send(formData);
  }

  // ---- File list ----
  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function iconForFile(name) {
    const ext = name.split('.').pop().toLowerCase();
    if (['mp4', 'mov', 'webm', 'avi'].includes(ext)) return '🎬';
    if (['mp3', 'wav', 'ogg', 'm4a'].includes(ext)) return '🎵';
    if (['gif'].includes(ext)) return '🖼';
    if (['png', 'jpg', 'jpeg', 'webp', 'svg'].includes(ext)) return '🖼';
    if (['pdf'].includes(ext)) return '📄';
    if (['txt', 'md', 'doc', 'docx'].includes(ext)) return '📝';
    return '📦';
  }

  async function loadFiles() {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      renderFiles(data.files || []);
    } catch (err) {
      console.error('Failed to load files', err);
    }
  }

  function renderFiles(files) {
    if (!files.length) {
      fileListEl.innerHTML = '<div class="empty-state">No files yet — upload something above.</div>';
      return;
    }

    fileListEl.innerHTML = files.map((f) => \`
      <div class="file-item">
        <div class="file-meta">
          <div class="file-icon">\${iconForFile(f.displayName)}</div>
          <div class="file-info">
            <div class="file-name" title="\${f.displayName}">\${f.displayName}</div>
            <div class="file-size">\${formatSize(f.size)}</div>
          </div>
        </div>
        <a class="pill-download" href="/download/\${encodeURIComponent(f.storedName)}" download>⇩ Save</a>
      </div>
    \`).join('');
  }

  loadFiles();
  setInterval(loadFiles, 5000);
</script>

</body>
</html>`;

// ---------------------------------------------------------------------------
// Start server
// ---------------------------------------------------------------------------
app.listen(PORT, HOST, () => {
  console.log(`AirLink is running at http://${HOST}:${PORT}`);
  console.log('On this machine: http://localhost:' + PORT);
  console.log("From your phone, use your computer's local IP address instead of localhost.");
});
