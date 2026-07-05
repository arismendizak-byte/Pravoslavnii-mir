// ============================================
// УМНЫЙ КОМПОНЕНТ (с бургер-меню и overlay)
// ============================================

if (typeof CONFIG === 'undefined') {
    console.error('Ошибка: не загружен config.js!');
}

const currentPath = window.location.pathname;
const fileName = currentPath.split('/').pop();
const folder = currentPath.split('/').slice(0, -1).pop() || 'root';

function getPath(relativePath) {
    if (folder === 'root' || folder === 'pages' || folder === '') {
        return relativePath;
    } else {
        return '../' + relativePath;
    }
}

function buildNav() {
    let items = CONFIG.menuItems.top.map(item => 
        `<li><a href="${getPath(item.url)}">${item.title}</a></li>`
    ).join('');

    // Бургер-меню ТОЛЬКО для навигации по сайту (выбор карт убран отсюда)
    const burgerItems = `
        <li><a href="${getPath('profile.html')}">Профиль</a></li>
        <li><a href="${getPath('calendar.html')}">Календарь</a></li>
        <li><a href="${getPath('about.html')}">О проекте</a></li>
        <li><a href="#">Духовная литература</a></li>
        <li><a href="#">Поддержать проект</a></li>
        <li><a href="#">Обратная связь</a></li>
        <li><a href="#">Новости</a></li>
    `;

    return `
    <nav>
        <a href="${getPath('index.html')}" class="nav-logo">
            <svg class="nav-logo-cross" viewBox="0 0 28 32" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect x="12.5" y="1" width="3" height="30" rx="0.5" fill="#C8941A"/>
                <rect x="9.5" y="4" width="9" height="3" rx="0.5" fill="#C8941A"/>
                <rect x="4.5" y="9" width="19" height="3" rx="0.5" fill="#C8941A"/>
                <rect x="9.5" y="21" width="9" height="3" rx="0.5" fill="#C8941A"/>
            </svg>
            <span class="nav-logo-text">Православный<br>Мир</span>
        </a>
        
        <ul class="nav-links">${items}</ul>
        
        <button class="burger-btn" id="burgerBtn" aria-label="Открыть меню">
            <span></span><span></span><span></span>
        </button>
        
        <div class="mobile-menu" id="mobileMenu">
            <ul class="mobile-links">
                ${burgerItems}
            </ul>
        </div>

        <div class="mobile-overlay" id="mobileOverlay"></div>
        
        <div class="nav-actions">
            <a href="${getPath('profile.html')}" class="btn-nav btn-ghost" style="margin-right: 6px;">Профиль</a>
            <a href="#" class="btn-nav btn-gold">Добавить место</a>
        </div>
    </nav>
    `;
}

function buildBottomNav() {
    let items = CONFIG.menuItems.bottom.map(item => {
        let activeClass = '';
        if (item.url === fileName || (fileName === '' && item.url === 'index.html')) {
            activeClass = ' active';
        }
        return `<a href="${getPath(item.url)}" class="bottom-nav-item${activeClass}">
                    <span class="bottom-nav-icon">${item.icon}</span>
                    <span>${item.title}</span>
                </a>`;
    }).join('');

    return `<div class="bottom-nav">${items}</div>`;
}

