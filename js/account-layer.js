(function (global) {
    'use strict';

    const VERSION = '1.45.0';
    const API = '/api/v1';
    const CSRF_KEY = 'pravmir.account.csrf.v1';
    let snapshot = { available: false, authenticated: false, user: null, expires_at: null, remote_revision: null, remote_checksum: null };

    function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
    function sessionStorageSafe() { try { return global.sessionStorage || null; } catch (_) { return null; } }
    function getCsrf() { const s = sessionStorageSafe(); return s ? (s.getItem(CSRF_KEY) || '') : ''; }
    function setCsrf(value) { const s = sessionStorageSafe(); if (!s) return; if (value) s.setItem(CSRF_KEY, String(value)); else s.removeItem(CSRF_KEY); }

    class AccountError extends Error {
        constructor(code, status, payload) { super(code || 'account_error'); this.name = 'AccountError'; this.code = code || 'account_error'; this.status = status || 0; this.payload = payload || null; }
    }

    async function request(path, options) {
        const opts = Object.assign({ method: 'GET', credentials: 'same-origin', headers: { 'Accept': 'application/json' } }, options || {});
        opts.headers = Object.assign({}, opts.headers || {});
        if (opts.body && typeof opts.body !== 'string') {
            opts.headers['Content-Type'] = 'application/json';
            opts.body = JSON.stringify(opts.body);
        }
        if (!/^(GET|HEAD)$/i.test(opts.method || 'GET')) {
            const csrf = getCsrf(); if (csrf) opts.headers['X-Pravmir-CSRF'] = csrf;
        }
        let response;
        try { response = await global.fetch(API + path, opts); }
        catch (_) { throw new AccountError('backend_unavailable', 0); }
        let payload = null;
        try { payload = await response.json(); } catch (_) {}
        if (!response.ok) throw new AccountError((payload && payload.error) || ('http_' + response.status), response.status, payload);
        return payload || {};
    }

    function applySession(payload) {
        snapshot.available = true;
        snapshot.authenticated = Boolean(payload && payload.user);
        snapshot.user = payload && payload.user ? clone(payload.user) : null;
        snapshot.expires_at = payload && payload.expires_at ? payload.expires_at : null;
        if (payload && payload.csrf_token) setCsrf(payload.csrf_token);
        return clone(snapshot);
    }

    async function init() {
        try {
            await request('/health');
            snapshot.available = true;
        } catch (_) {
            snapshot = { available: false, authenticated: false, user: null, expires_at: null, remote_revision: null, remote_checksum: null };
            setCsrf('');
            return clone(snapshot);
        }
        try { return applySession(await request('/account/session')); }
        catch (error) {
            if (error.status === 401) { snapshot.authenticated = false; snapshot.user = null; snapshot.expires_at = null; setCsrf(''); return clone(snapshot); }
            throw error;
        }
    }

    async function register(values) {
        const payload = await request('/auth/register', { method: 'POST', body: values || {} });
        return applySession(payload);
    }
    async function login(email, password) {
        const payload = await request('/auth/login', { method: 'POST', body: { email: email, password: password } });
        return applySession(payload);
    }
    async function logout() {
        await request('/auth/logout', { method: 'POST', body: {} });
        setCsrf(''); snapshot.authenticated = false; snapshot.user = null; snapshot.expires_at = null; snapshot.remote_revision = null; snapshot.remote_checksum = null;
        return clone(snapshot);
    }
    async function requestRecovery(email) { return request('/auth/recovery/request', { method: 'POST', body: { email: email } }); }
    async function resetPassword(token, password) { const out = await request('/auth/recovery/reset', { method: 'POST', body: { token: token, password: password } }); setCsrf(''); snapshot.authenticated = false; snapshot.user = null; snapshot.expires_at = null; snapshot.remote_revision = null; snapshot.remote_checksum = null; return out; }

    async function getProfile() {
        const payload = await request('/account/profile'); snapshot.authenticated = true; snapshot.user = clone(payload.user); return clone(payload.user);
    }
    async function updateProfile(patch) {
        const payload = await request('/account/profile', { method: 'PATCH', body: patch || {} }); snapshot.user = clone(payload.user); return clone(payload.user);
    }
    async function getRemoteState() {
        const payload = await request('/account/my-pm'); snapshot.remote_revision = Number(payload.revision || 0); snapshot.remote_checksum = payload.checksum || null; return clone(payload);
    }
    async function pushLocalState(localState) {
        const current = await getRemoteState();
        const payload = await request('/account/my-pm', { method: 'PUT', body: { base_revision: current.revision, state: localState } });
        snapshot.remote_revision = Number(payload.revision || 0); snapshot.remote_checksum = payload.checksum || null;
        return clone(payload);
    }
    async function pullRemoteState() { return getRemoteState(); }
    async function exportAccount() { return request('/account/export'); }
    async function deleteAccount(password) {
        const out = await request('/account', { method: 'DELETE', body: { password: password } });
        setCsrf(''); snapshot.authenticated = false; snapshot.user = null; snapshot.expires_at = null; snapshot.remote_revision = null; snapshot.remote_checksum = null; return out;
    }
    function getStatus() { return clone(snapshot); }
    function getCapabilities() { return { auth: true, profile: true, recovery: true, export: true, deletion: true, explicit_my_pm_push: true, explicit_my_pm_pull: true, automatic_upload: false }; }

    global.PravmirAccount = Object.freeze({
        version: VERSION, apiBase: API, init: init, register: register, login: login, logout: logout,
        requestRecovery: requestRecovery, resetPassword: resetPassword, getProfile: getProfile, updateProfile: updateProfile,
        getRemoteState: getRemoteState, pushLocalState: pushLocalState, pullRemoteState: pullRemoteState,
        exportAccount: exportAccount, deleteAccount: deleteAccount, getStatus: getStatus, getCapabilities: getCapabilities,
        AccountError: AccountError
    });
})(window);
