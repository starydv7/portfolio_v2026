#!/usr/bin/env python3
"""
Portrait cutout for the hero (transparent WebP/PNG), per the spec recipe.

    foreground mask = (luminance < 135) OR (r - b > 26)   # light wall background
    binary opening x2, closing x4, fill holes, keep largest component,
    erode 1px, Gaussian-blur alpha ~1.3px

Usage:
    pip install pillow numpy scipy
    python tools/cutout.py photo.jpg portrait.webp
    node tools/inline-portrait.js portrait.webp   # then embed it in index.html

Aim for a source of about 575x523 or larger (higher is better). If the
background is not a light wall, use remove.bg instead and save the result as
portrait.webp / portrait.png next to index.html.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi


def cutout(src: str, dst: str) -> None:
    im = Image.open(src).convert("RGB")
    a = np.asarray(im).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b

    mask = (lum < 135) | ((r - b) > 26)

    mask = ndi.binary_opening(mask, iterations=2)
    mask = ndi.binary_closing(mask, iterations=4)
    mask = ndi.binary_fill_holes(mask)

    labels, n = ndi.label(mask)
    if n > 1:
        sizes = ndi.sum(mask, labels, range(1, n + 1))
        mask = labels == (int(np.argmax(sizes)) + 1)

    mask = ndi.binary_erosion(mask, iterations=1)
    alpha = ndi.gaussian_filter(mask.astype(np.float32), sigma=1.3)
    alpha = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)

    rgba = np.dstack([a.astype(np.uint8), alpha])
    out = Image.fromarray(rgba, "RGBA")
    if dst.lower().endswith(".webp"):
        out.save(dst, "WEBP", quality=92, method=6)
    else:
        out.save(dst, "PNG", optimize=True)
    print(f"wrote {dst} ({out.width}x{out.height})")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cutout(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else "portrait.webp")