function buildFooter() {
    const year = new Date().getFullYear();
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
                <p class="footer-tagline">Духовное наследие в каждом шаге. Путеводитель по святым местам.</p>
                <div class="footer-social">
                    <a href="${CONFIG.social.vk}" class="social-btn">ВК</a>
                    <a href="${CONFIG.social.tg}" class="social-btn">ТГ</a>
                    <a href="${CONFIG.social.youtube}" class="social-btn">ЮТ</a>
                    <a href="${CONFIG.social.ok}" class="social-btn">ОК</a>
                </div>
            </div>
            <div>
                <div class="footer-col-title">Навигация</div>
                <ul class="footer-links">
                    <li><a href="${getPath('catalog/catalog.html')}">Каталог</a></li>
                    <li><a href="#">Карта святынь</a></li>
                    <li><a href="${getPath('routes/routes.html')}">Маршруты</a></li>
                    <li><a href="#">Святые</a></li>
                    <li><a href="#">Иконы</a></li>
                </ul>
            </div>
            <div>
                <div class="footer-col-title">Материалы</div>
                <ul class="footer-links">
                    <li><a href="${getPath('journal.html')}">Журнал</a></li>
                    <li><a href="${getPath('calendar.html')}">Календарь</a></li>
                    <li><a href="${getPath('holiness.html')}">Святыни</a></li>
                    <li><a href="#">Для паломника</a></li>
                    <li><a href="#">Сообщество</a></li>
                </ul>
            </div>
            <div>
                <div class="footer-col-title">О проекте</div>
                <ul class="footer-links">
                    <li><a href="${getPath('about.html')}">О нас</a></li>
                    <li><a href="#">Партнёрам</a></li>
                    <li><a href="#">Контакты</a></li>
                    <li><a href="#">Добавить место</a></li>
                </ul>
            </div>
            <div>
                <div class="footer-col-title">Будьте в курсе</div>
                <div class="footer-newsletter">
                    <p>Новые маршруты и интересные места — в вашей почте.</p>
                    <div class="newsletter-form">
                        <input type="email" placeholder="Ваш e-mail">
                        <button>&rarr;</button>
                    </div>
                </div>
            </div>
        </div>
        <div class="footer-bottom">
            <span class="footer-copy">&copy; ${year} ${CONFIG.siteName} &middot; Путеводитель по святым местам</span>
            <div class="footer-legal">
                <a href="#">Конфиденциальность</a>
                <a href="#">Условия</a>
                <a href="#">Карта сайта</a>
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

    const burgerBtn = document.getElementById('burgerBtn');
    const mobileMenu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileOverlay');

    if (burgerBtn && mobileMenu && overlay) {
        burgerBtn.addEventListener('click', function() {
            this.classList.toggle('active');
            mobileMenu.classList.toggle('open');
            overlay.classList.toggle('open');
        });

        overlay.addEventListener('click', function() {
            burgerBtn.classList.remove('active');
            mobileMenu.classList.remove('open');
            overlay.classList.remove('open');
        });

        mobileMenu.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', function() {
                burgerBtn.classList.remove('active');
                mobileMenu.classList.remove('open');
                overlay.classList.remove('open');
            });
        });
    }

    document.addEventListener('click', function(e) {
        if (!burgerBtn || !mobileMenu) return;
        if (mobileMenu.classList.contains('open')) {
            const isClickOnBurger = burgerBtn.contains(e.target);
            const isClickInsideMenu = mobileMenu.contains(e.target);
            if (!isClickOnBurger && !isClickInsideMenu) {
                burgerBtn.classList.remove('active');
                mobileMenu.classList.remove('open');
                if (overlay) overlay.classList.remove('open');
            }
        }
    });

    // ============================================
    // ОБРАБОТЧИК ЛОКАЛЬНОГО ПЕРЕКЛЮЧАТЕЛЯ КАРТ (ТОЛЬКО ЗДЕСЬ)
    // ============================================
    const switcherBtn = document.getElementById('mapSwitcherBtn');
    const switcherMenu = document.getElementById('mapSwitcherMenu');

    if (switcherBtn && switcherMenu) {
        switcherBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            this.classList.toggle('active');
            switcherMenu.classList.toggle('active');
        });

        document.addEventListener('click', function(e) {
            const wrapper = document.querySelector('.map-switcher-wrapper');
            if (wrapper && !wrapper.contains(e.target)) {
                switcherBtn.classList.remove('active');
                switcherMenu.classList.remove('active');
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
    if (switcherBtn) switcherBtn.classList.remove('active');
    if (switcherMenu) switcherMenu.classList.remove('active');

    // Перерисовываем нашу карту, если переключились на неё
    if (targetId === 'map-our' && window.pravmirMap) {
        setTimeout(() => window.pravmirMap.invalidateSize(), 150);
    }
};