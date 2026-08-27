"""Gera os ícones placeholder da extensão (16/48/128px).
Um olho estilizado simples em SVG-like via PIL — o usuário pode substituir
por uma identidade visual definitiva quando quiser."""
from PIL import Image, ImageDraw
import os

OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
os.makedirs(OUT_DIR, exist_ok=True)

BG = (37, 99, 235, 255)      # azul
IRIS = (17, 24, 39, 255)     # quase-preto
WHITE = (255, 255, 255, 255)


def make_icon(size):
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    pad = size * 0.06
    d.ellipse([pad, pad, size - pad, size - pad], fill=BG)

    eye_w = size * 0.62
    eye_h = size * 0.34
    cx, cy = size / 2, size / 2
    d.ellipse(
        [cx - eye_w / 2, cy - eye_h / 2, cx + eye_w / 2, cy + eye_h / 2],
        fill=WHITE,
    )

    iris_r = size * 0.14
    d.ellipse([cx - iris_r, cy - iris_r, cx + iris_r, cy + iris_r], fill=IRIS)

    highlight_r = size * 0.035
    hx, hy = cx - iris_r * 0.35, cy - iris_r * 0.35
    d.ellipse(
        [hx - highlight_r, hy - highlight_r, hx + highlight_r, hy + highlight_r],
        fill=WHITE,
    )

    return img


for size in (16, 48, 128):
    make_icon(size).save(os.path.join(OUT_DIR, f"icon{size}.png"))

print("Ícones gerados em", OUT_DIR)
