// Protocolの設定
let protocol = new pmtiles.Protocol();
maplibregl.addProtocol("pmtiles", (request) => {
  return new Promise((resolve, reject) => {
    const callback = (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve({ data });
      }
    };
    protocol.tile(request, callback);
  });
});

// マップの初期化
const map = new maplibregl.Map({
  container: "map",
  style: "https://tile.openstreetmap.jp/styles/maptiler-basic-ja/style.json",
  // style: './basic.json',
  center: [138.884, 34.74],
  zoom: 6.82,
  minZoom: 0,
  maxZoom: 12,
  pitch: 0,
  maxPitch: 85,
  bearing: 0,
  hash: true,
  attributionControl: false,
});

// ズーム・回転
map.addControl(new maplibregl.NavigationControl());

// フルスクリーン
map.addControl(new maplibregl.FullscreenControl());

// 現在位置表示
map.addControl(
  new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: false },
    fitBoundsOptions: { maxZoom: 18 },
    trackUserLocation: true,
    showUserLocation: true,
  })
);

// スケール表示
map.addControl(
  new maplibregl.ScaleControl({
    maxWidth: 200,
    unit: "metric",
  })
);

// Attributionを折りたたみ表示
map.addControl(
  new maplibregl.AttributionControl({
    compact: true,
    customAttribution:
      '<a href="https://twitter.com/shi__works" target="_blank">X(旧Twitter)</a> | <a href="https://github.com/shiwaku/gebco-2025-grid-tile-map-on-maplibre">GitHub</a>',
  })
);

// 3D地形コントロール
map.addControl(
  new maplibregl.TerrainControl({
    source: "dem-tiles",
    exaggeration: 1, // 標高を強調する倍率
  })
);

