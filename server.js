const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { handleVoxelApi } = require("./voxelverse");

const PORT = process.env.PORT || 8084;
const BASE_PATH = path.resolve(__dirname, "home");
const PUBLIC_DIR = __dirname;

/* =================== MIME TYPES =================== */

const MIME_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".gif": "image/gif",
    ".ico": "image/x-icon",
    ".txt": "text/plain; charset=utf-8",
    ".mp4": "video/mp4",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".flac": "audio/flac",
    ".m4a": "audio/mp4",
    ".opus": "audio/opus",
};

/* =================== HELPERS =================== */

function resolveSafePath(requestedPath) {
    /* Empêche toute remontée au-delà de BASE_PATH */
    const normalized = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
    const resolved = path.resolve(BASE_PATH, normalized);
    if (!resolved.startsWith(BASE_PATH)) {
        return null; /* tentative de path traversal */
    }
    return resolved;
}

function getMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return MIME_TYPES[ext] || "application/octet-stream";
}

/* =================== API: FILE SYSTEM =================== */

function handleFsApi(req, res, query) {
    const requestedPath = query.path || "";
    const safePath = resolveSafePath(requestedPath);

    if (!safePath) {
        res.writeHead(403, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Accès refusé : chemin hors limites" }));
    }

    /* --- write file --- */
    if (req.url.startsWith("/api/fs/write") && (req.method === "POST" || req.method === "PUT")) {
        console.log(`[server] POST /api/fs/write path="${query.path || '??'}"`);
        let body = [];
        req.on("data", chunk => body.push(chunk));
        req.on("end", () => {
            const content = Buffer.concat(body);
            console.log(`[server] writing ${safePath} (${content.length} bytes)`);
            try {
                /* Créer les dossiers parents si besoin */
                fs.mkdirSync(path.dirname(safePath), { recursive: true });
                fs.writeFileSync(safePath, content);
                console.log(`[server] write OK: ${safePath}`);
                res.writeHead(200, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ ok: true, path: requestedPath, size: content.length }));
            } catch (e) {
                console.error(`[server] write ERROR: ${e.message}`);
                res.writeHead(500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Impossible d'écrire le fichier", details: e.message }));
            }
        });
        return;
    }

    /* --- delete file or directory --- */
    if (req.method === "DELETE") {
        if (!fs.existsSync(safePath)) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Chemin introuvable" }));
        }
        try {
            const stat = fs.statSync(safePath);
            if (stat.isDirectory()) {
                fs.rmSync(safePath, { recursive: true, force: true });
            } else {
                fs.unlinkSync(safePath);
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ok: true, path: requestedPath }));
        } catch (e) {
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Impossible de supprimer", details: e.message }));
        }
    }

    /* --- read file --- */
    if (req.url.startsWith("/api/fs/read")) {
        if (!fs.existsSync(safePath)) {
            console.log(`[server] GET /api/fs/read path="${query.path}" → NOT FOUND`);
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Fichier introuvable" }));
        }
        if (!fs.statSync(safePath).isFile()) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Ce n'est pas un fichier" }));
        }
        try {
            const data = fs.readFileSync(safePath); /* Buffer brut, pas d'encodage */
            console.log(`[server] GET /api/fs/read path="${query.path}" → ${data.length} bytes`);
            const mime = getMimeType(safePath);
            res.writeHead(200, {
                "Content-Type": mime,
                "Content-Length": data.length,
                "Cache-Control": "no-cache"
            });
            return res.end(data);
        } catch (e) {
            console.error(`[server] read ERROR: ${e.message}`);
            res.writeHead(500, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Impossible de lire le fichier" }));
        }
    }

    /* --- stream file (video/audio) with Range support --- */
    if (req.url.startsWith("/api/fs/stream")) {
        if (!fs.existsSync(safePath)) {
            res.writeHead(404, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Fichier introuvable" }));
        }
        const stat = fs.statSync(safePath);
        if (!stat.isFile()) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Ce n'est pas un fichier" }));
        }

        const fileSize = stat.size;
        const range = req.headers.range;
        const mime = getMimeType(safePath);

        if (!range) {
            /* Pas de Range header → servir tout le fichier (fallback) */
            console.log(`[server:stream] serving full file: ${safePath} (${fileSize} bytes)`);
            res.writeHead(200, {
                "Content-Type": mime,
                "Content-Length": fileSize,
                "Accept-Ranges": "bytes",
                "Cache-Control": "no-cache"
            });
            const stream = fs.createReadStream(safePath);
            stream.on("error", () => res.end());
            stream.pipe(res);
            return;
        }

        /* Parser le Range header */
        const parts = range.replace(/bytes=/, "").split("-");
        let start = parseInt(parts[0], 10);
        let end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

        /* Validation */
        if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize) {
            res.writeHead(416, {
                "Content-Range": `bytes */${fileSize}`
            });
            return res.end("Requested range not satisfiable");
        }

        /* Clamp end */
        if (start < 0) start = 0;
        if (end >= fileSize) end = fileSize - 1;

        const chunkSize = end - start + 1;
        console.log(`[server:stream] range ${start}-${end}/${fileSize} (${chunkSize} bytes) for ${safePath}`);

        res.writeHead(206, {
            "Content-Type": mime,
            "Content-Range": `bytes ${start}-${end}/${fileSize}`,
            "Content-Length": chunkSize,
            "Accept-Ranges": "bytes",
            "Cache-Control": "no-cache"
        });

        const stream = fs.createReadStream(safePath, { start, end });
        stream.on("error", () => res.end());
        stream.pipe(res);
        return;
    }

    /* --- list directory --- */
    if (!fs.existsSync(safePath)) {
        console.log(`[server] GET /api/fs path="${query.path || '/'}" → NOT FOUND`);
        res.writeHead(404, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Chemin introuvable" }));
    }

    const stat = fs.statSync(safePath);

    if (!stat.isDirectory()) {
        res.writeHead(400, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ error: "Ce n'est pas un répertoire" }));
    }

    try {
        const entries = fs.readdirSync(safePath, { withFileTypes: true });
        console.log(`[server] GET /api/fs path="${query.path || '/'}" → ${entries.length} items`);
        const items = entries.map(entry => {
            const fullPath = path.join(safePath, entry.name);
            let itemStat;
            try {
                itemStat = fs.statSync(fullPath);
            } catch {
                itemStat = { size: 0, mtime: null, isDirectory: () => false, isFile: () => false };
            }
            return {
                name: entry.name,
                type: entry.isDirectory() ? "dir" : "file",
                size: itemStat.size || 0,
                mtime: itemStat.mtime ? itemStat.mtime.toISOString() : null,
                ext: path.extname(entry.name).toLowerCase()
            };
        });

        /* Trier : dossiers en premier, puis alphabétique */
        items.sort((a, b) => {
            if (a.type === "dir" && b.type !== "dir") return -1;
            if (a.type !== "dir" && b.type === "dir") return 1;
            return a.name.localeCompare(b.name);
        });

        const displayPath = path.relative(BASE_PATH, safePath);
        res.writeHead(200, {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-cache"
        });
        res.end(JSON.stringify({
            path: displayPath || "/",
            fullPath: safePath,
            items: items
        }));
    } catch (e) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Impossible de lire le répertoire" }));
    }
}

