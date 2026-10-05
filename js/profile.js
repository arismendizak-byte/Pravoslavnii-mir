(function () {
    'use strict';

    const specs = {
        favorites: { container: 'favoritesList', icon: '❤️', empty: 'У вас пока нет избранных мест', kind: 'place' },
        read_later: { container: 'readLaterList', icon: '📖', empty: 'Список пуст. Добавьте материалы из журнала', kind: 'content' },
        saved_routes: { container: 'routesList', icon: '🗺️', empty: 'У вас пока нет сохранённых маршрутов', kind: 'route' }
    };
    let accountSnapshot = { available: false, authenticated: false, user: null };

    function $(id) { return document.getElementById(id); }
    function emptyState(spec) {
        const box = document.createElement('div'); box.className = 'empty-state';
        const icon = document.createElement('span'); icon.className = 'empty-icon'; icon.textContent = spec.icon;
        box.append(icon, document.createTextNode(spec.empty)); return box;
    }

    function titleFor(kind, item) {
        if (!item) return 'Объект недоступен в текущем наборе данных';
        return String(item.title || item.name || item.display_name || item.id || 'Без названия');
    }
    function subFor(kind, item) {
        if (!item) return 'Ссылка сохранена по stable ID и не удалена.';
        if (kind === 'place') return [item.region, item.address || (item.location || {}).address].filter(Boolean).join(' · ');
        if (kind === 'content') return [item.author || item.publisher, item.published_label || item.published_on].filter(Boolean).join(' · ');
        if (kind === 'route') return [item.location, item.duration].filter(Boolean).join(' · ');
        return '';
    }
    function urlFor(kind, item) {
        if (!item) return '';
        if (kind === 'place' && window.PravmirData) return window.PravmirData.getDetailUrl(item);
        if (kind === 'route' && window.PravmirData) return window.PravmirData.routeDetailUrl(item);
        if (kind === 'content' && item.canonical_path) return item.canonical_path;
        return '';
    }
    async function resolveRef(ref) {
        if (!ref) return null;
        if (ref.kind === 'place' && window.PravmirData) return window.PravmirData.getPlaceById(ref.id);
        if (ref.kind === 'route' && window.PravmirData) return window.PravmirData.getRouteById(ref.id);
        if (ref.kind === 'content' && window.PravmirContent) return window.PravmirContent.getContentById(ref.id);
        return null;
    }

    async function renderCollection(name) {
        const api = window.PravmirMyPm, spec = specs[name], container = $(spec.container);
        if (!api || !container) return;
        const rows = await api.list(name);
        container.replaceChildren();
        if (!rows.length) { container.appendChild(emptyState(spec)); return; }
        const resolved = await Promise.all(rows.map(async function (row) { return { row: row, item: await resolveRef(row.ref) }; }));
        resolved.forEach(function (entry) {
            const card = document.createElement('div'); card.className = 'list-card';
            const info = document.createElement('div'); info.className = 'item-info';
            const title = document.createElement('div'); title.className = 'item-title';
            const href = urlFor(entry.row.ref.kind, entry.item);
            if (href) { const link = document.createElement('a'); link.href = href; link.textContent = titleFor(entry.row.ref.kind, entry.item); title.appendChild(link); }
            else title.textContent = titleFor(entry.row.ref.kind, entry.item);
            const sub = document.createElement('div'); sub.className = 'item-sub';
            sub.textContent = subFor(entry.row.ref.kind, entry.item) + (entry.row.source === 'legacy_migration' ? ' · перенесено из прежнего локального списка' : '');
            info.append(title, sub);
            const actions = document.createElement('div'); actions.className = 'item-actions';
            const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'remove-btn'; remove.textContent = '🗑️'; remove.setAttribute('aria-label', 'Удалить из списка');
            remove.addEventListener('click', async function () { await api.remove(name, entry.row.ref); await renderAll(); });
            actions.appendChild(remove); card.append(info, actions); container.appendChild(card);
        });
    }

    async function updateStats() {
        const summary = await window.PravmirMyPm.getSummary();
        $('favCount').textContent = String(summary.favorites);
        $('readLaterCount').textContent = String(summary.read_later);
        $('routeCount').textContent = String(summary.saved_routes);
        $('myPmStatusText').textContent = 'Данные «Мой ПМ» хранятся на этом устройстве. Аккаунт, если подключён, получает копию только по явной команде пользователя.';
        const report = await window.PravmirMyPm.getMigrationReport();
        const legacyBox = $('legacyMigrationBox');
        if (report.unresolved.length) {
            legacyBox.hidden = false;
            $('legacyMigrationText').textContent = report.unresolved.length + ' старых записей не имеют stable ID. Они сохранены отдельно и не превращены в canonical избранное/материалы по совпадению названия.';
        } else legacyBox.hidden = true;
    }

    async function renderAll() {
        await Promise.all(Object.keys(specs).map(renderCollection));
        await updateStats();
    }

    function showProfile(profile) {
        const name = profile.display_name || 'Паломник';
        $('profileDisplayName').textContent = name;
        $('profileDisplayEmail').textContent = profile.email || 'Локально на этом устройстве';
        $('profileGreeting').textContent = 'Добро пожаловать, ' + name + '!';
        $('profileName').value = name;
        $('profileEmail').value = profile.email || '';
    }

    function activateTab(id) {
        const target = document.getElementById(id) ? id : 'dashboard';
        document.querySelectorAll('.profile-menu a').forEach(function (link) {
            const active = link.dataset.tab === target; link.classList.toggle('active', active); link.setAttribute('aria-current', active ? 'page' : 'false');
        });
        document.querySelectorAll('.tab-content').forEach(function (tab) { tab.classList.toggle('active', tab.id === target); });
    }

    function accountErrorText(error) {
        const code = error && error.code ? error.code : '';
        const messages = {
            backend_unavailable: 'Backend недоступен. Локальный «Мой ПМ» продолжает работать.',
            invalid_credentials: 'Неверный email или пароль.',
            authentication_required: 'Сессия завершена. Войдите снова.',
            email_unavailable: 'Аккаунт с этим email уже существует.',
            invalid_email: 'Проверьте формат email.',
            invalid_password: 'Пароль должен содержать от 10 до 256 символов.',
            invalid_csrf: 'Сессия изменилась. Обновите статус аккаунта и повторите действие.',
            cross_origin_forbidden: 'Запрос отклонён защитой same-origin.',
            sync_conflict: 'Серверная копия изменилась на другом устройстве. Сначала обновите её состояние.',
            invalid_state_schema: 'Локальное состояние не соответствует поддерживаемой схеме.',
            invalid_local_state_contract: 'На сервер можно отправить только local-first состояние «Мой ПМ».',
            invalid_recovery_token: 'Код восстановления недействителен или истёк.',
            state_too_large: 'Локальная копия слишком велика для синхронизации.'
        };
        return messages[code] || 'Операция не выполнена' + (code ? ': ' + code : '.');
    }

    function setAccountStatus(id, text) { const el = $(id); if (el) el.textContent = text || ''; }
    function setAccountEnabled(enabled) {
        ['accountLogin', 'accountRegister', 'accountRecoveryRequest', 'accountRecoveryReset'].forEach(function (id) { if ($(id)) $(id).disabled = !enabled; });
    }
    function ask(message) { return typeof window.confirm === 'function' ? window.confirm(message) : true; }

    async function renderRemoteState() {
        if (!accountSnapshot.authenticated || !window.PravmirAccount) return;
        try {
            const remote = await window.PravmirAccount.getRemoteState();
            if (!remote.state) setAccountStatus('accountSyncStatus', 'В аккаунте пока нет серверной копии «Мой ПМ».');
            else setAccountStatus('accountSyncStatus', 'Серверная копия: ревизия ' + remote.revision + (remote.updated_at ? ' · ' + remote.updated_at : '') + '.');
        } catch (error) {
            setAccountStatus('accountSyncStatus', accountErrorText(error));
        }
    }

    function renderAccount(snapshot) {
        accountSnapshot = snapshot || { available: false, authenticated: false, user: null };
        const available = Boolean(accountSnapshot.available);
        const authenticated = available && Boolean(accountSnapshot.authenticated && accountSnapshot.user);
        setAccountEnabled(available);
        $('accountGuestCard').hidden = authenticated;
        $('accountSignedCard').hidden = !authenticated;
        $('accountSyncCard').hidden = !authenticated;
        $('accountDataCard').hidden = !authenticated;
        setAccountStatus('accountBackendStatus', available ? 'Backend доступен. API v1, local-first режим сохранён.' : 'Backend не запущен или недоступен. Это не мешает локальному «Мой ПМ».');
        if (authenticated) {
            const user = accountSnapshot.user;
            setAccountStatus('accountIdentity', user.email + ' · ' + user.id);
            $('serverDisplayName').value = user.display_name || '';
            $('serverCity').value = user.city || '';
            $('serverTimezone').value = user.timezone || '';
            $('recoveryEmail').value = user.email || $('recoveryEmail').value;
            $('myPmStatusText').textContent = 'Локальная копия остаётся основной на этом устройстве. Аккаунт подключён; серверная синхронизация выполняется только кнопками «Сохранить»/«Загрузить».';
        }
    }

    async function refreshAccount() {
        if (!window.PravmirAccount) {
            renderAccount({ available: false, authenticated: false, user: null });
            return accountSnapshot;
        }
        try {
            const snapshot = await window.PravmirAccount.init();
            renderAccount(snapshot);
            if (snapshot.authenticated) await renderRemoteState();
            return snapshot;
        } catch (error) {
            renderAccount({ available: false, authenticated: false, user: null });
            setAccountStatus('accountBackendStatus', accountErrorText(error));
            return accountSnapshot;
        }
    }

    async function doLogin() {
        setAccountStatus('accountAuthStatus', 'Вход…');
        try {
            const snapshot = await window.PravmirAccount.login($('accountEmail').value.trim(), $('accountPassword').value);
            $('accountPassword').value = '';
            renderAccount(snapshot); setAccountStatus('accountAuthStatus', ''); await renderRemoteState();
        } catch (error) { setAccountStatus('accountAuthStatus', accountErrorText(error)); }
    }

    async function doRegister() {
        setAccountStatus('accountAuthStatus', 'Создание аккаунта…');
        try {
            const localProfile = await window.PravmirMyPm.getProfile();
            const snapshot = await window.PravmirAccount.register({
                email: $('accountEmail').value.trim(),
                password: $('accountPassword').value,
                display_name: $('accountDisplayName').value.trim() || localProfile.display_name || 'Паломник'
            });
            $('accountPassword').value = '';
            renderAccount(snapshot); setAccountStatus('accountAuthStatus', ''); await renderRemoteState();
        } catch (error) { setAccountStatus('accountAuthStatus', accountErrorText(error)); }
    }

    async function doLogout() {
        try { await window.PravmirAccount.logout(); }
        catch (error) { if (!(error && error.status === 401)) { setAccountStatus('accountProfileStatus', accountErrorText(error)); return; } }
        renderAccount({ available: true, authenticated: false, user: null });
        setAccountStatus('accountSyncStatus', '');
    }

    async function saveServerProfile() {
        setAccountStatus('accountProfileStatus', 'Сохранение…');
        try {
            const user = await window.PravmirAccount.updateProfile({ display_name: $('serverDisplayName').value.trim(), city: $('serverCity').value.trim(), timezone: $('serverTimezone').value.trim() });
            accountSnapshot.user = user; accountSnapshot.authenticated = true; accountSnapshot.available = true;
            renderAccount(accountSnapshot); setAccountStatus('accountProfileStatus', 'Профиль аккаунта сохранён.');
        } catch (error) { setAccountStatus('accountProfileStatus', accountErrorText(error)); }
    }

    async function pushLocalState() {
        setAccountStatus('accountSyncStatus', 'Проверка серверной копии…');
        try {
            const remote = await window.PravmirAccount.getRemoteState();
            if (remote.revision > 0 && !ask('Серверная копия уже существует. Заменить её текущими локальными данными этого устройства?')) {
                setAccountStatus('accountSyncStatus', 'Синхронизация отменена.'); return;
            }
            const local = await window.PravmirMyPm.exportState();
            const saved = await window.PravmirAccount.pushLocalState(local);
            setAccountStatus('accountSyncStatus', 'Локальная копия сохранена в аккаунт. Ревизия ' + saved.revision + '.');
        } catch (error) { setAccountStatus('accountSyncStatus', accountErrorText(error)); }
    }

    async function pullRemoteState() {
        setAccountStatus('accountSyncStatus', 'Загрузка серверной копии…');
        try {
            const remote = await window.PravmirAccount.pullRemoteState();
            if (!remote.state) { setAccountStatus('accountSyncStatus', 'В аккаунте пока нет сохранённой копии.'); return; }
            if (!ask('Заменить локальные списки и профиль данными из аккаунта? Текущая локальная копия будет перезаписана.')) {
                setAccountStatus('accountSyncStatus', 'Восстановление отменено.'); return;
            }
            const before = await window.PravmirMyPm.exportState();
            const incoming = remote.state;
            incoming.local_user_id = before.local_user_id;
            incoming.storage_mode = 'device_local'; incoming.sync_status = 'local_only';
            await window.PravmirMyPm.importState(incoming);
            showProfile(await window.PravmirMyPm.getProfile());
            await renderAll();
            renderAccount(accountSnapshot);
            setAccountStatus('accountSyncStatus', 'Серверная копия восстановлена на этом устройстве. Локальный идентификатор устройства сохранён.');
        } catch (error) { setAccountStatus('accountSyncStatus', accountErrorText(error)); }
    }

    function downloadJson(payload, filename) {
        const body = JSON.stringify(payload, null, 2);
        if (!window.Blob || !window.URL || typeof window.URL.createObjectURL !== 'function') return false;
        const blob = new Blob([body], { type: 'application/json;charset=utf-8' });
        const href = window.URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = href; link.download = filename; link.hidden = true;
        document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(href); return true;
    }

    async function exportAccount() {
        setAccountStatus('accountDataStatus', 'Подготовка экспорта…');
        try {
            const payload = await window.PravmirAccount.exportAccount();
            if (!downloadJson(payload, 'pravmir-account-export.json')) setAccountStatus('accountDataStatus', 'Экспорт подготовлен, но браузер не поддерживает локальное скачивание через эту страницу.');
            else setAccountStatus('accountDataStatus', 'Экспорт JSON подготовлен.');
        } catch (error) { setAccountStatus('accountDataStatus', accountErrorText(error)); }
    }

    async function deleteAccount() {
        const password = $('accountDeletePassword').value;
        if (!ask('Удалить аккаунт и его серверную копию «Мой ПМ»? Локальные данные на этом устройстве останутся.')) return;
        setAccountStatus('accountDataStatus', 'Удаление…');
        try {
            await window.PravmirAccount.deleteAccount(password); $('accountDeletePassword').value = '';
            renderAccount({ available: true, authenticated: false, user: null });
            setAccountStatus('accountDataStatus', 'Аккаунт удалён. Локальные данные этого устройства сохранены.');
        } catch (error) { setAccountStatus('accountDataStatus', accountErrorText(error)); }
    }

    async function requestRecovery() {
        setAccountStatus('accountRecoveryStatus', 'Подготовка восстановления…');
        try {
            const payload = await window.PravmirAccount.requestRecovery($('recoveryEmail').value.trim());
            if (payload.dev_recovery_token) {
                $('recoveryToken').value = payload.dev_recovery_token;
                setAccountStatus('accountRecoveryStatus', 'Dev-режим: одноразовый код помещён в поле ниже. В production он должен доставляться отдельным каналом.');
            } else setAccountStatus('accountRecoveryStatus', payload.message || 'Если аккаунт существует, восстановление подготовлено.');
        } catch (error) { setAccountStatus('accountRecoveryStatus', accountErrorText(error)); }
    }

    async function resetRecoveryPassword() {
        setAccountStatus('accountRecoveryStatus', 'Смена пароля…');
        try {
            await window.PravmirAccount.resetPassword($('recoveryToken').value.trim(), $('recoveryPassword').value);
            $('recoveryToken').value = ''; $('recoveryPassword').value = '';
            setAccountStatus('accountRecoveryStatus', 'Пароль изменён. Все прежние серверные сессии завершены; войдите заново.');
            renderAccount({ available: true, authenticated: false, user: null });
        } catch (error) { setAccountStatus('accountRecoveryStatus', accountErrorText(error)); }
    }

    function bindAccountActions() {
        $('accountRefresh').addEventListener('click', refreshAccount);
        $('accountLogin').addEventListener('click', doLogin);
        $('accountRegister').addEventListener('click', doRegister);
        $('accountLogout').addEventListener('click', doLogout);
        $('accountSaveProfile').addEventListener('click', saveServerProfile);
        $('accountPush').addEventListener('click', pushLocalState);
        $('accountPull').addEventListener('click', pullRemoteState);
        $('accountExport').addEventListener('click', exportAccount);
        $('accountDelete').addEventListener('click', deleteAccount);
        $('accountRecoveryRequest').addEventListener('click', requestRecovery);
        $('accountRecoveryReset').addEventListener('click', resetRecoveryPassword);
    }

    async function init() {
        if (!window.PravmirMyPm) throw new Error('PravmirMyPm unavailable');
        await Promise.all([
            window.PravmirMyPm.init(),
            window.PravmirData && window.PravmirData.init ? window.PravmirData.init() : null,
            window.PravmirContent && window.PravmirContent.init ? window.PravmirContent.init() : null
        ]);
        showProfile(await window.PravmirMyPm.getProfile());
        await renderAll();
        activateTab(window.location.hash.slice(1));
        document.querySelectorAll('.profile-menu a').forEach(function (link) { link.addEventListener('click', function () { activateTab(link.dataset.tab); }); });
        window.addEventListener('hashchange', function () { activateTab(window.location.hash.slice(1)); });
        $('saveProfileSettings').addEventListener('click', async function () {
            const status = $('profileSaveStatus');
            try {
                const profile = await window.PravmirMyPm.updateProfile({
                    display_name: $('profileName').value.trim().slice(0, 60) || 'Паломник',
                    email: $('profileEmail').value.trim().slice(0, 160)
                });
                showProfile(profile); status.textContent = 'Сохранено на этом устройстве.';
            } catch (error) {
                console.warn('My PM profile save failed', error); status.textContent = 'Не удалось сохранить локальные настройки.';
            }
        });
        bindAccountActions();
        await refreshAccount();
    }

    document.addEventListener('DOMContentLoaded', function () {
        init().catch(function (error) {
            console.error('My PM init failed', error);
            const status = $('myPmStatusText'); if (status) status.textContent = 'Локальное хранилище недоступно. Данные профиля не изменены.';
        });
    });
})();
