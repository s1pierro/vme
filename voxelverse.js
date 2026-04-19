/* =================== voxelverse =================== */
/* Générateur de monde voxel procédural — hommage Sega Master System */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const https = require("https");
const http = require("http");

/* =================== CONFIGURATION GÉOGRAPHIQUE =================== */

/* Origine du monde voxel en coordonnées géographiques */
const ORIGIN_LAT = 45.0;   // Alpes françaises
const ORIGIN_LON = 6.0;
const METERS_PER_VOXEL = 30; // Résolution SRTM ≈ 30m
const METERS_PER_DEG_LAT = 111320;

/* =================== PNG DECODER (minimal) =================== */
/* Décode les PNG standard (non entrelacés) pour les tuiles Terrarium */

function decodePNG(buffer) {
    /* Vérifier signature PNG */
    const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    for (let i = 0; i < 8; i++) {
        if (buffer[i] !== sig[i]) throw new Error("Not a PNG");
    }

    let offset = 8;
    let width = 0, height = 0, colorType = 0, bitDepth = 8;
    let idatChunks = [];

    /* Parser les chunks */
    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString("ascii", offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        /* CRC ignoré (on fait confiance aux données) */

        if (type === "IHDR") {
            width = data.readUInt32BE(0);
            height = data.readUInt32BE(4);
            bitDepth = data[8];
            colorType = data[9];
        } else if (type === "IDAT") {
            idatChunks.push(data);
        } else if (type === "IEND") {
            break;
        }

        offset += 12 + length;
    }

    /* Décompresser les IDAT */
    const compressed = Buffer.concat(idatChunks);
    const raw = zlib.inflateSync(compressed);

    /* Parser les pixels */
    const bytesPerPixel = colorType === 2 ? 3 : colorType === 6 ? 4 : 1;
    const pixels = new Uint8Array(width * height * bytesPerPixel);

    for (let y = 0; y < height; y++) {
        const rowOffset = y * (width * bytesPerPixel + 1);
        const filterType = raw[rowOffset];
        const pixelOffset = rowOffset + 1;

        for (let x = 0; x < width; x++) {
            for (let c = 0; c < bytesPerPixel; c++) {
                const idx = y * width * bytesPerPixel + x * bytesPerPixel + c;
                let val = raw[pixelOffset + x * bytesPerPixel + c];

                /* Apply filter (type 0 = None, type 1 = Sub) */
                if (filterType === 1 && x > 0) {
                    const left = pixels[(y * width + (x - 1)) * bytesPerPixel + c];
                    val = (val + left) & 0xff;
                }

                pixels[idx] = val;
            }
        }
    }

    return { width, height, pixels, bytesPerPixel };
}

/* =================== TERRARIUM TILES (altitude) =================== */

/*
 * Format Terrarium : PNG 256×256, altitude encodée en RGB
 * altitude = R × 256 + G + B / 256 − 32768
 * Source : AWS Open Data
 */

const TERRARIUM_BASE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const TERRARIUM_CACHE_DIR = path.resolve(__dirname, "home", ".ef", "voxel-cache", "raw", "terrarium");

