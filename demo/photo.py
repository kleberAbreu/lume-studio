"""Decode one visitor upload in memory. Output a bounded, metadata-free PNG."""
import io
import sys
import warnings
from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = 16_000_000
warnings.simplefilter("error", Image.DecompressionBombWarning)
try:
    mask = sys.argv[1] == "mask"
    with Image.open(io.BytesIO(sys.stdin.buffer.read()), formats=["PNG"] if mask else ["JPEG","PNG","WEBP"]) as src:
        if src.width * src.height > Image.MAX_IMAGE_PIXELS or getattr(src, "n_frames", 1) != 1:
            raise ValueError("dimensions")
        if mask:
            if src.size != (1024,1024) or "A" not in src.getbands():
                raise ValueError("mask")
            out = src.convert("RGBA")
        else:
            out = ImageOps.pad(ImageOps.exif_transpose(src).convert("RGB"), (1024,1024), color="#f4f0eb")
        out.info.clear()
        out.save(sys.stdout.buffer, format="PNG")
except Exception:
    sys.exit(2)
