import csv
import io
import json
import os
import urllib.request

ELECTION_URL = (
    "https://" + "raw.githubusercontent." + "com"
    + "/tonmcg/US_County_Level_Election_Results_08-20/master/2020_US_County_Level_Presidential_Results.csv"
)

GEO_URL = (
    "https://" + "raw.githubusercontent." + "com"
    + "/plotly/datasets/master/geojson-counties-fips.json"
)

def fetch_text(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=45) as resp:
        return resp.read().decode("utf-8")

def project_albers_approx(lon, lat):
    # Clean equirectangular/conic-style projection scaled to 1000x600 canvas
    import math
    if lon < -130:  # Alaska inset
        x = (lon + 170) * 3.2 + 40
        y = (72 - lat) * 5.0 + 430
        return round(x, 1), round(y, 1)
    if lon < -150 or lat < 24:  # Hawaii inset
        x = (lon + 161) * 14.0 + 230
        y = (23 - lat) * 14.0 + 490
        return round(x, 1), round(y, 1)
    phi = math.radians(lat)
    lam = math.radians(lon + 96.0)
    x = 500 + lam * math.cos(math.radians(38.0)) * 780
    y = 300 - (phi - math.radians(38.0)) * 780
    return round(x, 1), round(y, 1)

def geom_to_svg_path(geom):
    gtype = geom.get("type")
    coords = geom.get("coordinates", [])
    polys = [coords] if gtype == "Polygon" else (coords if gtype == "MultiPolygon" else [])
    parts = []
    for poly in polys:
        for ring in poly:
            pts = []
            last_pt = None
            for pt in ring:
                px, py = project_albers_approx(pt[0], pt[1])
                if (px, py) != last_pt:
                    pts.append(f"{px},{py}")
                    last_pt = (px, py)
            if len(pts) >= 3:
                parts.append("M" + "L".join(pts) + "Z")
    return "".join(parts)

print("Downloading 2020 county election data...")
elec_csv = fetch_text(ELECTION_URL)
reader = csv.DictReader(io.StringIO(elec_csv))

elec_map = {}
for row in reader:
    fips = row.get("county_fips", "").zfill(5)
    name = row.get("county_name", "").strip()
    if not fips or len(fips) != 5 or fips.endswith("000"):
        continue
    dem_votes = float(row.get("votes_dem", 0) or 0)
    rep_votes = float(row.get("votes_gop", 0) or 0)
    total = dem_votes + rep_votes
    if total <= 0:
        continue
    elec_map[fips] = (name, round((dem_votes / total) * 100, 2), max(1, round(total / 1000)))

print("Downloading county boundary shapes...")
geo = json.loads(fetch_text(GEO_URL))

counties = {}
for feat in geo.get("features", []):
    fips = str(feat.get("id", "")).zfill(5)
    if fips not in elec_map:
        continue
    svg_d = geom_to_svg_path(feat.get("geometry", {}))
    if not svg_d:
        continue
    name, dem_pct, weight = elec_map[fips]
    counties[fips] = [name, dem_pct, weight, svg_d]

out_path = "out/html/counties.json" if os.path.isdir("out/html") else "counties.json"
with open(out_path, "w", encoding="utf-8") as f:
    json.dump(counties, f, separators=(",", ":"))

print(f"Saved {len(counties)} counties with SVG paths to {out_path}!")
