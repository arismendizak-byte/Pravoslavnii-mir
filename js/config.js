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

    menuItems: {
        top: [
            { title: "Каталог", url: "catalog/catalog.html" },
            { title: "Маршруты", url: "routes/routes.html" },
            { title: "Святые", url: "#" },
            { title: "Иконы", url: "#" },
            { title: "Святыни", url: "holiness.html" },
            { title: "Журнал", url: "journal.html" },
            { title: "Календарь", url: "calendar.html" },
            { title: "Профиль", url: "profile.html" },
            { title: "О проекте", url: "about.html" }
        ],
        bottom: [
            { title: "Главная", url: "index.html", icon: "🏠" },
            { title: "Каталог", url: "catalog/catalog.html", icon: "⛪" },
            { title: "Маршруты", url: "routes/routes.html", icon: "🗺️" },
            { title: "Святыни", url: "holiness.html", icon: "🕯️" },
            { title: "Журнал", url: "journal.html", icon: "📖" }
        ]
    }
};

window.CONFIG = CONFIG;