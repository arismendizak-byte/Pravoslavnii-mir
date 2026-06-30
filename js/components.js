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
            <!-- ПРАВОСЛАВНЫЙ ВОСЬМИКОНЕЧНЫЙ КРЕСТ (ПРЯМАЯ НИЖНЯЯ ПЕРЕКЛАДИНА) -->
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
    // СЛАЙДЕРЫ (единый код для ПК и мобилок)
    // ============================================
    document.querySelectorAll('.object-gallery').forEach(gallery => {
        const slides = gallery.querySelectorAll('.gallery-slide');
        const nav = gallery.querySelector('.gallery-nav');
        const prevBtn = gallery.querySelector('.gallery-arrow.prev');
        const nextBtn = gallery.querySelector('.gallery-arrow.next');
        let currentSlide = 0;

        if (!nav || slides.length === 0) return;

        slides.forEach((_, index) => {
            const dot = document.createElement('div');
            dot.className = 'gallery-dot' + (index === 0 ? ' active' : '');
            dot.onclick = () => goToSlide(index);
            nav.appendChild(dot);
        });

        function updateSlide() {
            const offset = -currentSlide * 100;
            gallery.style.transform = `translateX(${offset}%)`;
            nav.querySelectorAll('.gallery-dot').forEach((dot, i) => {
                dot.classList.toggle('active', i === currentSlide);
            });
        }

        function changeSlide(direction) {
            currentSlide = (currentSlide + direction + slides.length) % slides.length;
            updateSlide();
        }

        function goToSlide(index) {
            currentSlide = index;
            updateSlide();
        }

        if (prevBtn) prevBtn.addEventListener('click', () => changeSlide(-1));
        if (nextBtn) nextBtn.addEventListener('click', () => changeSlide(1));

        let autoSlide = setInterval(() => changeSlide(1), 5000);
        gallery.addEventListener('mouseenter', () => clearInterval(autoSlide));
        gallery.addEventListener('mouseleave', () => {
            autoSlide = setInterval(() => changeSlide(1), 5000);
        });
    });
});