map.on("load", () => {
  // 投影法にGlobeを指定
  map.setProjection({ type: "globe" });

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

  // 島ポイントソース
  map.addSource("islands", {
    type: "geojson",
    data: "https://shiwaku.github.io/msil-api-geojson-get/geojson/islands.geojson",
    attribution:
      '<a href="https://portal.msil.go.jp/">海上保安庁 海しるAPI</a>',
  });

  // 海底地形名ポイントソース
  map.addSource("undersea", {
    type: "geojson",
    data: "https://shiwaku.github.io/msil-api-geojson-get/geojson/undersea_features.geojson",
    attribution:
      '<a href="https://portal.msil.go.jp/">海上保安庁 海しるAPI</a>',
  });

  // 島ポイントレイヤー
  map.addLayer({
    id: "islands-point",
    type: "circle",
    source: "islands",
    paint: {
      "circle-radius": 4,
      "circle-color": "#1e90ff",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  });

  // 島名ラベルレイヤー
  map.addLayer({
    id: "islands-label",
    type: "symbol",
    source: "islands",
    layout: {
      "text-field": ["get", "島名"],
      "text-font": ["Noto Sans CJK JP Bold"],
      "text-size": 13,
      "text-offset": [0, 0.8],
      "text-anchor": "top",
      "text-allow-overlap": false, // 重なり抑制（必要に応じてtrue）
      "symbol-z-order": "auto",
    },
    paint: {
      "text-color": "#0b2239",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2,
    },
  });

  // 海底地形ポイントレイヤー
  map.addLayer({
    id: "undersea-point",
    type: "circle",
    source: "undersea",
    paint: {
      "circle-radius": 4,
      "circle-color": "#c0392b",
      "circle-stroke-color": "#ffffff",
      "circle-stroke-width": 1,
    },
  });

  // 海底地形名ラベルレイヤー
  map.addLayer({
    id: "undersea-label",
    type: "symbol",
    source: "undersea",
    layout: {
      "text-field": ["get", "海底地形名"],
      "text-font": ["Noto Sans CJK JP Bold"],
      "text-size": 13,
      "text-offset": [0, 0.8],
      "text-anchor": "top",
      "text-allow-overlap": false,
      "symbol-z-order": "auto",
    },
    paint: {
      "text-color": "#1a1a1a",
      "text-halo-color": "#ffffff",
      "text-halo-width": 1.2,
    },
  });

  // ズームに応じてラベル表示を調整
  map.setLayerZoomRange("islands-label", 4, 15);
  map.setLayerZoomRange("undersea-label", 4, 15);
  map.setLayerZoomRange("islands-point", 4, 15);
  map.setLayerZoomRange("undersea-point", 4, 15);
});

// 地図の中心座標と標高を表示
function updateCoordsDisplay() {
  const center = map.getCenter();
  const lat = center.lat.toFixed(5);
  const lng = center.lng.toFixed(5);
  const zoomLevel = Math.trunc(map.getZoom());

  const elevTile = "https://tiles.gsj.jp/tiles/elev/mixed/{z}/{y}/{x}.png"; // 統合DEM
  // const elevTile = "https://tiles.gsj.jp/tiles/elev/land/{z}/{y}/{x}.png"; // 陸域統合DEM

  if (zoomLevel > 18) {
    document.getElementById("coords").innerHTML =
      "中心座標: " +
      lat +
      ", " +
      lng +
      "<br>" +
      "ズームレベル: " +
      map.getZoom().toFixed(2) +
      "<br>" +
      "標高(ZL15以下): 取得できません<br>" +
      '<a href="https://www.google.com/maps?q=' +
      lat +
      "," +
      lng +
      '&hl=ja" target="_blank">🌎GoogleMaps</a> ' +
      '<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' +
      lat +
      "," +
      lng +
      '&hl=ja" target="_blank">📷StreetView</a>';
  } else {
    getNumericalValue(elevTile, lat, lng, zoomLevel, 0.01, 0, -(2 ** 23)).then(
      (v) => {
        document.getElementById("coords").innerHTML =
          "中心座標: " +
          lat +
          ", " +
          lng +
          "<br>" +
          "ズームレベル: " +
          map.getZoom().toFixed(2) +
          "<br>" +
          "標高(ZL15以下):" +
          (isNaN(v) ? "取得できません" : v.toFixed(2) + "m") +
          "<br>" +
          '<a href="https://www.google.com/maps?q=' +
          lat +
          "," +
          lng +
          '&hl=ja" target="_blank">🌎GoogleMaps</a> ' +
          '<a href="https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=' +
          lat +
          "," +
          lng +
          '&hl=ja" target="_blank">📷StreetView</a>';
      }
    );
  }
}

// 地図移動で更新
map.on("move", updateCoordsDisplay);

/// ****************
// latLngToTile 緯度経度→タイル座標
/// ****************
function latLngToTile(lat, lng, z) {
  const n = Math.pow(2, z);
  const x = ((lng / 180 + 1) * n) / 2;
  const latRad = (lat * Math.PI) / 180;
  const y =
    (n * (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI)) / 2;
  return { x, y };
}

/// ****************
// getNumericalValue タイルURLからピクセル値→標高へ
/// ****************
function getNumericalValue(
  url,
  lat,
  lng,
  z,
  factor = 1,
  offset = 0,
  invalid = undefined
) {
  console.log("z=" + z + " " + "lat=" + lat + " " + "lng=" + lng);
  return new Promise(function (resolve, reject) {
    const p = latLngToTile(lat, lng, z),
      x = Math.floor(p.x), // タイルX
      y = Math.floor(p.y), // タイルY
      i = (p.x - x) * 256, // タイル内i
      j = (p.y - y) * 256, // タイル内j
      img = new Image();

    console.log("タイルURL=" + url);
    console.log("タイルX座標=" + x + " " + "タイルY座標=" + y);

    img.crossOrigin = "anonymous"; // 画像からデータ抽出に必要
    img.onload = function () {
      const canvas = document.createElement("canvas"),
        context = canvas.getContext("2d");
      let r2, v, data;

      canvas.width = 1;
      canvas.height = 1;
      context.drawImage(img, i, j, 1, 1, 0, 0, 1, 1);
      data = context.getImageData(0, 0, 1, 1).data;
      r2 = data[0] < 2 ** 7 ? data[0] : data[0] - 2 ** 8;
      v = r2 * 2 ** 16 + data[1] * 2 ** 8 + data[2];
      if (data[3] !== 255 || (invalid != undefined && v == invalid)) {
        v = NaN;
      }
      resolve(v * factor + offset);
    };
    img.onerror = function () {
      reject(null);
    };
    img.src = url.replace("{z}", z).replace("{y}", y).replace("{x}", x);
  });
}