function latLonToTile(lat, lon, zoom) {
    const latRad = lat * Math.PI / 180;
    const n = Math.pow(2, zoom);
    const x = Math.floor((lon + 180) / 360 * n);
    const y = Math.floor((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * n);
    return { x, y };
}

function _initTerrariumCache() {
    try {
        if (!fs.existsSync(TERRARIUM_CACHE_DIR)) {
            fs.mkdirSync(TERRARIUM_CACHE_DIR, { recursive: true });
        }
    } catch (e) {
        console.warn(`[voxelverse] terrarium cache dir error: ${e.message}`);
    }
}
_initTerrariumCache();

function _fetchURL(url) {
    return new Promise((resolve, reject) => {
        const proto = url.startsWith("https") ? https : http;
        proto.get(url, (res) => {
            if (res.statusCode === 301 || res.statusCode === 302) {
                return _fetchURL(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) {
                return reject(new Error(`HTTP ${res.statusCode}`));
            }
            const chunks = [];
            res.on("data", (chunk) => chunks.push(chunk));
            res.on("end", () => resolve(Buffer.concat(chunks)));
        }).on("error", reject);
    });
}

async function fetchTerrariumTile(lat, lon, zoom = 10) {
    const { x, y } = latLonToTile(lat, lon, zoom);
    const cacheFile = path.join(TERRARIUM_CACHE_DIR, `${zoom}_${x}_${y}.png`);

    /* Essayer le cache local */
    if (fs.existsSync(cacheFile)) {
        try {
            const buffer = fs.readFileSync(cacheFile);
            const decoded = decodePNG(buffer);
            return decoded;
        } catch {
            /* Fichier corrompu, re-télécharger */
            try { fs.unlinkSync(cacheFile); } catch {}
        }
    }

    /* Télécharger */
    const url = `${TERRARIUM_BASE_URL}/${zoom}/${x}/${y}.png`;
    try {
        console.log(`[voxelverse] fetching terrarium tile: ${url}`);
        const buffer = await _fetchURL(url);
        fs.writeFileSync(cacheFile, buffer);
        const decoded = decodePNG(buffer);
        return decoded;
    } catch (e) {
        console.warn(`[voxelverse] terrarium fetch failed: ${e.message}`);
        return null;
    }
}

/* Décoder l'altitude depuis un pixel RGB Terrarium */
function terrariumPixelToAltitude(r, g, b) {
    return r * 256 + g + b / 256 - 32768;
}

/* =================== OVERPASS API (types de terrain) =================== */

const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const TERRAIN_CACHE_DIR = path.resolve(__dirname, "home", ".ef", "voxel-cache", "terrain");

function _initTerrainCache() {
    try {
        if (!fs.existsSync(TERRAIN_CACHE_DIR)) {
            fs.mkdirSync(TERRAIN_CACHE_DIR, { recursive: true });
        }
    } catch (e) {}
}
_initTerrainCache();

function _bboxHash(lat, lon, radius) {
    const s = (lat - radius) + "," + (lon - radius) + "," + (lat + radius) + "," + (lon + radius);
    return Buffer.from(s).toString("base64url");
}

async function fetchOverpassBbox(lat, lon, radiusKm = 2) {
    const hash = _bboxHash(lat, lon, radiusKm);
    const cacheFile = path.join(TERRAIN_CACHE_DIR, `${hash}.json`);

    /* Cache local (valide 24h) */
    if (fs.existsSync(cacheFile)) {
        try {
            const stat = fs.statSync(cacheFile);
            const age = Date.now() - stat.mtimeMs;
            if (age < 24 * 3600 * 1000) {
                return JSON.parse(fs.readFileSync(cacheFile, "utf-8"));
            }
        } catch {}
    }

    const d = radiusKm / 111; /* km → degrés approx */
    const bbox = `${lat - d},${lon - d},${lat + d},${lon + d}`;
    const query = `[out:json];(way["natural"="water"](${bbox});way["water"](${bbox});way["landuse"="forest"](${bbox});way["natural"="wood"](${bbox});way["landuse"="residential"](${bbox});way["natural"="sand"](${bbox});way["natural"="scrub"](${bbox});way["landuse"="farmland"](${bbox});way["natural"="grassland"](${bbox}););out geom;`;

    const url = `${OVERPASS_URL}?data=${encodeURIComponent(query)}`;
    try {
        console.log(`[voxelverse] fetching overpass: bbox=${bbox}`);
        const raw = await _fetchURL(url);
        const data = JSON.parse(raw.toString("utf-8"));

        /* Parser les résultats en structures utilisables */
        const result = { water: [], forest: [], residential: [], sand: [], other: [] };
        for (const el of (data.elements || [])) {
            if (!el.tags || !el.geometry) continue;
            const type = el.tags.natural || el.tags.landuse || "";
            const points = el.geometry.map(g => [g.lat, g.lon]);

            if (type === "water" || el.tags.water) result.water.push(points);
            else if (type === "forest" || type === "wood") result.forest.push(points);
            else if (type === "residential") result.residential.push(points);
            else if (type === "sand") result.sand.push(points);
            else result.other.push({ type, points });
        }

        /* Sauvegarder */
        try {
            fs.writeFileSync(cacheFile, JSON.stringify(result));
        } catch {}

        return result;
    } catch (e) {
        console.warn(`[voxelverse] overpass fetch failed: ${e.message}`);
        return null;
    }
}

/* Vérifier si un point (lat, lon) est dans un polygone (ray casting) */
function pointInPolygon(lat, lon, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const [yi, xi] = polygon[i];
        const [yj, xj] = polygon[j];
        if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) {
            inside = !inside;
        }
    }
    return inside;
}

/* Trouver le type de terrain pour un point */
function getTerrainType(lat, lon, terrainData) {
    if (!terrainData) return "default";
    for (const poly of terrainData.water) {
        if (pointInPolygon(lat, lon, poly)) return "water";
    }
    for (const poly of terrainData.forest) {
        if (pointInPolygon(lat, lon, poly)) return "forest";
    }
    for (const poly of terrainData.residential) {
        if (pointInPolygon(lat, lon, poly)) return "residential";
    }
    for (const poly of terrainData.sand) {
        if (pointInPolygon(lat, lon, poly)) return "sand";
    }
    return "default";
}

/* =================== CONVERSION COORDONNÉES =================== */

