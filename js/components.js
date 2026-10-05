// ============================================
// УМНЫЙ КОМПОНЕНТ (с бургер-меню и overlay)
// ============================================

if (typeof CONFIG === 'undefined') {
    console.error('Ошибка: не загружен config.js!');
}

const currentPath = window.location.pathname;
const fileName = currentPath.split('/').pop();
const folder = currentPath.split('/').slice(0, -1).pop() || 'root';

// Папки первого уровня, из которых нужен переход на корень проекта.
const nestedFolders = new Set(['catalog', 'routes', 'objects', 'articles', 'calendar', 'events', 'food', 'pilgrim']);
const sectionLanding = {
    catalog: 'catalog/catalog.html',
    routes: 'routes/routes.html',
    objects: 'catalog/catalog.html',
    articles: 'journal.html',
    calendar: 'calendar.html',
    events: 'events.html',
    food: 'food.html',
    pilgrim: 'routes/routes.html'
};

function itemPath(value) {
    return String(value || '').split('#')[0].split('?')[0].replace(/^\.\//, '');
}

function isCurrentItem(value) {
    const target = itemPath(value);
    if (!target || target === '#') return false;
    const path = decodeURIComponent(currentPath || '').replace(/\/+$/, '');
    const home = fileName === '' || fileName === 'index.html';
    const targetHash = String(value).includes('#') ? String(value).slice(String(value).indexOf('#')) : '';
    if (target === 'index.html' && home) {
        return targetHash === '#map' ? window.location.hash === '#map' : !targetHash && window.location.hash !== '#map';
    }
    if (path.endsWith('/' + target)) return true;
    if (sectionLanding[folder] === target) return true;
    // Группировка основных пяти направлений не меняет URL доменных страниц.
    if (target === 'catalog/catalog.html') {
        return ['objects', 'articles', 'food'].includes(folder) || ['holiness.html', 'journal.html', 'news.html', 'food.html'].includes(fileName);
    }
    if (target === 'index.html' && !targetHash) {
        return ['calendar', 'events'].includes(folder) || ['calendar.html', 'events.html'].includes(fileName);
    }
    return false;
}

function navIcon(name) {
    const paths = {
        sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.4 1.4m11.2 11.2L19 19M5 19l1.4-1.4M17.6 6.4L19 5"/>',
        pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
        compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
        route: '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v5a3 3 0 0 0 3 3h6a3 3 0 0 0 0-6h-2m5 8v-3"/>',
        user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
        cross: '<path d="M12 2v20M9 5h6M5 9h14M8 17l8 2"/>',
        book: '<path d="M12 5v16M12 5C9 3 5 3 2 4v15c3-1 7-1 10 2 3-3 7-3 10-2V4c-3-1-7-1-10 1Z"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2"/>',
        food: '<path d="M4 3v6a3 3 0 0 0 6 0V3M7 3v18M19 3c-3 2-4 5-4 9h4m0-9v18"/>',
        info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
        mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
        heart: '<path d="M20 4a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 0 8 8 16 8-8 12-12 8-16Z"/>',
        settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="currentColor"/><circle cx="16" cy="12" r="2" fill="currentColor"/><circle cx="10" cy="18" r="2" fill="currentColor"/>'
    };
    return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name] || paths.compass}</svg>`;
}

function menuLink(item) {
    return `<li><a data-nav-url="${item.url}" href="${getPath(item.url)}"${isCurrentItem(item.url) ? ' class="active" aria-current="page"' : ''}>${navIcon(item.icon)}<span>${item.title}</span></a></li>`;
}

window.PravmirUI = {
    icon: navIcon,
    statusLabel: function(value) {
        return ({system_derived:'Календарная дата',legacy_unverified:'Требует проверки источника',legacy_curated:'Из прежней версии · источник требует проверки',system_defined:'Системная категория',source_verified:'Источник проверен',verified_organisation:'Подтверждено организацией',community_unverified:'Данные сообщества · требуют проверки',editorial_verified:'Проверено редакцией',editorial_guidance:'Редакционная рекомендация',scheduled:'Запланировано',cancelled:'Отменено',postponed:'Перенесено',completed:'Завершено',draft:'Черновик'})[value] || 'Статус уточняется';
    },
    dateLabel: function(value, timezone) {
        if (!value) return '—';
        const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(String(value));
        const date = new Date(dateOnly ? value + 'T12:00:00' : value);
        if (!Number.isFinite(date.getTime())) return String(value);
        const opts = {day:'numeric',month:'long',year:'numeric'};
        if (!dateOnly) { opts.hour = '2-digit'; opts.minute = '2-digit'; if (timezone) opts.timeZone = timezone; }
        try { return date.toLocaleString('ru-RU', opts); } catch (_) { return String(value); }
    },
    eventTime: function(row) {
        const t = row.temporal || {};
        if (!t.starts_at) return 'Дата не указана';
        const format = window.PravmirUI.dateLabel;
        const start = t.all_day ? String(t.starts_at).slice(0,10) : t.starts_at;
        const end = t.ends_at ? (t.all_day ? String(t.ends_at).slice(0,10) : t.ends_at) : '';
        return format(start, t.timezone) + (end && end !== start ? ' — ' + format(end, t.timezone) : '') +
            (t.all_day ? ' · весь день' : (t.timezone ? ' · ' + t.timezone : ''));
    }
};

function getPath(relativePath) {
    const value = String(relativePath ?? '');

    // Якоря, внешние ссылки и специальные URL не изменяем.
    if (
        value === '' ||
        value === '#' ||
        value.startsWith('#') ||
        /^(https?:|mailto:|tel:|\/)/i.test(value)
    ) {
        return value;
    }

    // Страницы в корне проекта используют путь напрямую.
    if (!nestedFolders.has(folder)) {
        return value;
    }

    // Страницы во вложенных папках поднимаются на уровень корня.
    return '../' + value;
}

function buildNav() {
    let items = CONFIG.menuItems.top.map(item =>
        `<li><a data-nav-url="${item.url}" href="${getPath(item.url)}"${isCurrentItem(item.url) ? ' class="active" aria-current="page"' : ''}>${item.title}</a></li>`
    ).join('');

    const primaryItems = CONFIG.menuItems.top.map(menuLink).join('');
    const burgerItems = (CONFIG.menuItems.secondary || []).map(menuLink).join('') +
        `<li><a href="mailto:${CONFIG.siteEmail}">${navIcon('mail')}<span>Обратная связь</span></a></li>`;

    return `
    <a class="skip-link" href="#main-content">Перейти к содержимому</a>
    <nav class="site-nav" aria-label="Основная навигация">
        <a href="${getPath('index.html')}" class="nav-logo">
            <svg class="nav-logo-cross" viewBox="0 0 28 32" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                <rect x="12.5" y="1" width="3" height="30" rx="0.5" fill="#C8941A"/>
                <rect x="9.5" y="4" width="9" height="3" rx="0.5" fill="#C8941A"/>
                <rect x="4.5" y="9" width="19" height="3" rx="0.5" fill="#C8941A"/>
                <rect x="9.5" y="21" width="9" height="3" rx="0.5" fill="#C8941A"/>
            </svg>
            <span class="nav-logo-text">Православный<br>Мир</span>
        </a>
        
        <ul class="nav-links">${items}</ul>
        
        <button type="button" class="burger-btn" id="burgerBtn" aria-label="Все разделы" aria-expanded="false" aria-controls="mobileMenu">
            <span></span><span></span><span></span>
        </button>
    </nav>

        <div class="mobile-menu" id="mobileMenu" hidden>
            <div class="menu-heading">Православный Мир</div>
            <ul class="mobile-links mobile-primary">${primaryItems}</ul>
            <div class="menu-caption">Разделы путеводителя</div>
            <ul class="mobile-links">${burgerItems}</ul>
        </div>

        <div class="mobile-overlay" id="mobileOverlay" aria-hidden="true" hidden></div>
    `;
}

function buildBottomNav() {
    let items = CONFIG.menuItems.bottom.map(item => {
        let activeClass = '';
        if (isCurrentItem(item.url)) {
            activeClass = ' active';
        }
        const label = item.title === 'Паломничество' ? 'Паломни<wbr>чество' : item.title === 'Исследовать' ? 'Исследо<wbr>вать' : item.title;
        return `<a data-nav-url="${item.url}" href="${getPath(item.url)}" class="bottom-nav-item${activeClass}"${activeClass ? ' aria-current="page"' : ''}>
                    <span class="bottom-nav-icon">${navIcon(item.icon)}</span>
                    <span class="bottom-nav-label">${label}</span>
                </a>`;
    }).join('');

    return `<nav class="bottom-nav" aria-label="Быстрые разделы">${items}</nav>`;
}

function buildFooter() {
    const year = new Date().getFullYear();
    const socialLinks = Object.entries(CONFIG.social || {}).filter(function(entry) {
        return entry[1] && entry[1] !== '#';
    }).map(function(entry) {
        return `<a href="${entry[1]}" class="social-btn" target="_blank" rel="noopener noreferrer">${entry[0].toUpperCase()}</a>`;
    }).join('');
    return `
    <footer>
        <div class="footer-grid">
            <div class="footer-brand">
                <div class="footer-logo">
                    <svg width="28" height="32" viewBox="0 0 28 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <rect x="12.5" y="1" width="3" height="30" rx="0.5" fill="#C8941A"/>
                        <rect x="9.5" y="4" width="9" height="3" rx="0.5" fill="#C8941A"/>
                        <rect x="4.5" y="9" width="19" height="3" rx="0.5" fill="#C8941A"/>
                        <rect x="9.5" y="21" width="9" height="3" rx="0.5" fill="#C8941A"/>
                    </svg>
                    <span class="footer-brand-text">${CONFIG.siteName}</span>
                </div>
                <p class="footer-tagline">Календарь, чтение и паломничество. Православный мир — ближе каждый день.</p>
                ${socialLinks ? `<div class="footer-social">${socialLinks}</div>` : ''}
            </div>
            <div>
                <div class="footer-col-title">Навигация</div>
                <ul class="footer-links">
                    <li><a href="${getPath('catalog/catalog.html')}">Каталог</a></li>
                    <li><a href="${getPath('index.html#map')}">Карта святынь</a></li>
                    <li><a href="${getPath('routes/routes.html')}">Маршруты</a></li>
                    <li><a href="${getPath('holiness.html?type=saint')}">Святые</a></li>
                    <li><a href="${getPath('holiness.html?type=icon')}">Иконы</a></li>
                </ul>
            </div>
            <div>
                <div class="footer-col-title">Материалы</div>
                <ul class="footer-links">
                    <li><a href="${getPath('journal.html')}">Журнал</a></li>
                    <li><a href="${getPath('news.html')}">Новости</a></li>
                    <li><a href="${getPath('calendar.html')}">Календарь</a></li>
                    <li><a href="${getPath('events.html')}">События</a></li>
                    <li><a href="${getPath('food.html')}">Православная кухня</a></li>
                    <li><a href="${getPath('holiness.html')}">Святыни</a></li>
                    <li><a href="${getPath('routes/routes.html?tab=services')}">Для паломника</a></li>
                </ul>
            </div>
            <div>
                <div class="footer-col-title">О проекте</div>
                <ul class="footer-links">
                    <li><a href="${getPath('about.html')}">О нас</a></li>
                    <li><a href="mailto:${CONFIG.siteEmail}">Контакты</a></li>
                </ul>
            </div>
            <div>
                <div class="footer-col-title">Будьте в курсе</div>
                <div class="footer-newsletter">
                    <p>Подписки и уведомления готовятся. Пока можно сохранять места и статьи на этом устройстве.</p>
                    <a class="footer-profile-link" href="${getPath('profile.html')}">Мой ПМ →</a>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            <span class="footer-copy">&copy; ${year} ${CONFIG.siteName} &middot; Путеводитель по святым местам</span>
            <div class="footer-legal">
                <span>Проект развивается · данные могут требовать проверки</span>
            </div>
        </div>
    </footer>
    `;
}

document.addEventListener('DOMContentLoaded', function() {
    const navContainer = document.getElementById('nav-container');
    if (navContainer) {
        navContainer.innerHTML = buildNav();
    }
    const bottomNavContainer = document.getElementById('bottom-nav-container');
    if (bottomNavContainer) {
        bottomNavContainer.innerHTML = buildBottomNav();
    }
    const footerContainer = document.getElementById('footer-container');
    if (footerContainer) {
        footerContainer.innerHTML = buildFooter();
    }

    const main = document.querySelector('main, .page-section, .hero');
    if (main) {
        if (!main.id) main.id = 'main-content';
        main.tabIndex = -1;
        if (main.tagName !== 'MAIN') main.setAttribute('role', 'main');
        const skipLink = document.querySelector('.skip-link');
        if (skipLink) skipLink.href = '#' + main.id;
    }
    document.querySelectorAll('input:not([type="hidden"]), select, textarea').forEach(function(field) {
        const hasLabel = field.id && Array.from(document.querySelectorAll('label')).some(label => label.htmlFor === field.id);
        if (!hasLabel && !field.hasAttribute('aria-label') && !field.hasAttribute('aria-labelledby')) {
            const name = field.getAttribute('placeholder') || (field.options && field.options[0] && field.options[0].textContent);
            if (name) field.setAttribute('aria-label', name);
        }
    });
    document.querySelectorAll('[data-ui-icon]').forEach(function(node) {
        node.innerHTML = navIcon(node.getAttribute('data-ui-icon'));
        node.setAttribute('aria-hidden', 'true');
    });
    document.querySelectorAll('.place-card-img img, .gallery-slide img, .route-card-img img').forEach(function(img) {
        img.decoding = 'async';
        if (!img.loading) img.loading = 'lazy';
        function showFallback() {
            if (img.hidden) return;
            img.hidden = true;
            const note = document.createElement('span');
            note.className = 'image-fallback';
            note.innerHTML = navIcon('cross');
            const text = document.createElement('span');
            text.textContent = 'Фото недоступно';
            note.appendChild(text);
            img.parentNode.appendChild(note);
        }
        img.addEventListener('error', showFallback);
        if (img.complete && !img.naturalWidth) showFallback();
    });
    window.addEventListener('hashchange', function() {
        document.querySelectorAll('[data-nav-url]').forEach(function(link) {
            const active = isCurrentItem(link.getAttribute('data-nav-url'));
            link.classList.toggle('active', active);
            if (active) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
    });

    const burgerBtn = document.getElementById('burgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileOverlay');

    if (burgerBtn && mobileMenu && overlay) {
        function setMenu(open, returnFocus) {
            burgerBtn.classList.toggle('active', open);
            burgerBtn.setAttribute('aria-expanded', String(open));
            burgerBtn.setAttribute('aria-label', open ? 'Закрыть меню' : 'Все разделы');
            mobileMenu.hidden = !open;
            overlay.hidden = !open;
            mobileMenu.classList.toggle('open', open);
            overlay.classList.toggle('open', open);
            document.body.classList.toggle('menu-open', open);
            if (open) mobileMenu.querySelector('a')?.focus();
            else if (returnFocus) burgerBtn.focus();
        }
        burgerBtn.addEventListener('click', function() { setMenu(mobileMenu.hidden, true); });
        overlay.addEventListener('click', function() { setMenu(false, true); });
        mobileMenu.querySelectorAll('a').forEach(function(link) {
            link.addEventListener('click', function() { setMenu(false, true); });
        });
        document.addEventListener('keydown', function(e) {
            if (mobileMenu.hidden) return;
            if (e.key === 'Escape') { e.preventDefault(); setMenu(false, true); }
            if (e.key === 'Tab') {
                const links = Array.from(mobileMenu.querySelectorAll('a')).filter(link => link.getClientRects().length);
                const nodes = [burgerBtn].concat(links);
                const index = nodes.indexOf(document.activeElement);
                if (e.shiftKey && index <= 0) { e.preventDefault(); nodes[nodes.length - 1].focus(); }
                else if (!e.shiftKey && (index === nodes.length - 1 || index < 0)) { e.preventDefault(); burgerBtn.focus(); }
            }
        });
        document.addEventListener('click', function(e) {
            if (!mobileMenu.hidden && !burgerBtn.contains(e.target) && !mobileMenu.contains(e.target)) setMenu(false, true);
        });
    }

    // ============================================
    // ОБРАБОТЧИК ЛОКАЛЬНОГО ПЕРЕКЛЮЧАТЕЛЯ КАРТ (ТОЛЬКО ЗДЕСЬ)
    // ============================================
    const switcherBtn = document.getElementById('mapSwitcherBtn');
    const switcherMenu = document.getElementById('mapSwitcherMenu');

    if (switcherBtn && switcherMenu) {
        switcherBtn.setAttribute('aria-expanded', 'false');
        switcherBtn.setAttribute('aria-controls', 'mapSwitcherMenu');
        switcherBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.classList.toggle('active');
            switcherMenu.classList.toggle('active');
            switcherBtn.setAttribute('aria-expanded', String(switcherMenu.classList.contains('active')));
        });

        document.addEventListener('click', function(e) {
            const wrapper = document.querySelector('.map-switcher-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                switcherBtn.classList.remove('active');
                switcherMenu.classList.remove('active');
                switcherBtn.setAttribute('aria-expanded', 'false');
            }
        });
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && switcherMenu.classList.contains('active')) {
                switcherMenu.classList.remove('active');
                switcherBtn.classList.remove('active');
                switcherBtn.setAttribute('aria-expanded', 'false');
                switcherBtn.focus();
            }
        });
    }

    // ============================================
    // СЛАЙДЕРЫ
    // ============================================
    document.querySelectorAll('.object-gallery').forEach(function(gallery) {
        var slidesContainer = gallery.querySelector('.gallery-slides');
        if (!slidesContainer) return;

        var slides = slidesContainer.querySelectorAll('.gallery-slide');
        if (slides.length < 2) return;

        var nav = gallery.querySelector('.gallery-nav');
        var prevBtn = gallery.querySelector('.gallery-arrow.prev');
        var nextBtn = gallery.querySelector('.gallery-arrow.next');

        var currentSlide = 0;
        var autoTimer = null;

        if (nav) {
            nav.innerHTML = '';
            slides.forEach(function(_, index) {
                var dot = document.createElement('div');
                dot.className = 'gallery-dot' + (index === 0 ? ' active' : '');
                dot.addEventListener('click', function() {
                    goToSlide(index);
                });
                nav.appendChild(dot);
            });
        }

        function updateSlide() {
            var offset = -currentSlide * 100;
            slidesContainer.style.transition = 'transform 0.5s ease-in-out';
            slidesContainer.style.transform = 'translateX(' + offset + '%)';

            if (nav) {
                var dots = nav.querySelectorAll('.gallery-dot');
                dots.forEach(function(dot, i) {
                    dot.classList.toggle('active', i === currentSlide);
                });
            }
        }

        function changeSlide(direction) {
            currentSlide = (currentSlide + direction + slides.length) % slides.length;
            updateSlide();
            resetAuto();
        }

        function goToSlide(index) {
            currentSlide = index;
            updateSlide();
            resetAuto();
        }

        function resetAuto() {
            if (autoTimer) {
                clearInterval(autoTimer);
                autoTimer = null;
            }
            autoTimer = setInterval(function() {
                changeSlide(1);
            }, 5000);
        }

        if (prevBtn) {
            prevBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                changeSlide(-1);
            });
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', function(e) {
                e.stopPropagation();
                changeSlide(1);
            });
        }

        var startX = 0;
        var isDragging = false;

        gallery.addEventListener('touchstart', function(e) {
            startX = e.changedTouches[0].screenX;
            isDragging = true;
            slidesContainer.style.transition = 'none';
        }, { passive: true });

        gallery.addEventListener('touchmove', function(e) {
            if (!isDragging) return;
            var diff = startX - e.changedTouches[0].screenX;
            var offset = -currentSlide * 100 - (diff / gallery.offsetWidth * 100);
            slidesContainer.style.transform = 'translateX(' + offset + '%)';
        }, { passive: true });

        gallery.addEventListener('touchend', function(e) {
            if (!isDragging) return;
            isDragging = false;
            var diff = startX - e.changedTouches[0].screenX;
            slidesContainer.style.transition = 'transform 0.5s ease-in-out';
            if (Math.abs(diff) > 50) {
                if (diff > 0) {
                    changeSlide(1);
                } else {
                    changeSlide(-1);
                }
            } else {
                updateSlide();
            }
            resetAuto();
        }, { passive: true });

        gallery.addEventListener('mouseenter', function() {
            if (autoTimer) {
                clearInterval(autoTimer);
                autoTimer = null;
            }
        });

        gallery.addEventListener('mouseleave', function() {
            resetAuto();
        });

        updateSlide();
        resetAuto();

        if (prevBtn) prevBtn.style.display = 'flex';
        if (nextBtn) nextBtn.style.display = 'flex';
        if (nav) nav.style.display = 'flex';
    });
});

// ============================================
// ФУНКЦИИ ДЛЯ СТРАНИЦ ОБЪЕКТОВ
// ============================================

window.goToMap = function(lat, lon, name, link = '#') {
    sessionStorage.setItem('mapTarget', JSON.stringify({ lat, lon, name, link }));
    window.location.href = '../index.html#map';
};

window.planRoute = function(lat, lon, name) {
    sessionStorage.setItem('mapRoute', JSON.stringify({ lat, lon, name }));
    setTimeout(() => {
        window.location.href = '../index.html#route';
    }, 50);
};

window.openGPS = function(lat, lon, name) {
    const yandexUrl = `https://yandex.ru/maps/?rtext=~${lat},${lon}&utm_source=pravmir`;
    const googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`;
    
    if (confirm(`Открыть маршрут до "${name}" в Яндекс.Картах для голосовой навигации?`)) {
        window.open(yandexUrl, '_blank');
    } else {
        window.open(googleUrl, '_blank');
    }
};

// ============================================
// ПЕРЕКЛЮЧЕНИЕ КАРТ (ВЫНЕСЕНО СЮДА)
// ============================================

window.switchMapTab = function(targetId, label) {
    const mapViews = document.querySelectorAll('.map-view');
    mapViews.forEach(view => view.classList.remove('active'));
    
    const targetView = document.getElementById(targetId);
    if (targetView) {
        targetView.classList.add('active');
    }

    // Обновляем текст на кнопке переключателя
    const currentLabel = document.getElementById('currentMapLabel');
    if (currentLabel && label) {
        currentLabel.textContent = label;
    }

    // Закрываем выпадающее меню
    const switcherBtn = document.getElementById('mapSwitcherBtn');
    const switcherMenu = document.getElementById('mapSwitcherMenu');
    if (switcherBtn) { switcherBtn.classList.remove('active'); switcherBtn.setAttribute('aria-expanded', 'false'); }
    if (switcherMenu) switcherMenu.classList.remove('active');

    // Перерисовываем нашу карту, если переключились на неё
    if (targetId === 'map-our' && window.pravmirMap) {
        setTimeout(() => window.pravmirMap.invalidateSize(), 150);
    }

    try {
        window.dispatchEvent(new CustomEvent('pravmir:maptab', { detail: { targetId: targetId, label: label || '' } }));
    } catch (e) {}
};
