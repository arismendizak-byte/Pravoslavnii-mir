const CONFIG = {
    siteName: "Православный Мир",
    siteUrl: "https://pravmir.ru",
    siteEmail: "hello@pravmir.ru",
    
    social: {
        vk: "#",
        tg: "#",
        youtube: "#",
        ok: "#"
    },

    phones: {
        main: "+7 (496) 540-57-01"
    },

    maps: {
        // Official Yandex Maps JS API v3 key. Leave empty to use the built-in fallback UI.
        // The key must be restricted by HTTP Referer in Yandex Developer Cabinet.
        yandexJsApiKey: ""
    },

    menuItems: {
        top: [
            { title: "Сегодня", url: "index.html", icon: "sun" },
            { title: "Рядом", url: "index.html#map", icon: "pin" },
            { title: "Исследовать", url: "catalog/catalog.html", icon: "compass" },
            { title: "Паломничество", url: "routes/routes.html", icon: "route" },
            { title: "Мой ПМ", url: "profile.html", icon: "user" }
        ],
        secondary: [
            { title: "Святые и святыни", url: "holiness.html", icon: "cross" },
            { title: "Журнал", url: "journal.html", icon: "book" },
            { title: "Новости", url: "news.html", icon: "book" },
            { title: "Библиотека и медиа", url: "library.html", icon: "book" },
            { title: "Календарь", url: "calendar.html", icon: "calendar" },
            { title: "События", url: "events.html", icon: "calendar" },
            { title: "Православная кухня", url: "food.html", icon: "food" },
            { title: "Инфраструктура паломника", url: "pilgrim/infrastructure.html", icon: "route" },
            { title: "О проекте", url: "about.html", icon: "info" }
        ],
        bottom: [
            { title: "Сегодня", url: "index.html", icon: "sun" },
            { title: "Рядом", url: "index.html#map", icon: "pin" },
            { title: "Исследовать", url: "catalog/catalog.html", icon: "compass" },
            { title: "Паломничество", url: "routes/routes.html", icon: "route" },
            { title: "Мой ПМ", url: "profile.html", icon: "user" }
        ]
    }
};

window.CONFIG = CONFIG;