function chunkToGeo(cx, cz) {
    /* Convertir les coordonnées chunk en lat/lon du coin NW */
    const latOffset = (cz * CHUNK_SIZE * METERS_PER_VOXEL) / METERS_PER_DEG_LAT;
    const metersPerDegLon = METERS_PER_DEG_LAT * Math.cos(ORIGIN_LAT * Math.PI / 180);
    const lonOffset = (cx * CHUNK_SIZE * METERS_PER_VOXEL) / metersPerDegLon;
    return {
        lat: ORIGIN_LAT + latOffset,
        lon: ORIGIN_LON + lonOffset
    };
}

function voxelToWorldVoxelLat(cx, cz, lx, lz) {
    /* Position lat/lon d'un voxel spécifique dans un chunk */
    const base = chunkToGeo(cx, cz);
    const latStep = METERS_PER_VOXEL / METERS_PER_DEG_LAT;
    const lonStep = METERS_PER_VOXEL / (METERS_PER_DEG_LAT * Math.cos(ORIGIN_LAT * Math.PI / 180));
    return {
        lat: base.lat + lz * latStep,
        lon: base.lon + lx * lonStep
    };
}

/* =================== Simplex Noise 3D =================== */
/* Implémentation vanilla, zéro dépendance */

class SimplexNoise3D {
    constructor(seed = Math.random()) {
        this.seed = seed;
        this.grad3 = [
            [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
            [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
            [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
        ];
        this.p = [];
        for (let i = 0; i < 256; i++) this.p[i] = i;
        /* Shuffle avec seed */
        let s = seed * 2147483647;
        if (s <= 0) s += 2147483646;
        for (let i = 255; i > 0; i--) {
            s = (s * 16807) % 2147483647;
            const j = s % (i + 1);
            [this.p[i], this.p[j]] = [this.p[j], this.p[i]];
        }
        this.perm = new Array(512);
        for (let i = 0; i < 512; i++) this.perm[i] = this.p[i & 255];
    }

    dot(g, x, y, z) {
        return g[0]*x + g[1]*y + g[2]*z;
    }

    noise3D(x, y, z) {
        const F3 = 1/3, G3 = 1/6;
        const s = (x+y+z)*F3;
        const i = Math.floor(x+s), j = Math.floor(y+s), k = Math.floor(z+s);
        const t = (i+j+k)*G3;
        const X0 = i-t, Y0 = j-t, Z0 = k-t;
        const x0 = x-X0, y0 = y-Y0, z0 = z-Z0;
        let i1,j1,k1,i2,j2,k2;
        if (x0>=y0) {
            if (y0>=z0) { i1=1;j1=0;k1=0;i2=1;j2=1;k2=0; }
            else if (x0>=z0) { i1=1;j1=0;k1=0;i2=1;j2=0;k2=1; }
            else { i1=0;j1=0;k1=1;i2=1;j2=0;k2=1; }
        } else {
            if (y0<z0) { i1=0;j1=0;k1=1;i2=0;j2=1;k2=1; }
            else if (x0<z0) { i1=0;j1=1;k1=0;i2=0;j2=1;k2=1; }
            else { i1=0;j1=1;k1=0;i2=1;j2=1;k2=0; }
        }
        const x1=x0-i1+G3, y1=y0-j1+G3, z1=z0-k1+G3;
        const x2=x0-i2+2*G3, y2=y0-j2+2*G3, z2=z0-k2+2*G3;
        const x3=x0-1+3*G3, y3=y0-1+3*G3, z3=z0-1+3*G3;
        const ii=i&255, jj=j&255, kk=k&255;
        const gi0=this.perm[ii+this.perm[jj+this.perm[kk]]]%12;
        const gi1=this.perm[ii+i1+this.perm[jj+j1+this.perm[kk+k1]]]%12;
        const gi2=this.perm[ii+i2+this.perm[jj+j2+this.perm[kk+k2]]]%12;
        const gi3=this.perm[ii+1+this.perm[jj+1+this.perm[kk+1]]]%12;
        let n0=0,n1=0,n2=0,n3=0;
        let t0=0.6-x0*x0-y0*y0-z0*z0;
        if (t0>=0) { t0*=t0; n0=t0*t0*this.dot(this.grad3[gi0],x0,y0,z0); }
        let t1=0.6-x1*x1-y1*y1-z1*z1;
        if (t1>=0) { t1*=t1; n1=t1*t1*this.dot(this.grad3[gi1],x1,y1,z1); }
        let t2=0.6-x2*x2-y2*y2-z2*z2;
        if (t2>=0) { t2*=t2; n2=t2*t2*this.dot(this.grad3[gi2],x2,y2,z2); }
        let t3=0.6-x3*x3-y3*y3-z3*z3;
        if (t3>=0) { t3*=t3; n3=t3*t3*this.dot(this.grad3[gi3],x3,y3,z3); }
        return 32*(n0+n1+n2+n3);
    }

    /* Fractional Brownian Motion pour un terrain naturel */
    fbm(x, y, z, octaves = 4, lacunarity = 2, gain = 0.5) {
        let sum = 0, amplitude = 1, frequency = 1, max = 0;
        for (let i = 0; i < octaves; i++) {
            sum += this.noise3D(x * frequency, y * frequency, z * frequency) * amplitude;
            max += amplitude;
            amplitude *= gain;
            frequency *= lacunarity;
        }
        return sum / max;
    }
}

/* =================== Voxel Types (palette SMS) =================== */

const VOXEL_TYPES = {
    AIR:       0,
    WATER:     1,
    SAND:      2,
    GRASS:     3,
    DIRT:      4,
    STONE:     5,
    SNOW:      6,
    ROCK:      7,
    CLAY:      8,
};

/* Couleurs inspirées de la palette Sega Master System (RGB 0-255) */
const VOXEL_COLORS = {
    [VOXEL_TYPES.AIR]:   null,
    [VOXEL_TYPES.WATER]: { r: 30,  g: 90,  b: 180 },
    [VOXEL_TYPES.SAND]:  { r: 220, g: 190, b: 120 },
    [VOXEL_TYPES.GRASS]: { r: 50,  g: 160, b: 50  },
    [VOXEL_TYPES.DIRT]:  { r: 140, g: 90,  b: 50  },
    [VOXEL_TYPES.STONE]: { r: 130, g: 130, b: 135 },
    [VOXEL_TYPES.SNOW]:  { r: 230, g: 235, b: 240 },
    [VOXEL_TYPES.ROCK]:  { r: 80,  g: 75,  b: 70  },
    [VOXEL_TYPES.CLAY]:  { r: 180, g: 110, b: 80  },
};

const CHUNK_SIZE = 16;
const SEA_LEVEL = 0;

/* =================== World Generator =================== */

class VoxelWorld {
    constructor(seed = null) {
        this.seed = seed !== null ? seed : Math.random() * 100000;
        this.noise = new SimplexNoise3D(this.seed);
        this.noiseDetail = new SimplexNoise3D(this.seed + 1);
        this.chunkCache = new Map();
        this.maxCacheSize = 512;

        /* Cache fichier persistant */
        this.cacheDir = path.resolve(__dirname, "home", ".ef", "voxel-cache", "chunks");
        this._initFileCache();

        console.log(`[voxelverse] world initialized with seed=${this.seed.toFixed(2)}`);
    }

    /* ---- Initialisation du cache fichier ---- */

    _initFileCache() {
        try {
            if (!fs.existsSync(this.cacheDir)) {
                fs.mkdirSync(this.cacheDir, { recursive: true });
            }
        } catch (e) {
            console.warn(`[voxelverse] cannot create cache dir: ${e.message}`);
        }
    }

    _chunkFilePath(cx, cy, cz) {
        return path.join(this.cacheDir, `${cx}_${cy}_${cz}.bin`);
    }

    _loadChunkFromFile(cx, cy, cz) {
        try {
            const filePath = this._chunkFilePath(cx, cy, cz);
            if (!fs.existsSync(filePath)) return null;

            const buffer = fs.readFileSync(filePath);
            /* Format: 4 bytes header (cx,cy,cz as int16 each) + CHUNK_SIZE³ bytes */
            if (buffer.length < CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE + 6) return null;

            const voxels = new Uint8Array(buffer.buffer, buffer.byteOffset + 6, CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
            return { cx, cy, cz, voxels: new Uint8Array(voxels), generated: fs.statSync(filePath).mtimeMs, fromFile: true };
        } catch {
            return null;
        }
    }

    _saveChunkToFile(cx, cy, cz, voxels) {
        try {
            const filePath = this._chunkFilePath(cx, cy, cz);
            if (fs.existsSync(filePath)) return; /* déjà en cache */

            const buffer = Buffer.alloc(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE + 6);
            buffer.writeInt16LE(cx, 0);
            buffer.writeInt16LE(cy, 2);
            buffer.writeInt16LE(cz, 4);
            for (let i = 0; i < voxels.length; i++) {
                buffer[i + 6] = voxels[i];
            }
            fs.writeFileSync(filePath, buffer);
        } catch (e) {
            /* Silencieux — le cache fichier est optionnel */
        }
    }

    /* ---- Génération d'un chunk ---- */

    generateChunk(cx, cy, cz) {
        /* Version synchrone — fallback SimplexNoise uniquement */
        return this._generateChunkProcedural(cx, cy, cz);
    }

    /* ---- Génération avec données réelles (async) ---- */

    async generateChunkReal(cx, cy, cz) {
        const cacheKey = `${cx},${cy},${cz}`;

        /* 1. Cache mémoire */
        if (this.chunkCache.has(cacheKey)) {
            return this.chunkCache.get(cacheKey);
        }

        /* 2. Cache fichier */
        const fileChunk = this._loadChunkFromFile(cx, cy, cz);
        if (fileChunk) {
            this._cacheChunk(cacheKey, fileChunk);
            return fileChunk;
        }

        /* 3. Essayer les données réelles */
        try {
            const realChunk = await this._generateChunkFromRealData(cx, cy, cz);
            if (realChunk) {
                this._cacheChunk(cacheKey, realChunk);
                this._saveChunkToFile(cx, cy, cz, realChunk.voxels);
                return realChunk;
            }
        } catch (e) {
            console.warn(`[voxelverse] real data generation failed: ${e.message}`);
        }

        /* 4. Fallback procédural */
        const procChunk = this._generateChunkProcedural(cx, cy, cz);
        this._cacheChunk(cacheKey, procChunk);
        this._saveChunkToFile(cx, cy, cz, procChunk.voxels);
        return procChunk;
    }

    async _generateChunkFromRealData(cx, cy, cz) {
        /* Coordonnées géographiques du chunk */
        const geo = chunkToGeo(cx, cz);
        const radiusKm = CHUNK_SIZE * METERS_PER_VOXEL / 1000;

        /* Fetch altitude + terrain en parallèle */
        const [tile, terrain] = await Promise.all([
            fetchTerrariumTile(geo.lat, geo.lon, 10),
            fetchOverpassBbox(geo.lat, geo.lon, Math.max(radiusKm * 2, 2))
        ]);

        if (!tile) return null; /* Pas de données → fallback procédural */

        const voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        const worldY = cy * CHUNK_SIZE;

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                /* Position lat/lon de ce voxel */
                const posGeo = voxelToWorldVoxelLat(cx, cz, x, z);

                /* Altitude depuis Terrarium */
                /* Mapper x,z vers les coordonnées pixel de la tuile 256×256 */
                const tileX = Math.floor((x / CHUNK_SIZE) * tile.width) % tile.width;
                const tileZ = Math.floor((z / CHUNK_SIZE) * tile.height) % tile.height;
                const pixelIdx = (tileZ * tile.width + tileX) * tile.bytesPerPixel;
                const r = tile.pixels[pixelIdx] || 0;
                const g = tile.pixels[pixelIdx + 1] || 0;
                const b = tile.pixels[pixelIdx + 2] || 0;
                const altitude = terrariumPixelToAltitude(r, g, b);

                /* Type de terrain depuis Overpass */
                const terrainType = getTerrainType(posGeo.lat, posGeo.lon, terrain);

                /* Déduire la hauteur en voxels */
                const height = Math.max(0, Math.floor(altitude / 2)); /* 1 voxel = 2m */

                for (let y = 0; y < CHUNK_SIZE; y++) {
                    const wy = worldY + y;
                    const idx = x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE;

                    if (wy < height - 4) {
                        voxels[idx] = VOXEL_TYPES.ROCK;
                    } else if (wy < height - 1) {
                        voxels[idx] = terrainType === "water" ? VOXEL_TYPES.WATER : VOXEL_TYPES.DIRT;
                    } else if (wy === height) {
                        /* Surface */
                        switch (terrainType) {
                            case "water": voxels[idx] = VOXEL_TYPES.WATER; break;
                            case "forest": voxels[idx] = VOXEL_TYPES.GRASS; break;
                            case "sand": voxels[idx] = VOXEL_TYPES.SAND; break;
                            case "residential": voxels[idx] = VOXEL_TYPES.STONE; break;
                            default:
                                if (wy < SEA_LEVEL - 2) voxels[idx] = VOXEL_TYPES.SAND;
                                else if (wy < SEA_LEVEL) voxels[idx] = VOXEL_TYPES.CLAY;
                                else if (wy > 12) voxels[idx] = VOXEL_TYPES.SNOW;
                                else voxels[idx] = VOXEL_TYPES.GRASS;
                        }
                    } else if (wy <= SEA_LEVEL) {
                        voxels[idx] = VOXEL_TYPES.WATER;
                    } else {
                        voxels[idx] = VOXEL_TYPES.AIR;
                    }
                }
            }
        }

        return { cx, cy, cz, voxels, generated: Date.now(), fromRealData: true };
    }

    _generateChunkProcedural(cx, cy, cz) {
        const cacheKey = `${cx},${cy},${cz}`;

        /* Vérifier cache */
        if (this.chunkCache.has(cacheKey)) {
            return this.chunkCache.get(cacheKey);
        }
        const fileChunk = this._loadChunkFromFile(cx, cy, cz);
        if (fileChunk) {
            this._cacheChunk(cacheKey, fileChunk);
            return fileChunk;
        }

        const voxels = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE);
        const scale = 0.02;
        const detailScale = 0.06;
        const heightScale = 20;
        const worldX = cx * CHUNK_SIZE;
        const worldY = cy * CHUNK_SIZE;
        const worldZ = cz * CHUNK_SIZE;

        for (let x = 0; x < CHUNK_SIZE; x++) {
            for (let z = 0; z < CHUNK_SIZE; z++) {
                const wx = worldX + x;
                const wz = worldZ + z;

                /* Altitude principale (FBM) */
                const elevation = this.noise.fbm(wx * scale, wz * scale, 0, 4, 2, 0.5);
                const height = Math.floor(elevation * heightScale);

                /* Humidité pour le biome */
                const moisture = this.noiseDetail.noise3D(wx * 0.01, wz * 0.01, 100) * 0.5 + 0.5;

                for (let y = 0; y < CHUNK_SIZE; y++) {
                    const wy = worldY + y;
                    const idx = x + y * CHUNK_SIZE + z * CHUNK_SIZE * CHUNK_SIZE;

                    if (wy < height - 4) {
                        voxels[idx] = VOXEL_TYPES.ROCK;
                    } else if (wy < height - 1) {
                        voxels[idx] = VOXEL_TYPES.DIRT;
                    } else if (wy === height) {
                        /* Surface — biome */
                        if (wy < SEA_LEVEL - 2) {
                            voxels[idx] = VOXEL_TYPES.SAND;
                        } else if (wy < SEA_LEVEL) {
                            voxels[idx] = moisture > 0.6 ? VOXEL_TYPES.CLAY : VOXEL_TYPES.SAND;
                        } else if (wy < SEA_LEVEL + 2) {
                            voxels[idx] = moisture > 0.5 ? VOXEL_TYPES.GRASS : VOXEL_TYPES.SAND;
                        } else if (wy > 12) {
                            voxels[idx] = VOXEL_TYPES.SNOW;
                        } else {
                            voxels[idx] = VOXEL_TYPES.GRASS;
                        }
                    } else if (wy <= SEA_LEVEL) {
                        voxels[idx] = VOXEL_TYPES.WATER;
                    } else {
                        voxels[idx] = VOXEL_TYPES.AIR;
                    }
                }
            }
        }

        const chunk = { cx, cy, cz, voxels, generated: Date.now() };
        this._cacheChunk(cacheKey, chunk);

        /* Sauvegarder dans le cache fichier */
        this._saveChunkToFile(cx, cy, cz, voxels);

        return chunk;
    }

    _cacheChunk(key, chunk) {
        if (this.chunkCache.size >= this.maxCacheSize) {
            /* Supprimer le chunk le plus ancien */
            let oldestKey = null, oldestTime = Infinity;
            for (const [k, v] of this.chunkCache) {
                if (v.generated < oldestTime) { oldestTime = v.generated; oldestKey = k; }
            }
            if (oldestKey) this.chunkCache.delete(oldestKey);
        }
        this.chunkCache.set(key, chunk);
    }

    /* ---- Récupérer un voxel dans le monde ---- */

    getVoxel(wx, wy, wz) {
        const cx = Math.floor(wx / CHUNK_SIZE);
        const cy = Math.floor(wy / CHUNK_SIZE);
        const cz = Math.floor(wz / CHUNK_SIZE);
        const chunk = this.generateChunk(cx, cy, cz);
        const lx = ((wx % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const ly = ((wy % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        const lz = ((wz % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
        return chunk.voxels[lx + ly * CHUNK_SIZE + lz * CHUNK_SIZE * CHUNK_SIZE];
    }

    /* ---- Sérialiser un chunk pour l'API ---- */

    serializeChunk(chunk) {
        return {
            cx: chunk.cx, cy: chunk.cy, cz: chunk.cz,
            size: CHUNK_SIZE,
            voxels: Array.from(chunk.voxels)
        };
    }
}

/* =================== SPRITE GENERATION (Player 2D) =================== */

/*
 * Modèle voxel du joueur : 4 directions × 4 frames d'animation.
 * Chaque frame est un tableau 3D [y][z][x] de types de voxels.
 * Dimensions : 4 (largeur) × 6 (hauteur) × 3 (profondeur)
 * Types : 0=AIR, 3=GRASS(vert), 5=STONE(gris), 8=CLAY(peau)
 */

const PLAYER_FRAME_H = 6;
const PLAYER_FRAME_W = 4;
const PLAYER_FRAME_D = 3;

/* Palette simplifiée pour les sprites */
const SPRITE_COLORS = {
    3: { r: 40,  g: 120, b: 40  },  /* Vêtement vert */
    5: { r: 60,  g: 55,  b: 50  },  /* Cheveux/chaussures */
    8: { r: 210, g: 170, b: 130 },  /* Peau */
};

/* Modèle de base : joueur debout (frame 0, direction S) */
function _createPlayerBaseFrame() {
    const frame = [];
    for (let y = 0; y < PLAYER_FRAME_H; y++) {
        frame[y] = [];
        for (let z = 0; z < PLAYER_FRAME_D; z++) {
            frame[y][z] = new Array(PLAYER_FRAME_W).fill(0);
        }
    }
    /* Pieds (y=0) */
    frame[0][0][1] = 5; frame[0][0][2] = 5;
    /* Jambes (y=1) */
    frame[1][0][1] = 3; frame[1][0][2] = 3;
    /* Corps (y=2-3) */
    for (let y = 2; y <= 3; y++) {
        for (let x = 0; x < PLAYER_FRAME_W; x++) {
            for (let z = 0; z < PLAYER_FRAME_D; z++) {
                if (x >= 1 && x <= 2 && z === 0) frame[y][z][x] = 3;
            }
        }
    }
    /* Tête (y=4-5) */
    for (let y = 4; y <= 5; y++) {
        for (let x = 0; x < PLAYER_FRAME_W; x++) {
            for (let z = 0; z < PLAYER_FRAME_D; z++) {
                if (x >= 1 && x <= 2) frame[y][z][x] = (y === 5) ? 5 : 8;
            }
        }
    }
    return frame;
}

/* Générer les 4 frames d'animation (marche) pour une direction */
function _generateWalkFrames(baseFrame, dir) {
    const frames = [];
    for (let f = 0; f < 4; f++) {
        const frame = JSON.parse(JSON.stringify(baseFrame));
        /* Animation jambes : alternance selon la frame */
        if (f === 0 || f === 2) {
            /* Jambes écartées */
            frame[1][0][1] = 3; frame[1][0][2] = 3;
        } else if (f === 1) {
            /* Jambe gauche en avant */
            frame[1][0][0] = 3; frame[1][0][1] = 0; frame[1][0][2] = 3;
        } else {
            /* Jambe droite en avant */
            frame[1][0][1] = 3; frame[1][0][2] = 0; frame[1][0][2] = 3; // keep right
            frame[1][0][1] = 3;
        }
        /* Animation bras (y=2) */
        if (f === 1) {
            frame[2][0][0] = 3; frame[2][0][3] = 0;
        } else if (f === 3) {
            frame[2][0][3] = 3; frame[2][0][0] = 0;
        }
        frames.push(frame);
    }
    return frames;
}

/* Cache des sprites générés (LRU simple) */
const _spriteCache = new Map();
const _spriteCacheMax = 200;

/* Rendu isométrique 2D d'un modèle voxel → string SVG */
function renderSpriteToSVG(model, scale = 8) {
    const voxels = model;
    const SW = 4, SH = 6, SD = 3;

    /* Projection isométrique : pour chaque voxel visible, dessiner un losange */
    const shapes = [];

    for (let y = SH - 1; y >= 0; y--) {
        for (let z = SD - 1; z >= 0; z--) {
            for (let x = 0; x < SW; x++) {
                const v = voxels[y][z][x];
                if (v === 0) continue;

                /* Vérifier si la face supérieure est visible */
                const topVisible = (y === SH - 1) || (voxels[y + 1]?.[z]?.[x] === 0);
                const frontVisible = (z === SD - 1) || (voxels[y][z + 1]?.[x] === 0);
                const rightVisible = (x === SW - 1) || (voxels[y][z][x + 1] === 0);

                if (!topVisible && !frontVisible && !rightVisible) continue;

                /* Position isométrique 2D */
                const sx = (x - z) * scale;
                const sy = (x + z) * scale * 0.5 - y * scale * 1.2;
                const c = SPRITE_COLORS[v] || { r: 255, g: 0, b: 0 };

                if (topVisible) {
                    shapes.push(`<polygon points="${sx},${sy - scale * 0.6} ${sx + scale},${sy} ${sx},${sy + scale * 0.6} ${sx - scale},${sy}" fill="rgb(${c.r},${c.g},${c.b})"/>`);
                }
                if (rightVisible) {
                    const dr = Math.max(0, c.r - 40), dg = Math.max(0, c.g - 40), db = Math.max(0, c.b - 40);
                    shapes.push(`<polygon points="${sx},${sy + scale * 0.6} ${sx + scale},${sy} ${sx + scale},${sy + scale * 1.2} ${sx},${sy + scale * 1.8}" fill="rgb(${dr},${dg},${db})"/>`);
                }
                if (frontVisible) {
                    const dr = Math.max(0, c.r - 60), dg = Math.max(0, c.g - 60), db = Math.max(0, c.b - 60);
                    shapes.push(`<polygon points="${sx},${sy + scale * 0.6} ${sx - scale},${sy} ${sx - scale},${sy + scale * 1.2} ${sx},${sy + scale * 1.8}" fill="rgb(${dr},${dg},${db})"/>`);
                }
            }
        }
    }

    /* Calculer la viewBox */
    const vbW = (SW + SD) * scale + scale * 2;
    const vbH = (SH * scale * 1.2 + (SW + SD) * scale * 0.5) + scale * 2;
    const vbX = -(SW * scale);
    const vbY = -(SH * scale * 1.2 + scale);

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}" shape-rendering="crispEdges">${shapes.join("")}</svg>`;
}

/* Générer un sprite pour type/direction/frame */
function generateSprite(type, dir, frame) {
    const cacheKey = `${type}_${dir}_${frame}`;
    if (_spriteCache.has(cacheKey)) return _spriteCache.get(cacheKey);

    let svg = "";
    if (type === "player") {
        const base = _createPlayerBaseFrame();
        const frames = _generateWalkFrames(base, dir);
        svg = renderSpriteToSVG(frames[frame] || frames[0]);
    }

    /* Cache LRU */
    if (_spriteCache.size >= _spriteCacheMax) {
        const firstKey = _spriteCache.keys().next().value;
        _spriteCache.delete(firstKey);
    }
    _spriteCache.set(cacheKey, svg);
    return svg;
}

/* =================== Singleton + API Handler =================== */

let world = null;

function getWorld() {
    if (!world) {
        /* Essayer de charger une graine persistée */
        const seedPath = path.resolve(__dirname, "home", ".ef", "voxelworld.json");
        let seed = null;
        try {
            if (fs.existsSync(seedPath)) {
                const data = JSON.parse(fs.readFileSync(seedPath, "utf-8"));
                seed = data.seed;
            }
        } catch {}
        world = new VoxelWorld(seed);
        /* Sauvegarder la graine */
        try {
            fs.mkdirSync(path.dirname(seedPath), { recursive: true });
            fs.writeFileSync(seedPath, JSON.stringify({ seed: world.seed }, null, 2));
        } catch {}
    }
    return world;
}

function handleVoxelApi(req, res, query) {
    const w = getWorld();

    /* --- GET /api/voxel/chunk?cx=&cy=&cz= --- */
    if (req.url.startsWith("/api/voxel/chunk")) {
        const cx = parseInt(query.cx || "0", 10);
        const cy = parseInt(query.cy || "0", 10);
        const cz = parseInt(query.cz || "0", 10);

        if (isNaN(cx) || isNaN(cy) || isNaN(cz)) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Paramètres cx, cy, cz requis (entiers)" }));
        }

        /* Utiliser les données réelles si dispo (async) */
        w.generateChunkReal(cx, cy, cz).then(chunk => {
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=3600"
            });
            res.end(JSON.stringify(w.serializeChunk(chunk)));
        }).catch(e => {
            /* Fallback synchrone en cas d'erreur */
            const chunk = w.generateChunk(cx, cy, cz);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(w.serializeChunk(chunk)));
        });
        return;
    }

    /* --- GET /api/voxel/info --- */
    if (req.url.startsWith("/api/voxel/info")) {
        /* Compter les fichiers du cache */
        let fileCount = 0, fileSize = 0;
        try {
            const files = fs.readdirSync(w.cacheDir);
            fileCount = files.length;
            for (const f of files) {
                const stat = fs.statSync(path.join(w.cacheDir, f));
                fileSize += stat.size;
            }
        } catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({
            seed: w.seed,
            chunkSize: CHUNK_SIZE,
            voxelTypes: VOXEL_TYPES,
            colors: VOXEL_COLORS,
            cacheSize: w.chunkCache.size,
            fileCache: { count: fileCount, sizeBytes: fileSize, dir: w.cacheDir }
        }));
    }

    /* --- DELETE /api/voxel/cache --- */
    if (req.method === "DELETE" && req.url.startsWith("/api/voxel/cache")) {
        w.chunkCache.clear();
        try {
            const files = fs.readdirSync(w.cacheDir);
            for (const f of files) {
                fs.unlinkSync(path.join(w.cacheDir, f));
            }
        } catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: true, message: "Cache vidé" }));
    }

    /* --- GET /api/voxel/sprite?type=player&dir=S&frame=0 --- */
    if (req.url.startsWith("/api/voxel/sprite")) {
        const type = (query.type || "player").toLowerCase();
        const dir = (query.dir || "S").toUpperCase();
        const frame = parseInt(query.frame || "0", 10);

        if (!["N", "S", "E", "O"].includes(dir)) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            return res.end("dir must be N, S, E, or O");
        }
        if (frame < 0 || frame > 3) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            return res.end("frame must be 0-3");
        }

        const svg = generateSprite(type, dir, frame);
        res.writeHead(200, {
            "Content-Type": "image/svg+xml",
            "Cache-Control": "public, max-age=86400"
        });
        return res.end(svg);
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Route voxel inconnue" }));
}

module.exports = { handleVoxelApi, VOXEL_TYPES, VOXEL_COLORS, CHUNK_SIZE, generateSprite };
