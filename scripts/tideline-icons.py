"""Generate the original launcher artwork (optional, requires Pillow)."""
from pathlib import Path
from PIL import Image, ImageDraw

out = Path(__file__).resolve().parents[1] / "client/public/tideline"
for name, side in [("icon-192", 192), ("icon-512", 512), ("icon-maskable", 512)]:
    n = 1024
    image = Image.new("RGB", (n,n), "#12373c")
    draw = ImageDraw.Draw(image)
    for r in (330, 414, 505, 590, 680):
        draw.arc((512-r,512-r,512+r,512+r), 35, 355, fill="#275155", width=6)
    draw.ellipse((313,313,711,711), outline="#9bb8a5", width=7)
    for x,y in [(371,383),(653,383),(379,650),(645,650)]:
        draw.line((512,520,x,y), fill="#ede8c9", width=31)
        draw.ellipse((x-58,y-58,x+58,y+58), fill="#193f42", outline="#e8e6c9", width=17)
    draw.polygon([(512,312),(574,500),(554,602),(512,656),(470,602),(450,500)], fill="#ffd08a")
    draw.polygon([(512,357),(530,493),(494,493)], fill="#285253")
    image.resize((side,side),Image.Resampling.LANCZOS).save(out/(name+".png"),optimize=True)
