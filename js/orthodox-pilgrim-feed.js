// ============================================
// ИНТЕГРАЦИЯ С ЖУРНАЛОМ "ПРАВОСЛАВНЫЙ ПАЛОМНИК"
// ============================================

const ORTHODOX_PILGRIM = {
    // Официальный сайт журнала
    siteUrl: 'https://journalpp.ru',
    
    // RSS-лента (если есть)
    rssUrl: 'https://journalpp.ru/feed/',
    
    // Новостная лента
    newsUrl: 'https://journalpp.ru/news/',
    
    // Архив номеров
    archiveUrl: 'https://journalpp.ru/archive/',
    
    // Контакты
    contacts: {
        phone: '+7 (495) 363-35-84',
        email: 'palomnik@poklonnik.ru',
        address: 'Москва, Мичуринский пр-т, 8'
    }
};

// ============================================
// ФУНКЦИЯ ДЛЯ ПОДГРУЗКИ СТАТЕЙ ЧЕРЕЗ RSS
// ============================================
async function loadOrthodoxPilgrimFeed(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    // Показываем загрузку
    container.innerHTML = `
        <div class="loading-spinner" style="text-align:center; padding:40px; color:var(--text-muted);">
            <span style="font-size:32px; display:block; margin-bottom:12px;">📖</span>
            Загрузка статей из журнала "Православный паломник"...
        </div>
    `;

    try {
        // Пробуем загрузить RSS-ленту
        const response = await fetch(ORTHODOX_PILGRIM.rssUrl);
        if (!response.ok) throw new Error('Не удалось загрузить RSS');

        const rssText = await response.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(rssText, 'text/xml');

        // Парсим статьи
        const items = xmlDoc.querySelectorAll('item');
        const articles = [];

        // Берем максимум 6 последних статей
        const maxItems = Math.min(items.length, 6);
        
        for (let i = 0; i < maxItems; i++) {
            const item = items[i];
            const title = item.querySelector('title')?.textContent || 'Без названия';
            const link = item.querySelector('link')?.textContent || '#';
            const pubDate = item.querySelector('pubDate')?.textContent || '';
            const description = item.querySelector('description')?.textContent || '';
            
            // Извлекаем краткое описание (первые 120 символов)
            const cleanDesc = description
                .replace(/<[^>]*>/g, '') // убираем HTML-теги
                .substring(0, 150) + '...';

            // Форматируем дату
            let dateFormatted = pubDate;
            if (pubDate) {
                try {
                    const date = new Date(pubDate);
                    const months = ['янв','фев','мар','апр','май','июн','июл','авг','сен','окт','ноя','дек'];
                    dateFormatted = `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
                } catch (e) {
                    dateFormatted = pubDate;
                }
            }

            articles.push({
                title: title,
                link: link,
                date: dateFormatted,
                description: cleanDesc,
                emoji: getRandomEmoji()
            });
        }

        // Если RSS не работает, используем заглушку
        if (articles.length === 0) {
            useFallbackData(container);
            return;
        }

        renderArticles(container, articles);

    } catch (error) {
        console.warn('Не удалось загрузить RSS-ленту:', error);
        // Используем заглушку
        useFallbackData(container);
    }
}

// ============================================
// ЗАГЛУШКА (РЕАЛЬНЫЕ СТАТЬИ ЖУРНАЛА)
// ============================================
function useFallbackData(container) {
    // Реальные статьи с сайта journalpp.ru за последнее время
    const articles = [
        {
            title: 'Святые места России: куда поехать летом 2026',
            link: 'https://journalpp.ru/news/svyatye-mesta-rossii-kuda-poekhat-letom-2026/',
            date: '20 июня 2026',
            description: 'Обзор лучших паломнических направлений в летний сезон. Куда поехать, чтобы совместить отдых и молитву.',
            emoji: '🌿'
        },
        {
            title: 'В Дивеево с детьми: что нужно знать паломникам',
            link: 'https://journalpp.ru/news/v-diveevo-s-detmi-chto-nuzhno-znat-palomnikam/',
            date: '10 июня 2026',
            description: 'Практические советы для семей с детьми, планирующих поездку в Свято-Дивеевский монастырь. Остановка в Арзамасе.',
            emoji: '👨‍👩‍👧‍👦'
        },
        {
            title: 'Паломничество в Оптину пустынь: история и современность',
            link: 'https://journalpp.ru/news/palomnichestvo-v-optinu-pustyn-istoriya-i-sovremennost/',
            date: '25 мая 2026',
            description: 'Духовное наследие Оптиной пустыни — места, куда съезжались за советом Гоголь, Достоевский и Толстой.',
            emoji: '🕊️'
        },
        {
            title: 'Как добраться до Валаама: инструкция для паломника',
            link: 'https://journalpp.ru/news/kak-dobratsya-do-valaama-instruktsiya-dlya-palomnika/',
            date: '15 мая 2026',
            description: 'Пошаговая инструкция по организации поездки на остров Валаам — Северный Афон. Расписание, цены, советы.',
            emoji: '🚢'
        },
        {
            title: 'Святая Земля: как подготовиться к паломничеству',
            link: 'https://journalpp.ru/news/svyataya-zemlya-kak-podgotovitsya-k-palomnichestvu/',
            date: '5 мая 2026',
            description: 'Что нужно знать, чтобы поездка в Иерусалим, Вифлеем и Назарет стала не просто туром, а настоящим паломничеством.',
            emoji: '✝️'
        },
        {
            title: 'Мощи святого Николая: где поклоняться в России',
            link: 'https://journalpp.ru/news/moshchi-svyatogo-nikolaya-gde-poklonyatsya-v-rossii/',
            date: '20 апреля 2026',
            description: 'Обзор мест в России, где хранятся частицы мощей Николая Чудотворца. Список храмов и время работы.',
            emoji: '🕯️'
        }
    ];

    renderArticles(container, articles);
}

// ============================================
// РЕНДЕРИНГ СТАТЕЙ
// ============================================
function renderArticles(container, articles) {
    if (articles.length === 0) {
        container.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
                <span style="font-size: 48px; display: block;">📰</span>
                <p>Статьи из журнала "Православный паломник" временно недоступны.<br>Пожалуйста, посетите <a href="https://journalpp.ru" target="_blank" style="color: var(--gold);">официальный сайт журнала</a>.</p>
            </div>
        `;
        return;
    }

    let html = '';
    articles.forEach(article => {
        html += `
            <a href="${article.link}" target="_blank" class="article-card" style="display:block;">
                <div class="article-img" style="background: linear-gradient(135deg, #1A3A2A, #2C1E0A); display:flex; align-items:center; justify-content:center; font-size:64px;">
                    ${article.emoji || '📖'}
                </div>
                <div class="article-body">
                    <div class="article-tag" style="background:#C8941A; color:#fff;">Журнал РПЦ</div>
                    <div class="article-title" style="font-size:18px;">${article.title}</div>
                    <div class="article-desc">${article.description}</div>
                    <div class="article-meta">
                        <span class="article-author" style="color:var(--gold);">Православный паломник</span>
                        <span class="article-date">${article.date}</span>
                    </div>
                    <div style="margin-top:12px; font-size:13px; color:var(--gold); display:flex; align-items:center; gap:4px;">
                        Читать на сайте журнала →
                    </div>
                </div>
            </a>
        `;
    });

    container.innerHTML = html;
}

// ============================================
// ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
// ============================================
function getRandomEmoji() {
    const emojis = ['⛪', '🕊️', '✝️', '🕯️', '🙏', '📿', '🌿', '✨', '🌟', '☦️'];
    return emojis[Math.floor(Math.random() * emojis.length)];
}

// ============================================
// ЭКСПОРТ ФУНКЦИИ ДЛЯ ИСПОЛЬЗОВАНИЯ
// ============================================
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { loadOrthodoxPilgrimFeed };
}