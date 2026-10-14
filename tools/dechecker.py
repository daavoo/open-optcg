"""Recover an alpha channel from art flattened onto a transparency checkerboard.

The checkerboard is a known two-grey pattern, so a composited pixel
p = f*a + b*(1 - a) can be un-mixed once b is known -- and b is just whichever
of the two greys the pixel is nearer, which no amount of grid drift can get
wrong. That gives soft edges their real partial alpha instead of a hard cut.

Brightness alone is not enough to say what is art, though, and which way it
fails depends on the checkerboard. On a dark one, a dark outline reads as
ground; on a light one, so does a white skull. Reachability settles it: only
the clear region joined to the border is really the background, and a clear
patch walled in by art is art that happens to match the ground.

    dechecker.py <flattened.jpg|png> <out.png>
"""
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

src, dst = sys.argv[1], sys.argv[2]
rgb = np.asarray(Image.open(src).convert("RGB")).astype(np.float64)
h, w, _ = rgb.shape
lum = rgb.mean(axis=2)
chroma = rgb.max(axis=2) - rgb.min(axis=2)


def period(line):
    """The checker's period along one axis, from the strongest FFT bin of a
    strip of bare background. A square wave's fundamental is two cells."""
    line = line - line.mean()
    spectrum = np.abs(np.fft.rfft(line * np.hanning(len(line))))
    return len(line) / (int(np.argmax(spectrum[3:])) + 3) / 2


def neighbourhood(a, radius):
    for dy in range(-radius, radius + 1):
        for dx in range(-radius, radius + 1):
            yield np.roll(np.roll(a, dy, 0), dx, 1)


def erode(a, radius=1):
    out = a.copy()
    for n in neighbourhood(a, radius):
        out = np.minimum(out, n)
    return out


def dilate(a, radius=1):
    out = a.copy()
    for n in neighbourhood(a, radius):
        out = np.maximum(out, n)
    return out


def blur(a, radius=1):
    total = np.zeros_like(a, dtype=np.float64)
    for n in neighbourhood(a, radius):
        total += n
    return total / (2 * radius + 1) ** 2


# --- the two greys ---------------------------------------------------------
# The grid is fitted only to learn them. It is never used to place them: this
# art was rescaled, so its cells are not a whole number of pixels, and a
# uniform grid beats against the real one and leaves stripes of checker behind.
px, py = period(lum[6]), period(lum[:, 6])
xs = np.arange(w)[None, :] / px
ys = np.arange(h)[:, None] / py
strip = lum[:40]


def phase(index, other):
    best = (0.0, -1.0)
    for shift in np.arange(0, 1, 0.02):
        parity = ((np.floor(index + shift) + np.floor(other)) % 2)[:40] > 0
        best = max(
            best,
            (shift, abs(strip[parity].mean() - strip[~parity].mean())),
            key=lambda t: t[1],
        )
    return best[0]


parity = ((np.floor(xs + phase(xs, ys)) + np.floor(ys + phase(ys, xs))) % 2).astype(bool)
greys = sorted(
    (float(np.median(strip[~parity[:40]])), float(np.median(strip[parity[:40]])))
)
print(f"cells {px:.2f} x {py:.2f} px, greys {greys[0]:.0f} / {greys[1]:.0f}")

# --- un-mix ----------------------------------------------------------------
bg = np.where(lum < sum(greys) / 2, greys[0], greys[1])
# How far the pixel is from its own grey, as a fraction of how far it could
# be. The bright branch is floored because on a near-white ground its span
# collapses and every stray unit of noise would read as opaque.
unmixed = np.maximum(
    np.maximum((bg - lum) / bg, (lum - bg) / np.maximum(255 - bg, 30.0)),
    chroma / 36.0,
)
# Solid art never quite reaches 1 (its darkest ink is not pure black), so the
# top of the range is pinned to opaque and only the transition stays soft.
alpha = np.clip((unmixed - 0.06) / 0.69, 0.0, 1.0)

# --- reachability ----------------------------------------------------------
# Clear means grey and anywhere in the checker's own range -- not near one of
# the two values. A small image's cells have blurred edges, so most of the span
# between the greys is background too, and demanding a near match leaves the
# seams behind as a grid of opaque threads.
tolerance = 12.0
looks_clear = (
    (chroma < 18) & (lum > greys[0] - tolerance) & (lum < greys[1] + tolerance)
)
labels, count = ndimage.label(looks_clear)
edge = np.unique(
    np.concatenate([labels[0], labels[-1], labels[:, 0], labels[:, -1]])
)
reached = np.isin(labels, edge[edge > 0])
print(f"{count} clear regions, {reached.mean() * 100:.0f}% of the frame reaches "
      f"the border")
alpha[reached] = 0.0
alpha[looks_clear & ~reached] = 1.0

# --- tidy ------------------------------------------------------------------
alpha[alpha < 0.10] = 0.0
# JPEG rings along every checker edge and leaves specks out in the clear.
# Anything that does not survive a wide erosion is one; dilating what does
# survive back out keeps real wisps at full width rather than shaving them.
alpha *= dilate(erode(alpha > 0.25, 2), 5)
alpha = np.clip(blur(dilate(erode(alpha))), 0.0, 1.0)

a3 = alpha[..., None]
fg = np.where(a3 > 0.03, (rgb - bg[..., None] * (1 - a3)) / np.maximum(a3, 0.03), 255.0)
out = Image.fromarray(
    np.dstack([np.clip(fg, 0, 255), alpha * 255]).astype(np.uint8), "RGBA"
)
out = out.crop(out.getchannel("A").getbbox())
out.save(dst)
print(f"{dst}: cropped {w}x{h} -> {out.width}x{out.height}, "
      f"{(np.asarray(out)[..., 3] > 127).mean() * 100:.0f}% opaque")
