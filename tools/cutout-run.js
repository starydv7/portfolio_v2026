/**
 * Browser-side cutout (loaded by CDP). Spec recipe:
 * mask = (luminance<135) OR (r-b>26)
 * opening x2, closing x4, fill holes, largest component, erode 1px,
 * Gaussian-blur alpha ~1.3px
 */
async function cutoutPortrait(src) {
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => rej(new Error('image load failed'));
    i.src = src;
  });
  const W = img.naturalWidth, H = img.naturalHeight;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, W, H);
  const n = W * H;
  let mask = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    mask[i] = (lum < 135 || (r - b) > 26) ? 1 : 0;
  }
  const tmp = new Uint8Array(n);
  function morph(src, dst, dilate) {
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      let v = dilate ? 0 : 1;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        const s = (xx < 0 || yy < 0 || xx >= W || yy >= H) ? 0 : src[yy * W + xx];
        if (dilate) { if (s) v = 1; } else { if (!s) v = 0; }
      }
      dst[y * W + x] = v;
    }
  }
  function iters(count, dilate) {
    for (let k = 0; k < count; k++) { morph(mask, tmp, dilate); const sw = mask; mask = tmp; tmp.set ? null : 0; window.__m = mask; if (sw !== mask) { /* swap refs */ } }
    // proper swap loop without aliasing
  }
  function runIters(count, dilate) {
    for (let k = 0; k < count; k++) {
      morph(mask, tmp, dilate);
      mask.set(tmp);
    }
  }
  runIters(2, false); // opening: erode 2
  runIters(2, true);  // then dilate 2
  runIters(4, true);  // closing: dilate 4
  runIters(4, false); // then erode 4

  // fill holes: invert, flood-fill from border, leftover inverted pixels are holes
  const vis = new Uint8Array(n);
  const q = [];
  function push(i) { if (i < 0 || i >= n || vis[i] || mask[i]) return; vis[i] = 1; q.push(i); }
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  for (let qi = 0; qi < q.length; qi++) {
    const i = q[qi], x = i % W, y = (i - x) / W;
    if (x > 0) push(i - 1); if (x + 1 < W) push(i + 1);
    if (y > 0) push(i - W); if (y + 1 < H) push(i + W);
  }
  for (let i = 0; i < n; i++) if (!mask[i] && !vis[i]) mask[i] = 1;

  // largest connected component
  vis.fill(0);
  let best = 0, bestId = 0, id = 1;
  const labels = new Uint32Array(n);
  for (let s = 0; s < n; s++) {
    if (!mask[s] || vis[s]) continue;
    id++;
    let size = 0;
    q.length = 0; q.push(s); vis[s] = 1;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi]; labels[i] = id; size++;
      const x = i % W, y = (i - x) / W;
      const nbs = [i - 1, i + 1, i - W, i + W, i - W - 1, i - W + 1, i + W - 1, i + W + 1];
      for (const j of nbs) {
        if (j < 0 || j >= n) continue;
        const xx = j % W;
        if (Math.abs(xx - x) > 1) continue;
        if (!mask[j] || vis[j]) continue;
        vis[j] = 1; q.push(j);
      }
    }
    if (size > best) { best = size; bestId = id; }
  }
  for (let i = 0; i < n; i++) mask[i] = labels[i] === bestId ? 1 : 0;

  runIters(1, false); // erode 1px

  // Kill leftover wall pixels that JPEG mixed into the silhouette edge
  for (let i = 0; i < n; i++) {
    if (!mask[i]) continue;
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    if (lum > 200 && (r - b) < 18) mask[i] = 0;
  }

  // Gaussian blur alpha, sigma 1.3
  const sigma = 1.3, radius = 4;
  const kernel = [];
  let ksum = 0;
  for (let i = -radius; i <= radius; i++) { const v = Math.exp(-(i * i) / (2 * sigma * sigma)); kernel.push(v); ksum += v; }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ksum;
  const a0 = new Float32Array(n);
  const a1 = new Float32Array(n);
  for (let i = 0; i < n; i++) a0[i] = mask[i];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -radius; k <= radius; k++) {
      const xx = Math.min(W - 1, Math.max(0, x + k));
      s += a0[y * W + xx] * kernel[k + radius];
    }
    a1[y * W + x] = s;
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let s = 0;
    for (let k = -radius; k <= radius; k++) {
      const yy = Math.min(H - 1, Math.max(0, y + k));
      s += a1[yy * W + x] * kernel[k + radius];
    }
    a0[y * W + x] = s;
  }

  const out = ctx.createImageData(W, H);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, Math.min(255, Math.round(a0[i] * 255)));
    out.data[i * 4] = data[i * 4];
    out.data[i * 4 + 1] = data[i * 4 + 1];
    out.data[i * 4 + 2] = data[i * 4 + 2];
    out.data[i * 4 + 3] = a;
  }
  ctx.putImageData(out, 0, 0);
  return { w: W, h: H, png: c.toDataURL('image/png'), covered: best / n };
}
cutoutPortrait;
