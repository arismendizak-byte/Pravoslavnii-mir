(function (global) {
    'use strict';

    const VERSION = '1.37.0';
    const STORAGE_KEY = 'pravmir.my_pm.v1';
    const SCHEMA_VERSION = 1;
    const COLLECTION_KINDS = Object.freeze({
        favorites: 'place',
        read_later: 'content',
        saved_routes: 'route'
    });
    const LEGACY_KEYS = Object.freeze(['pravmirLocalProfile', 'favorites', 'readLater', 'myRoutes']);

    let state = null;

    function clone(value) {
        return value == null ? value : JSON.parse(JSON.stringify(value));
    }

    function nowIso() { return new Date().toISOString(); }
    function text(value, max) { return String(value == null ? '' : value).trim().slice(0, max || 500); }
    function isObject(value) { return Boolean(value) && typeof value === 'object' && !Array.isArray(value); }

    function safeParse(raw, fallback) {
        try { return raw == null || raw === '' ? fallback : JSON.parse(raw); }
        catch (_) { return fallback; }
    }

    function makeLocalUserId() {
        try {
            if (global.crypto && typeof global.crypto.randomUUID === 'function') return 'pm-local-user-' + global.crypto.randomUUID().toLowerCase();
        } catch (_) {}
        return 'pm-local-user-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14);
    }

    function defaultState() {
        return {
            schema_version: SCHEMA_VERSION,
            local_user_id: makeLocalUserId(),
            storage_mode: 'device_local',
            sync_status: 'local_only',
            profile: { display_name: 'Паломник', email: '', updated_at: null },
            collections: { favorites: [], read_later: [], saved_routes: [] },
            migration: {
                legacy_keys_checked: [],
                migrated_refs: 0,
                unresolved: [],
                last_checked_at: null
            }
        };
    }

    function normalizeRef(ref, expectedKind) {
        if (!isObject(ref)) return null;
        const kind = text(ref.kind, 40);
        const id = text(ref.id, 180);
        if (!kind || !id || (expectedKind && kind !== expectedKind)) return null;
        return { kind: kind, id: id };
    }

    function refKey(ref) { return ref.kind + ':' + ref.id; }

    function normalizeCollection(rows, expectedKind) {
        const out = [], seen = new Set();
        (Array.isArray(rows) ? rows : []).forEach(function (row) {
            if (!isObject(row)) return;
            const ref = normalizeRef(row.ref, expectedKind);
            if (!ref) return;
            const key = refKey(ref);
            if (seen.has(key)) return;
            seen.add(key);
            out.push({
                ref: ref,
                saved_at: text(row.saved_at, 60) || null,
                source: row.source === 'legacy_migration' ? 'legacy_migration' : 'user'
            });
        });
        return out;
    }

    function normalizeState(value) {
        const base = defaultState();
        if (!isObject(value) || Number(value.schema_version) !== SCHEMA_VERSION) return base;
        const localUserId = text(value.local_user_id, 120);
        if (/^pm-local-user-[a-z0-9-]+$/.test(localUserId)) base.local_user_id = localUserId;
        const profile = isObject(value.profile) ? value.profile : {};
        base.profile = {
            display_name: text(profile.display_name || profile.name, 60) || 'Паломник',
            email: text(profile.email, 160),
            updated_at: text(profile.updated_at, 60) || null
        };
        const collections = isObject(value.collections) ? value.collections : {};
        Object.keys(COLLECTION_KINDS).forEach(function (name) {
            base.collections[name] = normalizeCollection(collections[name], COLLECTION_KINDS[name]);
        });
        const migration = isObject(value.migration) ? value.migration : {};
        base.migration.legacy_keys_checked = Array.isArray(migration.legacy_keys_checked)
            ? Array.from(new Set(migration.legacy_keys_checked.map(function (v) { return text(v, 80); }).filter(Boolean)))
            : [];
        base.migration.migrated_refs = Math.max(0, Number(migration.migrated_refs) || 0);
        base.migration.unresolved = (Array.isArray(migration.unresolved) ? migration.unresolved : []).filter(isObject).map(function (row) {
            return {
                fingerprint: text(row.fingerprint, 80),
                legacy_key: text(row.legacy_key, 80),
                kind_hint: text(row.kind_hint, 40),
                title: text(row.title, 240),
                sub: text(row.sub, 240),
                url: text(row.url, 500),
                preserved_at: text(row.preserved_at, 60) || null
            };
        }).filter(function (row) { return row.fingerprint && row.legacy_key; });
        base.migration.last_checked_at = text(migration.last_checked_at, 60) || null;
        return base;
    }

    function getStorage() {
        try {
            const storage = global.localStorage;
            const probe = '__pravmir_my_pm_probe__';
            storage.setItem(probe, '1'); storage.removeItem(probe);
            return storage;
        } catch (_) { return null; }
    }

    function readState() {
        const storage = getStorage();
        if (!storage) return defaultState();
        return normalizeState(safeParse(storage.getItem(STORAGE_KEY), null));
    }

    function writeState(next) {
        const normalized = normalizeState(next);
        const storage = getStorage();
        if (!storage) throw new Error('PravmirMyPm: local storage unavailable');
        storage.setItem(STORAGE_KEY, JSON.stringify(normalized));
        state = normalized;
        emitChange();
        return clone(state);
    }

    function hashString(value) {
        let h = 2166136261;
        const s = String(value || '');
        for (let i = 0; i < s.length; i += 1) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
        return (h >>> 0).toString(16).padStart(8, '0');
    }

    function addUnresolved(next, legacyKey, kindHint, row) {
        const raw = isObject(row) ? row : { title: String(row || '') };
        const fingerprint = hashString(JSON.stringify([legacyKey, raw.id || '', raw.title || '', raw.url || '', raw.sub || '']));
        if (next.migration.unresolved.some(function (item) { return item.fingerprint === fingerprint; })) return false;
        next.migration.unresolved.push({
            fingerprint: fingerprint,
            legacy_key: legacyKey,
            kind_hint: kindHint,
            title: text(raw.title, 240),
            sub: text(raw.sub, 240),
            url: text(raw.url, 500),
            preserved_at: nowIso()
        });
        return true;
    }

    function addRefToState(next, collection, ref, source, savedAt) {
        const expected = COLLECTION_KINDS[collection];
        const normalized = normalizeRef(ref, expected);
        if (!normalized) return false;
        const rows = next.collections[collection];
        if (rows.some(function (row) { return refKey(row.ref) === refKey(normalized); })) return false;
        rows.push({ ref: normalized, saved_at: savedAt || nowIso(), source: source || 'user' });
        return true;
    }

    function migrateLegacy(next) {
        const storage = getStorage();
        if (!storage) return false;
        let changed = false;
        const profile = safeParse(storage.getItem('pravmirLocalProfile'), null);
        if (isObject(profile)) {
            const name = text(profile.name, 60), email = text(profile.email, 160);
            if (name && (!next.profile.updated_at || next.profile.display_name === 'Паломник')) {
                next.profile.display_name = name;
                next.profile.email = email;
                next.profile.updated_at = nowIso();
                changed = true;
            }
        }
        const specs = [
            ['favorites', 'favorites', 'place'],
            ['readLater', 'read_later', 'content'],
            ['myRoutes', 'saved_routes', 'route']
        ];
        specs.forEach(function (spec) {
            const legacyKey = spec[0], collection = spec[1], kind = spec[2];
            const rows = safeParse(storage.getItem(legacyKey), []);
            if (!Array.isArray(rows)) return;
            rows.forEach(function (row) {
                const legacyId = isObject(row) ? text(row.id, 180) : '';
                if (legacyId && /^pm-[a-z0-9-]+$/i.test(legacyId)) {
                    if (addRefToState(next, collection, { kind: kind, id: legacyId }, 'legacy_migration', text(row.saved_at, 60) || nowIso())) {
                        next.migration.migrated_refs += 1; changed = true;
                    }
                } else if (addUnresolved(next, legacyKey, kind, row)) changed = true;
            });
        });
        LEGACY_KEYS.forEach(function (key) {
            if (!next.migration.legacy_keys_checked.includes(key)) { next.migration.legacy_keys_checked.push(key); changed = true; }
        });
        next.migration.last_checked_at = nowIso();
        changed = true;
        return changed;
    }

    function emitChange() {
        try {
            if (typeof global.dispatchEvent === 'function' && typeof global.CustomEvent === 'function') {
                global.dispatchEvent(new global.CustomEvent('pravmir:mypmchange', { detail: getSummarySync() }));
            }
        } catch (_) {}
    }

    function ensureState() {
        if (!state) {
            state = readState();
            const next = clone(state);
            if (migrateLegacy(next)) {
                try { writeState(next); }
                catch (_) { state = normalizeState(next); }
            }
        }
        return state;
    }

    function getSummarySync() {
        const current = state || defaultState();
        return {
            storage_mode: current.storage_mode,
            sync_status: current.sync_status,
            schema_version: current.schema_version,
            local_user_id: current.local_user_id,
            backend: 'not_configured',
            authenticated: false,
            sync_enabled: false,
            server_storage: false,
            organisation_entities: 0,
            my_parish_enabled: false,
            favorites: current.collections.favorites.length,
            read_later: current.collections.read_later.length,
            saved_routes: current.collections.saved_routes.length,
            legacy_unresolved: current.migration.unresolved.length
        };
    }

    async function init() {
        state = readState();
        const next = clone(state);
        if (migrateLegacy(next)) {
            try { writeState(next); }
            catch (_) { state = normalizeState(next); }
        }
        return getSummarySync();
    }

    async function getProfile() { return clone(ensureState().profile); }
    async function updateProfile(patch) {
        const current = clone(ensureState());
        const value = isObject(patch) ? patch : {};
        current.profile = {
            display_name: text(value.display_name || value.name, 60) || current.profile.display_name || 'Паломник',
            email: Object.prototype.hasOwnProperty.call(value, 'email') ? text(value.email, 160) : current.profile.email,
            updated_at: nowIso()
        };
        writeState(current);
        return clone(state.profile);
    }

    function assertCollection(name) {
        if (!Object.prototype.hasOwnProperty.call(COLLECTION_KINDS, name)) throw new Error('PravmirMyPm: unknown collection '+name);
        return name;
    }

    async function list(name) { return clone(ensureState().collections[assertCollection(name)]); }
    async function has(name, ref) {
        const collection = assertCollection(name), normalized = normalizeRef(ref, COLLECTION_KINDS[collection]);
        if (!normalized) return false;
        return ensureState().collections[collection].some(function (row) { return refKey(row.ref) === refKey(normalized); });
    }
    async function add(name, ref) {
        const collection = assertCollection(name), current = clone(ensureState());
        if (!addRefToState(current, collection, ref, 'user', nowIso())) return false;
        writeState(current); return true;
    }
    async function remove(name, ref) {
        const collection = assertCollection(name), normalized = normalizeRef(ref, COLLECTION_KINDS[collection]);
        if (!normalized) return false;
        const current = clone(ensureState()), before = current.collections[collection].length;
        current.collections[collection] = current.collections[collection].filter(function (row) { return refKey(row.ref) !== refKey(normalized); });
        if (current.collections[collection].length === before) return false;
        writeState(current); return true;
    }
    async function toggle(name, ref) {
        if (await has(name, ref)) { await remove(name, ref); return false; }
        await add(name, ref); return true;
    }
    async function getSummary() { ensureState(); return clone(getSummarySync()); }
    async function getMigrationReport() { return clone(ensureState().migration); }
    async function exportState() { return clone(ensureState()); }
    async function importState(value) {
        const normalized = normalizeState(value);
        writeState(normalized);
        return clone(state);
    }
    function getCapabilities() {
        return { profile: true, favorites: true, read_later: true, saved_routes: true, auth: false, sync_adapter: true, notifications: false, my_parish: false };
    }
    function getAdapterContract() {
        return { adapter: 'local_storage', state_schema: 'schemas/my_pm_state.schema.json', remote_adapter: 'PravmirAccount', auth_transport: 'same_origin_cookie', secrets_stored: false, automatic_upload: false, capabilities: getCapabilities() };
    }

    global.PravmirMyPm = Object.freeze({
        version: VERSION,
        storageKey: STORAGE_KEY,
        schemaVersion: SCHEMA_VERSION,
        collections: Object.freeze(Object.assign({}, COLLECTION_KINDS)),
        init: init,
        getProfile: getProfile,
        updateProfile: updateProfile,
        list: list,
        has: has,
        add: add,
        remove: remove,
        toggle: toggle,
        getSummary: getSummary,
        getMigrationReport: getMigrationReport,
        exportState: exportState,
        importState: importState,
        getCapabilities: getCapabilities,
        getAdapterContract: getAdapterContract
    });
})(window);
