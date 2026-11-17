#!/usr/bin/env python3
"""
Generates high-resolution RGBA PNG PWA icons (192x192, 512x512, maskable 512x512, 180x180)
using pure Python stdlib (zlib/struct) so no external imaging library is required.
"""
import os
import struct
import zlib


def write_png(path: str, width: int, height: int, rgba_bytes: bytearray) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    raw = bytearray()
    stride = width * 4
    for y in range(height):
        raw.append(0)  # filter type 0
        start = y * stride
        raw.extend(rgba_bytes[start : start + stride])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack("!I", len(data))
            + tag
            + data
            + struct.pack("!I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack("!IIBBBBB", width, height, 8, 6, 0, 0, 0)
    idat = zlib.compress(bytes(raw), level=6)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n")
        f.write(chunk(b"IHDR", ihdr))
        f.write(chunk(b"IDAT", idat))
        f.write(chunk(b"IEND", b""))


def rounded_rect_contains(x: float, y: float, rx: float, ry: float, rw: float, rh: float, rad: float) -> bool:
    if x < rx or x > rx + rw or y < ry or y > ry + rh:
        return False
    cx = min(max(x, rx + rad), rx + rw - rad)
    cy = min(max(y, ry + rad), ry + rh - rad)
    dx = x - cx
    dy = y - cy
    return (dx * dx + dy * dy) <= (rad * rad)


def render_icon(size: int, maskable: bool) -> bytearray:
    buf = bytearray(size * size * 4)
    # Scale artwork down when maskable to preserve 15% safe zone on all sides
    scale = 0.72 if maskable else 0.90
    offset = (1.0 - scale) / 2.0

    bg = (12, 14, 18, 255)          # #0C0E12
    border = (30, 35, 45, 255)      # #1E232D
    orange = (234, 88, 12, 255)     # #EA580C
    light_orange = (249, 115, 22, 255)  # #F97316
    white = (255, 255, 255, 255)

    for py in range(size):
        ny_raw = (py + 0.5) / size
        ny = (ny_raw - offset) / scale
        for px in range(size):
            nx_raw = (px + 0.5) / size
            nx = (nx_raw - offset) / scale

            color = bg
            if not maskable:
                # Outer subtle bezel highlight inside 0..1
                if rounded_rect_contains(nx_raw, ny_raw, 0.06, 0.06, 0.88, 0.88, 0.16) and not rounded_rect_contains(nx_raw, ny_raw, 0.08, 0.08, 0.84, 0.84, 0.14):
                    color = border
            else:
                if rounded_rect_contains(nx, ny, 0.04, 0.04, 0.92, 0.92, 0.16) and not rounded_rect_contains(nx, ny, 0.06, 0.06, 0.88, 0.88, 0.14):
                    color = border

            # Dumbbell / H monogram
            if rounded_rect_contains(nx, ny, 0.25, 0.23, 0.12, 0.54, 0.03):
                color = orange
            elif rounded_rect_contains(nx, ny, 0.63, 0.23, 0.12, 0.54, 0.03):
                color = orange
            elif rounded_rect_contains(nx, ny, 0.34, 0.44, 0.32, 0.12, 0.025):
                color = white
            elif rounded_rect_contains(nx, ny, 0.17, 0.36, 0.06, 0.28, 0.02):
                color = light_orange
            elif rounded_rect_contains(nx, ny, 0.77, 0.36, 0.06, 0.28, 0.02):
                color = light_orange

            idx = (py * size + px) * 4
            buf[idx] = color[0]
            buf[idx + 1] = color[1]
            buf[idx + 2] = color[2]
            buf[idx + 3] = color[3]
    return buf


if __name__ == "__main__":
    targets = [
        ("public/pwa-192x192.png", 192, False),
        ("public/pwa-512x512.png", 512, False),
        ("public/pwa-maskable-512x512.png", 512, True),
        ("public/apple-touch-icon.png", 180, False),
        ("assets/icons/pwa-192x192.png", 192, False),
        ("assets/icons/pwa-512x512.png", 512, False),
        ("assets/icons/pwa-maskable-512x512.png", 512, True),
        ("assets/icons/apple-touch-icon.png", 180, False),
    ]
    for out_path, dim, is_maskable in targets:
        pixels = render_icon(dim, is_maskable)
        write_png(out_path, dim, dim, pixels)
    print(f"Generated {len(targets)} PWA PNG icons.")
