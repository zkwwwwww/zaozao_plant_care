"""Generate original vector-style assets for 植早早 without third-party artwork."""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
ICONS = ROOT / "icons"
ILLUSTRATIONS = ROOT / "illustrations"
ICONS.mkdir(parents=True, exist_ok=True)
ILLUSTRATIONS.mkdir(parents=True, exist_ok=True)

NORMAL = "#829087"
ACTIVE = "#2e7d5b"
LEAF = "#79b86a"
WARM = "#eadbc4"
DANGER = "#b85d50"


def svg(name, body, size=81):
    (ROOT / "source" / f"{name}.svg").write_text(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" '
        f'viewBox="0 0 {size} {size}" fill="none">{body}</svg>\n',
        encoding="utf-8",
    )


def tab_png(name, color, draw_icon):
    image = Image.new("RGBA", (81, 81), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw_icon(draw, color, 5)
    image.save(ICONS / f"{name}.png", optimize=True)


def home(draw, color, width):
    draw.line([(18, 39), (40, 20), (63, 39)], fill=color, width=width, joint="curve")
    draw.rounded_rectangle((24, 37, 57, 64), radius=5, outline=color, width=width)
    draw.line([(40, 64), (40, 48)], fill=color, width=width)


def environment(draw, color, width):
    draw.ellipse((47, 14, 65, 32), outline=color, width=width)
    for a, b in [((56, 8), (56, 3)), ((69, 23), (76, 23)), ((66, 13), (71, 8))]:
        draw.line([a, b], fill=color, width=width)
    draw.arc((14, 23, 51, 63), 190, 340, fill=color, width=width)
    draw.arc((25, 30, 65, 69), 110, 255, fill=color, width=width)
    draw.line([(23, 58), (52, 35)], fill=color, width=width)


def reminder(draw, color, width):
    draw.arc((23, 16, 58, 57), 195, 345, fill=color, width=width)
    draw.line([(23, 38), (20, 57), (61, 57), (58, 38)], fill=color, width=width)
    draw.arc((35, 55, 47, 68), 0, 180, fill=color, width=width)
    draw.ellipse((37, 10, 44, 17), fill=color)


def account(draw, color, width):
    draw.ellipse((28, 12, 53, 37), outline=color, width=width)
    draw.arc((16, 36, 65, 86), 200, 340, fill=color, width=width)


TAB_SPECS = {
    "tab-home": (home, '<path d="M18 39 40 20l23 19M24 37v27h33V37M40 64V48" '
                 'stroke="{c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    "tab-environment": (environment, '<circle cx="56" cy="23" r="9" stroke="{c}" stroke-width="5"/>'
                        '<path d="M56 8V3M69 23h7M66 13l5-5M23 58c9-23 29-27 42-23-3 20-18 31-42 23Z" '
                        'stroke="{c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>'),
    "tab-reminder": (reminder, '<path d="M23 38c0-13 7-22 17-22s18 9 18 22l3 19H20l3-19Z'
                     'M35 58c1 7 10 7 12 0M40 10v6" stroke="{c}" stroke-width="5" '
                     'stroke-linecap="round" stroke-linejoin="round"/>'),
    "tab-account": (account, '<circle cx="40" cy="24" r="12" stroke="{c}" stroke-width="5"/>'
                    '<path d="M18 64c6-16 14-22 22-22s16 6 22 22" stroke="{c}" stroke-width="5" '
                    'stroke-linecap="round"/>'),
}

for base, (drawer, source) in TAB_SPECS.items():
    for suffix, color in (("", NORMAL), ("-active", ACTIVE)):
        name = base + suffix
        svg(name, source.format(c=color))
        tab_png(name, color, drawer)


def plant_art(path, accent=LEAF, kind="plant", size=320):
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    scale = size / 320
    def box(values):
        return tuple(int(v * scale) for v in values)
    draw.ellipse(box((53, 235, 267, 273)), fill=(46, 125, 91, 20))
    draw.rounded_rectangle(box((102, 183, 218, 255)), radius=int(22 * scale), fill=WARM)
    draw.line([box((160, 190))[:2], box((160, 102))[:2]], fill=ACTIVE, width=max(5, int(9 * scale)))
    draw.ellipse(box((78, 82, 164, 150)), fill=accent)
    draw.ellipse(box((156, 105, 242, 171)), fill="#9acb72")
    if kind == "records":
        draw.rounded_rectangle(box((218, 55, 278, 130)), radius=int(10 * scale), fill="#fffaf1", outline=ACTIVE, width=max(3, int(5 * scale)))
        for y in (76, 93, 110):
            draw.line([box((231, y))[:2], box((264, y))[:2]], fill=NORMAL, width=max(2, int(3 * scale)))
    elif kind == "reminders":
        draw.arc(box((213, 52, 279, 127)), 195, 345, fill=ACTIVE, width=max(3, int(6 * scale)))
        draw.line([box((216, 91))[:2], box((211, 119))[:2], box((282, 119))[:2], box((277, 91))[:2]], fill=ACTIVE, width=max(3, int(6 * scale)))
    elif kind == "environment":
        draw.ellipse(box((224, 51, 273, 100)), fill="#efbf4d")
        for x, y in ((248, 36), (286, 76), (274, 45)):
            draw.line([box((x, y))[:2], box((x + 1, y - 14))[:2]], fill="#efbf4d", width=max(3, int(5 * scale)))
    image.save(path, optimize=True)


plant_art(ILLUSTRATIONS / "empty-plants.png")
plant_art(ILLUSTRATIONS / "empty-records.png", kind="records")
plant_art(ILLUSTRATIONS / "empty-reminders.png", kind="reminders")
plant_art(ILLUSTRATIONS / "empty-environments.png", kind="environment")
plant_art(ILLUSTRATIONS / "plant-placeholder.png", size=240)

def illustration_svg(name, accessory=""):
    svg(
        name,
        f'<ellipse cx="160" cy="254" rx="107" ry="19" fill="{ACTIVE}" opacity=".12"/>'
        f'<rect x="102" y="183" width="116" height="72" rx="22" fill="{WARM}"/>'
        f'<path d="M160 190V102" stroke="{ACTIVE}" stroke-width="9" stroke-linecap="round"/>'
        f'<ellipse cx="121" cy="116" rx="43" ry="34" fill="{LEAF}"/>'
        '<ellipse cx="199" cy="138" rx="43" ry="33" fill="#9acb72"/>'
        + accessory,
        320,
    )


illustration_svg("empty-plants")
illustration_svg(
    "empty-records",
    f'<rect x="218" y="55" width="60" height="75" rx="10" fill="#fffaf1" stroke="{ACTIVE}" stroke-width="5"/>'
    f'<path d="M231 77h33M231 94h33M231 111h33" stroke="{NORMAL}" stroke-width="3"/>',
)
illustration_svg(
    "empty-reminders",
    f'<path d="M216 91c0-22 12-36 31-36s30 14 30 36l5 28h-71l5-28Z" '
    f'stroke="{ACTIVE}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>',
)
illustration_svg(
    "empty-environments",
    '<circle cx="248" cy="76" r="25" fill="#efbf4d"/>'
    '<path d="M248 36v-14M286 76h14M274 45l10-10" stroke="#efbf4d" stroke-width="6" stroke-linecap="round"/>',
)

svg(
    "plant-placeholder",
    f'<ellipse cx="120" cy="204" rx="80" ry="14" fill="{ACTIVE}" opacity=".1"/>'
    f'<rect x="76" y="137" width="88" height="76" rx="18" fill="{WARM}"/>'
    f'<path d="M120 145V70" stroke="{ACTIVE}" stroke-width="8" stroke-linecap="round"/>'
    f'<ellipse cx="88" cy="70" rx="38" ry="28" fill="{LEAF}"/>'
    '<ellipse cx="151" cy="91" rx="38" ry="29" fill="#9acb72"/>',
    240,
)

print("Generated original assets.")
