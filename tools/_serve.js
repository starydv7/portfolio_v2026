// TEMP dev server: serves the workspace + accepts POST /save to write portrait.png
const http = require('http'), fs = require('fs'), path = require('path');
const PHOTO = process.argv[2];
http.createServer((q, s) => {
  if (q.method === 'POST' && q.url === '/save') {
    let b = ''; q.on('data', c => b += c); q.on('end', () => {
      const m = /^data:image\/png;base64,(.+)$/.exec(b);
      if (!m) { s.writeHead(400); s.end('bad'); return; }
      fs.writeFileSync(path.join(process.cwd(), 'portrait.png'), Buffer.from(m[1], 'base64'));
      s.writeHead(200); s.end('ok');
    }); return;
  }
  const u = decodeURIComponent(q.url.split('?')[0]);
  const fp = u === '/photo.jpg' ? PHOTO : path.join(process.cwd(), u === '/' ? 'index.html' : u);
  fs.readFile(fp, (e, d) => {
    if (e) { s.writeHead(404); s.end(); return; }
    const m = { '.html': 'text/html', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.js': 'text/javascript' }[path.extname(fp)] || 'application/octet-stream';
    s.writeHead(200, { 'content-type': m, 'cache-control': 'no-store' }); s.end(d);
  });
}).listen(8766, () => console.log('listening 8766'));