/* =================== STATIC FILE SERVER =================== */

function serveStatic(req, res, pathname) {
    /* Strip /eventsFlow prefix pour servir depuis la racine du projet */
    if (pathname.startsWith("/eventsFlow/")) {
        pathname = pathname.substring("/eventsFlow".length);
    }
    if (pathname === "/eventsFlow") {
        pathname = "/";
    }

    /* Default to index.html */
    if (pathname === "/" || pathname === "/index.html") {
        pathname = "/index.html";
    }

    const filePath = path.join(PUBLIC_DIR, pathname);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        return res.end("404 Not Found");
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
        res.writeHead(302, { "Location": pathname + "/index.html" });
        return res.end();
    }

    res.writeHead(200, {
        "Content-Type": getMimeType(filePath),
        "Content-Length": stat.size
    });

    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
}

/* =================== SERVER =================== */

const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;
    const query = parsedUrl.query;

    console.log(`[server] ${req.method} ${pathname}`);

    /* --- API routes --- */
    if (pathname.startsWith("/api/fs")) {
        return handleFsApi(req, res, query);
    }

    /* --- Voxel API --- */
    if (pathname.startsWith("/api/voxel")) {
        return handleVoxelApi(req, res, query);
    }

    /* --- static files --- */
    serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
    console.log(`[server] eventsFlow server running on http://localhost:${PORT}`);
    console.log(`[server] basePath: ${BASE_PATH}`);
    console.log(`[server] publicDir: ${PUBLIC_DIR}`);
});
