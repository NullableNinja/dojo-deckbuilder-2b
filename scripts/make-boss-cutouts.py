"""Cut each Boss Profile's illustration out of its printed card so the mat can show the Boss as a standee,
like the fighter cutouts in app/assets/fighters/. The illustration panel sits on a flat cream ground, so a
flood fill from the panel's edges removes the ground; the printed seal is masked first.

    python3 scripts/make-boss-cutouts.py            # writes app/assets/fighters/<boss-name-slug>.webp

Presentation only: the printed cards, card IDs and rules are untouched. Re-run after replacing a Boss card
image; swap in hand-drawn cutouts of the same file name at any time and they win automatically."""
import glob, re, sys
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "app/assets/cards/bosses"
OUT = ROOT / "app/assets/fighters"
PANEL = (72, 194, 486, 464)      # illustration panel inside the 550x750 card (inside its outline)
SEAL = (447, 440, 40)            # "BOSS MODULE" seal: centre x, centre y, radius
TOL = 34                         # colour distance treated as "ground"
FEATHER = 22                     # extra distance over which the edge fades out

def slug(name: str) -> str:
    return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", name.lower()))

def components(mask: np.ndarray):
    """4-connected components of a boolean mask: (label image, {label: size})."""
    h, w = mask.shape
    label = np.zeros((h, w), np.int32)
    sizes = {}
    current = 0
    for sy in range(h):
        for sx in range(w):
            if mask[sy, sx] and not label[sy, sx]:
                current += 1
                label[sy, sx] = current
                queue, count = deque([(sy, sx)]), 0
                while queue:
                    y, x = queue.popleft(); count += 1
                    for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
                        if 0 <= ny < h and 0 <= nx < w and mask[ny, nx] and not label[ny, nx]:
                            label[ny, nx] = current; queue.append((ny, nx))
                sizes[current] = count
    return label, sizes

def keep_main_parts(alpha: np.ndarray) -> np.ndarray:
    """Drop specks and card-edge slivers: keep the biggest solid shape and any part at least 3% of its size."""
    solid = alpha > 0.1
    label, sizes = components(solid)
    if not sizes: return alpha
    biggest = max(sizes.values())
    keep = np.zeros_like(solid)
    for name, size in sizes.items():
        if size >= biggest * 0.03: keep |= label == name
    return np.where(keep, alpha, 0.0)

def cutout(path: Path) -> Image.Image:
    card = Image.open(path).convert("RGB")
    panel = np.array(card.crop(PANEL)).astype(np.int16)
    h, w, _ = panel.shape
    ground = np.median(np.concatenate([panel[:4].reshape(-1, 3), panel[-4:].reshape(-1, 3), panel[:, :4].reshape(-1, 3), panel[:, -4:].reshape(-1, 3)]), axis=0)
    yy, xx = np.mgrid[0:h, 0:w]
    cx, cy, r = SEAL[0] - PANEL[0], SEAL[1] - PANEL[1], SEAL[2]
    panel[(xx - cx) ** 2 + (yy - cy) ** 2 <= r * r] = ground
    dist = np.sqrt(((panel - ground) ** 2).sum(axis=2))
    ground_like = dist <= TOL
    # Some source art carries a baked-in transparency checkerboard (white and light grey squares): treat any
    # sizeable neutral-light patch as ground too. Cream ground and small white highlights are not neutral/large.
    neutral = (panel.min(axis=2) >= 185) & ((panel.max(axis=2) - panel.min(axis=2)) <= 14)
    label, sizes = components(neutral)
    checker = np.zeros_like(neutral)
    for name, size in sizes.items():
        if size >= 500: checker |= label == name
    ground_like |= checker
    reached = np.zeros((h, w), bool)
    queue = deque()
    for x in range(w):
        for y in (0, h - 1):
            if ground_like[y, x] and not reached[y, x]: reached[y, x] = True; queue.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if ground_like[y, x] and not reached[y, x]: reached[y, x] = True; queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < h and 0 <= nx < w and ground_like[ny, nx] and not reached[ny, nx]:
                reached[ny, nx] = True; queue.append((ny, nx))
    alpha = np.where(reached, 0.0, 1.0)
    # Soft edge: pixels next to the removed ground that are only a little darker than it fade out.
    near = np.zeros((h, w), bool)
    for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (-1, -1), (1, -1), (-1, 1)):
        near |= np.roll(np.roll(reached, dy, 0), dx, 1)
    soft = np.clip((dist - TOL) / FEATHER, 0, 1)
    alpha = np.where(near & ~reached, np.minimum(alpha, soft), alpha)
    if checker.any():
        # Clear the checker patches even when a paper-cut outline fences them off, plus that outline (cream-ish pixels beside them).
        near_checker = checker.copy()
        for _ in range(8):
            grown = near_checker.copy()
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                grown |= np.roll(np.roll(near_checker, dy, 0), dx, 1)
            near_checker = grown
        alpha = np.where(checker | (near_checker & (dist <= 75)), 0.0, alpha)
    alpha = keep_main_parts(alpha)
    rgba = np.dstack([panel.clip(0, 255).astype(np.uint8), (alpha * 255).astype(np.uint8)])
    image = Image.fromarray(rgba, "RGBA")
    box = image.getchannel("A").point(lambda v: 255 if v > 24 else 0).getbbox()
    return image.crop(box) if box else image

def main() -> int:
    import json
    cards = json.loads((ROOT / "app/data/cards.json").read_text())["cards"]
    names = {c["catalogId"].lower(): c["name"] for c in cards if c["catalogId"].startswith("DDB-BPR")}
    done = 0
    for file in sorted(glob.glob(str(SRC / "ddb-bpr-core-*.webp"))):
        catalog = re.match(r"(ddb-bpr-core-\d{3})_", Path(file).name).group(1)
        name = names.get(catalog)
        if not name: continue
        image = cutout(Path(file))
        scale = 760 / image.height
        image = image.resize((max(1, round(image.width * scale)), 760), Image.LANCZOS)
        target = OUT / f"{slug(name)}.webp"
        image.save(target, "WEBP", quality=88, method=6)
        print(f"{target.name}  {image.size[0]}x{image.size[1]}")
        done += 1
    print(f"{done} Boss cutouts")
    return 0 if done else 1

if __name__ == "__main__":
    sys.exit(main())
