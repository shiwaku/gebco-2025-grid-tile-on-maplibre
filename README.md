# 目的

* [GEBCO \ 2025 Grid（sub‑ice topo/bathy）GeoTIFF](https://www.gebco.net/data-products/gridded-bathymetry-data) を **Terrain‑RGB** 形式に変換し、**ズーム0–9**のラスタータイルを作成する。
* GEBCO 2025 sub-ice topo/bathy GeoTIFFは、15秒間隔のグリッド（約500mメッシュ）の標高データである。
* 作成したタイルを **MapLibre GL JS** から表示し、必要に応じて **等深線（maplibre‑contour）** を重ねる。

# 前提

* OS: Windows（PowerShell）/ WSL
* ツール類
  * GDAL（`gdalbuildvrt`、`gdalwarp`、`gdal_edit.py`、`gdal2tiles.py`）
  * Python 3 + `rio-rgbify`（`pip install rio-rgbify`）
  * 
* データ: GEBCO \ 2025 Grid（sub‑ice topo/bathy）GeoTIFF

# 手順

## 1. ファイル一覧の作成

複数のタイル化前 GeoTIFF を VRT に束ねるため、ファイル一覧を作成。

**Windows (cmd)**

```cmd
cd src
(dir /b gebco_2025_sub_ice_*.tif) > list.txt
```

## 2. VRT を作成

```bash
gdalbuildvrt work/gebco_2025_sub_ice.vrt \
  -input_file_list src/list.txt \
  -resolution highest \
  -r bilinear
```

## 3. Web メルカトル（EPSG:3857）へ再投影した GeoTIFF を作成

> 可視範囲は Web メルカトルの緯度限界（±85.051129°）に切り出し

```bash
gdalwarp work/gebco_2025_sub_ice.vrt work/gebco_2025_sub_ice_3857.tif \
  -s_srs EPSG:4326 -t_srs EPSG:3857 \
  -te_srs EPSG:4326 -te -180 -85.051129 180 85.051129 \
  -r bilinear -multi -wo NUM_THREADS=ALL_CPUS \
  -dstnodata -9999 -ot Float32 \
  -co TILED=YES -co COMPRESS=DEFLATE -co PREDICTOR=3 -co ZLEVEL=9 -co BIGTIFF=YES
```

## 4. NoData を解除（`rio rgbify` が失敗するのを防止）
* Terrain‑RGBは、NoDataに対応していない...？
```bash
gdal_edit.py -unsetnodata work/gebco_2025_sub_ice_3857.tif
```

## 5. Terrain‑RGB GeoTIFF へ符号化

> `-b` はオフセット、`-i` はスケール（ここでは 0.1m 単位）

```bash
rio rgbify -b -10000 -i 0.1 \
  work/gebco_2025_sub_ice_3857.tif work/gebco_2025_sub_ice_3857_terrainrgb.tif \
  --co BIGTIFF=YES --co TILED=YES --co COMPRESS=DEFLATE --co PREDICTOR=2 --co ZLEVEL=9
```

## 6. ラスタータイルを生成（Z0–Z9）

```bash
mkdir -p tiles/gebco_2025_grid_tile_terrain-rgb

gdal2tiles.py work/gebco_2025_sub_ice_3857_terrainrgb.tif tiles/gebco_2025_grid_tile_terrain-rgb \
  -z 0-9 --resampling=near --xyz --processes=6
```

## 7. タイル公開

* タイルURL: `https://shiworks2.xsrv.jp/raster-tiles/gebco/gebco_2025 grid_tile_terrain-rgb/{z}/{x}/{y}.png`
* ズーム: 0〜9 / タイルサイズ: 256px

# MapLibre GL JS での表示

* demo : https://shiwaku.github.io/gebco-2025-grid-tile-on-maplibre/#7.39/33.938/139.348/0/45
* GitHubレポジトリ : https://github.com/shiwaku/gebco-2025-grid-tile-on-maplibre
* 島名と海底地形名は、海上保安庁 海しるAPIからGeoJSONを作成して表示
<img width="750" alt="image.png (1.0 MB)" src="https://img.esa.io/uploads/production/attachments/17590/2025/08/26/164814/15d24a7f-145e-4cd6-be7b-f4ba4f67c711.png">
<img width="750" alt="image.png (3.0 MB)" src="https://img.esa.io/uploads/production/attachments/17590/2025/08/26/164814/2f54f6df-29fc-4964-a746-11a0bad18179.png">

## 1) Terrain‑RGB を DEM として登録

```js
  // 標高タイルソース
  map.addSource("dem-tiles", {
    type: "raster-dem",
    tiles: [
      "https://shi-works.com/raster-tiles/gebco/gebco_2025_grid_tile_terrain-rgb/{z}/{x}/{y}.png",
    ],
    attribution:
      '<a href="https://www.gebco.net/data-products/gridded-bathymetry-data">GEBCO 2025 Grid (sub-ice topo/bathy)を加工して作成</a>',
    encoding: "mapbox",
  });

  // 標高タイルセット
  map.setTerrain({ source: "dem-tiles", exaggeration: 1 });
```

## 2) 陰影段彩図を重ねる
```js
  // 段彩図レイヤー（深海強調）
  map.addLayer({
    id: "dem-relief",
    type: "color-relief",
    source: "dem-tiles",
    paint: {
      // 深海の見えを広げるために指数補間（0.8）を使用
      "color-relief-color": [
        "interpolate",
        ["exponential", 0.8],
        ["elevation"],

        // ---- 海（単位: m, 負値が深い） ----
        -11000,
        "rgb(5,5,40)", // 最深部：ほぼ黒に近い藍
        -10000,
        "rgb(8,8,55)",
        -9000,
        "rgb(10,12,70)",
        -8000,
        "rgb(12,18,90)",
        -7000,
        "rgb(15,25,110)",
        -6000,
        "rgb(18,35,130)",
        -5000,
        "rgb(20,48,150)",
        -4000,
        "rgb(15,65,165)",
        -3000,
        "rgb(10,82,178)",
        -2000,
        "rgb(0,100,190)", // -2000m を基準に色変化が分かる
        -1000,
        "rgb(0,125,205)",
        -500,
        "rgb(0,150,215)",
        -200,
        "rgb(0,175,220)",
        -50,
        "rgb(30,200,225)",
        -10,
        "rgb(80,220,230)",
        0,
        "rgb(120,240,235)", // 海岸付近は明るい青緑で縁どり

        // ---- 陸（落ち着きめのナチュラル）----
        10,
        "rgb(140,200,120)",
        100,
        "rgb(170,200,100)",
        200,
        "rgb(200,200,90)",
        500,
        "rgb(210,185,80)",
        1000,
        "rgb(205,165,70)",
        2000,
        "rgb(190,145,65)",
        3000,
        "rgb(170,125,60)",
        4000,
        "rgb(155,110,55)",
      ],
      // 色を主役に：やや高めの不透明度
      "color-relief-opacity": 0.85,
    },
  });

  // 陰影起伏図レイヤー（彩色と調和させる）
  map.addLayer({
    id: "hillshade",
    type: "hillshade",
    source: "dem-tiles",
    minzoom: 0,
    maxzoom: 9,
    layout: { visibility: "visible" },
    paint: {
      "hillshade-exaggeration": 0.6,
      "hillshade-shadow-color": "rgba(0,0,0,0.22)", // やや控えめ
      "hillshade-highlight-color": "rgba(255,255,255,0.14)",
      "hillshade-accent-color": "rgba(0,0,0,0.10)", // リッジを軽く強調
      "hillshade-illumination-direction": 315,
    },
  });
  ```

## 3) 等深線を重ねる（実験的）

`maplibre-contour` を利用して DEM からオンザフライで等深線を生成します。

```html
<script src="https://unpkg.com/maplibre-contour@0.1.0/dist/index.min.js"></script>
```

```js
  // 標高タイルソース
  const demSource = new mlcontour.DemSource({
    url: "https://shi-works.com/raster-tiles/gebco/gebco_2025_grid_tile_terrain-rgb/{z}/{x}/{y}.png",
    encoding: "mapbox",
    minzoom: 0,
    maxzoom: 9,
    worker: true, // WebWorkerで計算
    cacheSize: 100, // 直近タイルのキャッシュ数
    timeoutMs: 10_000, // フェッチのタイムアウト
  });
  demSource.setupMaplibre(maplibregl);

  // 等深線ソース
  map.addSource("contour-source", {
    type: "vector",
    tiles: [
      demSource.contourProtocolUrl({
        multiplier: 1,
        thresholds: {
          // zoom: [minor, major]
          4: [500, 5000],
          5: [200, 2000],
          6: [200, 1000],
          7: [100, 500],
          8: [100, 200],
          9: [50, 200],
          // 10: [50, 100],
          // 11: [10, 100],
          // 12: [10, 100],
          // 13: [10, 100],
          // 14: [10, 100],
        },
        // optional override
        contourLayer: "contours",
        elevationKey: "ele",
        levelKey: "level",
        extent: 4096,
        buffer: 9,
      }),
    ],
    minzoom: 4,
    maxzoom: 9,
  });

  // 等深線レイヤー
  map.addLayer({
    id: "contour-lines",
    type: "line",
    source: "contour-source",
    "source-layer": "contours",
    paint: {
      "line-color": "rgba(0,0,0, 50%)",
      "line-width": ["match", ["get", "level"], 1, 1.2, 0.5],
    },
  });

  // 等深線ラベル
  map.addLayer({
    id: "contour-labels",
    type: "symbol",
    source: "contour-source",
    "source-layer": "contours",
    filter: [">", ["get", "level"], 0],
    layout: {
      "symbol-placement": "line",
      "text-size": 13,
      "text-field": ["concat", ["number-format", ["get", "ele"], {}], "m"],
      "text-font": ["Noto Sans CJK JP Bold"],
    },
    paint: {
      "text-halo-color": "white",
      "text-halo-width": 1,
    },
  });
```
