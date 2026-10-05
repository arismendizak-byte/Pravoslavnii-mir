(function (global) {
    'use strict';

    // Leaflet itself does not use an API key. Keep the stable 1.x line because
    // markercluster/routing plugins in the project target the classic global L API.
    const LOAD_TIMEOUT_MS = 7000;
    const TILE_BOOT_TIMEOUT_MS = 6500;

    const scriptUrl = (function () {
        if (global.document && global.document.currentScript && global.document.currentScript.src) {
            return new URL(global.document.currentScript.src, global.location && global.location.href ? global.location.href : undefined);
        }
        const href = global.location && global.location.href ? global.location.href : 'http://localhost/index.html';
        return new URL('js/map-runtime.js', href);
    })();
    const siteRoot = new URL('../', scriptUrl);

    function resolveSourceUrl(value) {
        const text = String(value || '');
        return /^https?:\/\//i.test(text) ? text : new URL(text.replace(/^\/+/, ''), siteRoot).href;
    }

    const STYLE_SOURCES = {
        leaflet: [
            'vendor/leaflet/leaflet.css',
            'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
            'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css',
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'
        ],
        cluster: [
            'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
            'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.css'
        ],
        clusterDefault: [
            'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
            'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/MarkerCluster.Default.css'
        ],
        routing: [
            'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
            'https://cdn.jsdelivr.net/npm/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css',
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet-routing-machine/3.2.12/leaflet-routing-machine.css'
        ]
    };

    const SCRIPT_SOURCES = {
        leaflet: [
            'vendor/leaflet/leaflet.js',
            'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
            'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js',
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'
        ],
        cluster: [
            'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
            'https://cdn.jsdelivr.net/npm/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet.markercluster/1.5.3/leaflet.markercluster.js'
        ],
        routing: [
            'https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
            'https://cdn.jsdelivr.net/npm/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js',
            'https://cdnjs.cloudflare.com/ajax/libs/leaflet-routing-machine/3.2.12/leaflet-routing-machine.js'
        ]
    };

    // OSM's current Tile Usage Policy names this exact URL. It is the primary
    // no-key basemap; CARTO is a fallback if the OSM tile service is unreachable.
    const TILE_PROVIDERS = [
        {
            id: 'osm',
            url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
            options: {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
                maxZoom: 19,
                minZoom: 3
            }
        },
        {
            id: 'carto',
            url: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png',
            options: {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, &copy; CARTO',
                subdomains: 'abcd',
                maxZoom: 19,
                minZoom: 3
            }
        }
    ];

    const loadedStyles = new Set();
    const pendingScripts = new Map();

    function withTimeout(promise, ms, label) {
        return new Promise(function (resolve, reject) {
            let settled = false;
            const timer = setTimeout(function () {
                if (settled) return;
                settled = true;
                reject(new Error(label + ' timed out after ' + ms + 'ms'));
            }, ms);
            promise.then(function (value) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                resolve(value);
            }, function (error) {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                reject(error);
            });
        });
    }

    function appendStyle(url) {
        const source = resolveSourceUrl(url);
        if (loadedStyles.has(source)) return Promise.resolve(source);
        return withTimeout(new Promise(function (resolve, reject) {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = source;
            link.onload = function () { loadedStyles.add(source); resolve(source); };
            link.onerror = function () { link.remove(); reject(new Error('CSS load failed: ' + source)); };
            document.head.appendChild(link);
        }), LOAD_TIMEOUT_MS, 'CSS ' + source);
    }

    async function loadFirstStyle(urls) {
        let lastError = null;
        for (const url of urls) {
            try { return await appendStyle(url); } catch (error) { lastError = error; }
        }
        throw lastError || new Error('No CSS source available');
    }

    function appendScript(url) {
        const source = resolveSourceUrl(url);
        if (pendingScripts.has(source)) return pendingScripts.get(source);
        const promise = withTimeout(new Promise(function (resolve, reject) {
            const script = document.createElement('script');
            script.src = source;
            script.async = true;
            script.crossOrigin = 'anonymous';
            script.onload = function () { resolve(source); };
            script.onerror = function () { script.remove(); reject(new Error('Script load failed: ' + source)); };
            document.head.appendChild(script);
        }), LOAD_TIMEOUT_MS, 'Script ' + source).catch(function (error) {
            pendingScripts.delete(source);
            throw error;
        });
        pendingScripts.set(source, promise);
        return promise;
    }

    async function loadFirstScript(urls, ready) {
        if (ready()) return 'already-loaded';
        let lastError = null;
        for (const url of urls) {
            try {
                await appendScript(url);
                if (ready()) return url;
                lastError = new Error('Script loaded but API missing: ' + url);
            } catch (error) { lastError = error; }
        }
        throw lastError || new Error('No script source available');
    }

    async function ensureLeaflet(options) {
        const opts = options || {};
        // The core engine is mandatory. Plugins are optional and must never block
        // the base map. Nested route detail pages can opt out of unused plugins.
        await loadFirstStyle(STYLE_SOURCES.leaflet).catch(function () {});
        const coreSource = await loadFirstScript(SCRIPT_SOURCES.leaflet, function () { return !!global.L; });

        let cluster = !!(global.L && global.L.markerClusterGroup);
        let routing = !!(global.L && global.L.Routing);
        if (opts.extras === false) {
            return { leaflet: true, cluster: cluster, routing: routing, coreSource: coreSource };
        }

        const wantCluster = opts.cluster !== false;
        const wantRouting = opts.routing === true;
        if (wantCluster && !cluster) {
            try {
                await Promise.all([
                    loadFirstStyle(STYLE_SOURCES.cluster),
                    loadFirstStyle(STYLE_SOURCES.clusterDefault)
                ]).catch(function () {});
                await loadFirstScript(SCRIPT_SOURCES.cluster, function () { return !!(global.L && global.L.markerClusterGroup); });
                cluster = true;
            } catch (error) {}
        }

        // Routing is intentionally opt-in. The main map does not pay for this plugin
        // until a user actually requests a route.
        if (wantRouting && !routing) {
            try {
                await loadFirstStyle(STYLE_SOURCES.routing).catch(function () {});
                await loadFirstScript(SCRIPT_SOURCES.routing, function () { return !!(global.L && global.L.Routing); });
                routing = true;
            } catch (error) {}
        }

        return { leaflet: true, cluster: cluster, routing: routing, coreSource: coreSource };
    }

    function createBaseLayer(map, onProviderChange) {
        let activeLayer = null;
        let activeIndex = -1;
        let failureTimer = null;
        let tileErrors = 0;
        let switchedOnce = false;

        function clearFailureTimer() {
            if (failureTimer) clearTimeout(failureTimer);
            failureTimer = null;
        }

        function attach(providerIndex, fallback) {
            const provider = TILE_PROVIDERS[providerIndex];
            if (!provider) return null;
            clearFailureTimer();
            tileErrors = 0;
            activeIndex = providerIndex;

            const layer = global.L.tileLayer(provider.url, provider.options);
            activeLayer = layer;

            function switchProvider(reason) {
                if (layer !== activeLayer) return;
                const nextIndex = providerIndex + 1;
                if (nextIndex >= TILE_PROVIDERS.length) {
                    clearFailureTimer();
                    if (typeof onProviderChange === 'function') onProviderChange(provider.id, fallback, { failed: true, reason: reason });
                    return;
                }
                switchedOnce = true;
                clearFailureTimer();
                if (map.hasLayer(layer)) map.removeLayer(layer);
                const next = attach(nextIndex, true);
                if (next) next.addTo(map);
            }

            layer.on('tileload', function () {
                clearFailureTimer();
                if (typeof onProviderChange === 'function') onProviderChange(provider.id, !!fallback, { ready: true });
            });
            layer.on('tileerror', function () {
                tileErrors += 1;
                if (tileErrors >= 3) switchProvider('tileerror');
            });

            failureTimer = setTimeout(function () {
                switchProvider('boot-timeout');
            }, TILE_BOOT_TIMEOUT_MS);

            if (typeof onProviderChange === 'function') {
                onProviderChange(provider.id, !!fallback, { connecting: true, switched: switchedOnce });
            }
            return layer;
        }

        const first = attach(0, false);
        first.getActiveProvider = function () { return TILE_PROVIDERS[activeIndex] || null; };
        return first;
    }

    async function ensureYandex(apiKey) {
        const key = String(apiKey || '').trim();
        if (!key) {
            const error = new Error('Yandex JS API key is not configured');
            error.code = 'YANDEX_KEY_MISSING';
            throw error;
        }
        if (!global.ymaps3) {
            const src = 'https://api-maps.yandex.ru/v3/?apikey=' + encodeURIComponent(key) + '&lang=ru_RU';
            await appendScript(src);
        }
        if (!global.ymaps3 || !global.ymaps3.ready) throw new Error('Yandex JS API v3 did not initialize');
        await global.ymaps3.ready;
        return global.ymaps3;
    }

    global.PravmirMapRuntime = Object.freeze({
        versions: Object.freeze({ leaflet: '1.9.4', markerCluster: '1.5.3', routingMachine: '3.2.12', yandex: 'v3' }),
        ensureLeaflet: ensureLeaflet,
        createBaseLayer: createBaseLayer,
        ensureYandex: ensureYandex,
        sources: Object.freeze({ scripts: SCRIPT_SOURCES, styles: STYLE_SOURCES, tiles: TILE_PROVIDERS }),
        loadTimeoutMs: LOAD_TIMEOUT_MS,
        tileBootTimeoutMs: TILE_BOOT_TIMEOUT_MS
    });
})(window);
