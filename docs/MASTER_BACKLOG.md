# MASTER BACKLOG — PM-01…PM-53 — v1.45

Дата сверки: 2026-10-05. Источник требований: полный сохранённый `PM_PATCH_ROADMAP_v2.md` от 4 октября 2026 года. Старый документ использован только как backlog, не как code baseline. Единственный исходный canonical baseline для v1.45 — проверенный полный v1.44; сохранённое рабочее дерево v1.45 продолжено без отката.

PM-01…PM-53 — пакеты требований, не 53 обязательных ZIP. Исторические зависимости ниже описывают продуктовый результат; текущая последовательность релизов и исключения определяются `ROADMAP.md` и командами пользователя. Аудио/видео PM-26 отложены; это не блокирует текстовый поиск/интеграцию. M6.1 device-local core сохранён. v1.45 добавляет M6.2 backend/accounts/auth/profile-sync foundation; расширенные lists/progress/visits/subscriptions/community и production deployment остаются последующими работами.

Готовность состоит из трёх независимых частей: механизм, реальное наполнение, проверенный пользовательский сценарий. `Domain CLOSED` в истории означает инженерный gate и не доказывает полноту наполнения или production readiness.

| Пакеты | Подтверждено в коде/данных v1.45 | Что остаётся |
|---|---|---|
| PM-01…03 | Lean build/release, strict checksums, навигация и domain layers | Проверка поведения на целевом Android; новые дефекты исправляются в соответствующем релизе |
| PM-04…06 | Общая UI-система, responsive и lazy map/search | Реальный visual/device/a11y и performance QA; инженерный smoke не заменяет измерения |
| PM-07…10 | 12 957 places, 18 регионов, stable IDs/aliases, каталог/карта/discovery | 30–50 полноценных проверенных карточек стартового региона, доказанные контакты/фото/посещение/freshness, измеренные nearby UX и relevance |
| PM-11…12 | 7 M4 graph entities / 7 relations, domain adapters, 7 liturgical saints, explicit traversal | 30–50 содержательных sacred entities / 100+ evidence relations, explicit identity bridge между namespaces, полные цепочки; не создавать links по названию |
| PM-13…14 | 365 civil days 2026, 15 feasts, 7 saints, 48 reading refs на 13 дат | Подтверждённые ежедневные чтения и богослужебные данные 2026/2027; civil days не означают полный церковный календарь |
| PM-15 | 21 content record / 10 local bodies / 11 links, read-later и canonical pages | 30+ качественных материалов, расширение author/category UX и проверенных связей |
| PM-16 | Event contracts/UI, review isolation | 0 canonical events: sourced pilot афиша 10+ событий, recurrence/cancellation/timezone/freshness scenarios |
| PM-17 | 9 recipes / 27 editorial relations | 30+ воспроизводимых рецептов, наполненные подборки и качество иллюстраций; без церковных предписаний из рецептов |
| PM-18 / PM-28 | Public Today + News/Library/reading bridges; explicit commemoration→saint→life traversal | Полноценный дневной контекст на широком календарном покрытии и реальные сквозные сценарии; отсутствующие факты не заменять seed |
| PM-19…21 | Amenity/service domain, 85 legacy rows сохранены в review; 2 amenities + 2 services + 4 relations | 25–40 verified infrastructure records, freshness/availability и meaningful discovery coverage |
| PM-22…23 | 2 routes / 2 canonical stops / 2 legacy waypoints, infrastructure traversal | 5–10 наполненных маршрутов с несколькими реальными остановками, условиями/транспортом и доказанными инфраструктурными цепочками |
| PM-24 | 4 canonical News / 1 place relation, 5 legacy review | Несколько источников, обновление/исправления и фактическая актуальность ленты; snapshot не live ingestion |
| PM-25 | 39 works / 38 editions / 24 text assets, включая 9 local texts; 5 lives / 6 life_of; v1.44 gate проверяет rights/provenance/local checksums/topology/aliases/indexes/search/Daily | 14 Scripture works пока metadata-only; дальнейшее наполнение не считать завершённым только из-за инженерного gate |
| PM-26 | 2 существующих external media assets и rights contracts | Расширение/players/transcripts отложены пользователем; не считать media product-ready |
| PM-27 | Cross-domain search adapters + Library URL-state filters/facets; v1.44 engineering regression gate | Реальные multi-domain запросы/ranking/context и performance budgets на целевом устройстве всё ещё требуют отдельного QA |
| PM-29…37 | M6.1 local state сохранён; v1.45 добавляет SQLite/API foundation, accounts, safe sessions/CSRF, recovery foundation, server profile, export/delete и explicit versioned My-PM sync с ownership isolation | PM-29…31 требуют дальнейшего production hardening/deployment и расширенной migration UX; PM-32…37 (lists/progress/visits/subscriptions/contributions/My Parish/User Gate) ещё не реализованы |
| PM-38…45 | Future organisation contracts, никаких canonical organisations | Полный M7: registry, representatives, admin, расписания, My Parish, moderation/conflicts/audit/Data Ops |
| PM-46…53 | План production сохранён | Security/privacy/PWA/offline/performance/a11y/SEO/legal/monitoring/backups/recovery/real pilot; публикация только по прямой команде |

Числа выше — факты frozen ZIP. Количественные ориентиры исходного backlog — задачи, не доказательства прав, полноты или готовности. Ничего не добавлять искусственно ради счётчика.

## Полные требования 53 пакетов

#### PM-01 — Воспроизводимый полный релиз

**Область:** M1 / release. **Зависимость:** проверенный v1.17.

**Что делаем:** Устранить неоднозначность паспорта исходного canonical ZIP; зафиксировать Python/Node requirements и зависимости jsonschema/referencing; preflight; запрет bytecode в release-прогоне; понятные ошибки; устранить stale release_version; checksum coverage и строгий финальный gate готового ZIP. Расширить существующие три инструмента только нужными проверками.

**Готово, когда:** Чистая среда получает понятную установку и выполняет rebuild/gate; отсутствие Node не выдаётся за полностью проверенный release; все shipped файлы покрыты manifest, исключения перечислены явно.


#### PM-02 — Рабочая навигация и действия

**Область:** M1 / UX. **Зависимость:** PM-01.

**Что делаем:** Исправить путь из food/recipe.html, active state вложенных страниц и возвраты; привести общие меню к действующим разделам; заменить пустые # там, где действие уже существует; будущие возможности обозначить понятным состоянием. Починить открытие сохранённых материалов из локального профиля.

**Готово, когда:** Из рецепта, статьи, объекта, маршрута и календарного дня доступны правильные переходы; сохранённая статья открывается; видимая кнопка имеет рабочий результат либо честное обозначение будущей функции.


#### PM-03 — Единая работа frontend с данными

**Область:** M2 / M5 runtime. **Зависимость:** PM-02.

**Что делаем:** Перевести calendar widget главной на PravmirLiturgical; pilgrim-service список — на generated domain API; устранить молчаливую подмену данных встроенными fallback-записями; синхронизировать контекст даты и источники.

**Готово, когда:** Одинаковая дата на главной и календаре использует один domain; raw/legacy не читается продуктовыми consumers; все 85 legacy services сохранены со статусом и provenance.


#### PM-04 — Единая визуальная система

**Область:** Design / M1. **Зависимость:** PM-03.

**Что делаем:** Общие tokens, font loading, typography, отступы под nav, карточки, кнопки, формы, loading/empty/error states; упорядочить использование текущего знака; заменить watermarked hero на изображение с понятным происхождением; вывести инженерные термины из основного UI.

**Готово, когда:** Главная, каталог, карточки, календарь, журнал, события и кухня используют один shell/fonts; assets имеют источники; без необходимости не переделана идентика; реальные screenshots подтверждают layout.


#### PM-05 — Мобильный интерфейс и доступность основы

**Область:** Mobile / UX. **Зависимость:** PM-04.

**Что делаем:** Доступ ко всем работающим разделам на телефоне; responsive widths, touch targets, safe areas, zoom, контраст, focus, keyboard/Escape и aria для меню. Подготовить навигацию Сегодня/Рядом/Исследовать/Паломничество/Мой ПМ; новые пункты активировать по мере реализации.

**Готово, когда:** На Android не теряются разделы и основные действия; нет подтверждённых перекрытий; меню доступно клавиатурой; новые будущие экраны не изображают готовые функции.


#### PM-06 — Быстрая загрузка поиска и карты

**Область:** Performance / M2–M3. **Зависимость:** PM-05.

**Что делаем:** Измерить cold start, transfer, JSON parse, memory и input response на представительном телефоне; уменьшить глобальную начальную загрузку, разделить данные по потребности, lazy-load карту, оптимизировать indexes/cache/images. Сохранить API и результаты поиска.

**Готово, когда:** Есть измерения до/после; первоначальная загрузка существенно облегчена относительно текущих 11,08 MB raw search/index; поиск/aliases/map contracts сохранены; бюджеты зафиксированы по реальному устройству.


#### PM-07 — Реестр источников и качество данных

**Область:** Data Core 2. **Зависимость:** PM-06.

**Что делаем:** Реестр источников/прав/области применимости; source URLs и evidence где реально подтверждены; freshness, observed/verified/valid/expiry metadata; pipeline review conflicts, duplicates и rejected rows; проверенный стартовый регион и дальнейшее расширение покрытия.

**Готово, когда:** Данные пользователя различают свежую проверку и исторический импорт; источники доступны по records; массовые изменения проходят pipeline; исходные 12 957 places и aliases не потеряны.


#### PM-08 — Полноценная карточка места

**Область:** Places 2. **Зависимость:** PM-07.

**Что делаем:** Описание, история, фотографии и attribution, контакты, часы/условия посещения при наличии evidence, accessibility metadata, статус актуальности, источники и canonical links; выровнять старые curated pages и universal page через общее ядро с сохранением старых URL.

**Готово, когда:** Выбранный набор мест имеет полезные карточки, а неизвестные поля не выдуманы; старые страницы сохраняют своё содержимое и открываются через единые records; источник виден рядом с изменяющимся фактом.


#### PM-09 — Каталог и discovery 2

**Область:** Discovery 2. **Зависимость:** PM-08.

**Что делаем:** Удобный поиск/подсказки, города/регионы, типы, статус/проверенность, sorting и URL state; поиск русского текста; качественные карточки результатов, clear filters, empty states и возврат к контексту. Не активировать фильтры amenities до их данных.

**Готово, когда:** Найти место по названию/городу/адресу, применить фильтры, открыть карточку и вернуться можно без потери состояния; relevance проверена на наборе реальных запросов.


#### PM-10 — Карта и «Рядом»

**Область:** Map / Nearby. **Зависимость:** PM-09.

**Что делаем:** Выбор города/точки, opt-in геолокация, radius/viewport, map/list switch, маркеры/кластеры/попапы, фильтры, внешняя навигация; обработка неточных/отсутствующих координат и отказа provider.

**Готово, когда:** Человек находит места рядом и открывает их карточки; отказ geo/tiles не лишает каталога; вычисленная близость не становится фактической graph relation.


#### PM-11 — Святые, иконы, мощи и святыни

**Область:** Sacred entities. **Зависимость:** PM-10.

**Что делаем:** Canonical pages отдельных сущностей с биографией/описанием, источниками и media; расширить verified relations и географию; явная identity mapping между M4 entities и liturgical saints с сохранением IDs/aliases; разрешать конфликты evidence.

**Готово, когда:** Есть проверенные цепочки святой→икона/мощи→место→маршрут; связи не создаются по совпадению названия; namespace и старые ссылки совместимы.


#### PM-12 — Общий граф существующих разделов

**Область:** Graph integration foundation. **Зависимость:** PM-11.

**Что делаем:** Общий typed reference registry/resolver и adapters существующих domains; source/trust/class/temporal metadata на связях; bidirectional discovery и ограниченный traversal; подготовка contracts будущих work/amenity/organisation без фиктивных опубликованных nodes.

**Готово, когда:** Место, святыня, article и calendar context соединяются по explicit IDs/evidence; editorial suggestion отличается от factual relation; M4 API не сломан; dangling references не публикуются.


#### PM-13 — Подтверждённые календарные источники

**Область:** M5.3 data. **Зависимость:** PM-12.

**Что делаем:** Jurisdiction/tradition/calendar style; загрузка и обновление из проверяемых источников, provenance и разрешение расхождений; покрытие текущего и следующего года; исправление legacy facts через pipeline без удаления истории.

**Готово, когда:** Публикуемые богослужебные сведения имеют источник и область применимости; 2026/2027 покрытие не подменено одним civil generator; неподтверждённые сведения явно отделены.


#### PM-14 — Календарь 2 и чтения

**Область:** M5.3 product. **Зависимость:** PM-13.

**Что делаем:** Наполненные days, feasts, commemorations, saints, fasting context, daily readings; ссылки на тексты/версии Scripture с правами; civil/old-style dates где применимо, поиск дат и переходы к связанным местам/контенту.

**Готово, когда:** На выбранных обычных и праздничных днях показан связный проверенный контекст; readings содержат реальные references/text editions; нет универсального выдуманного правила поста.


#### PM-15 — Журнал и авторы 2

**Область:** M5.1–M5.2 product. **Зависимость:** PM-14.

**Что делаем:** Качественные тексты/изображения, author/category pages, поиск и подборки, sources, external vs local bodies; explicit links к saints/places/routes/calendar; publish/update/correction metadata и рабочее «Читать позже».

**Готово, когда:** Материал читается и ведёт к связанному объекту или теме; external preview не выдаётся за локальный полный текст; опубликованное наполнение не состоит только из seed metadata.


#### PM-16 — Живые события и повторяющиеся расписания

**Область:** M5.4 product. **Зависимость:** PM-15.

**Что делаем:** Реальные sourced events, timezone/cancellation/postponement/freshness; RRULE occurrences с exceptions; calendar→events, date/place filters, related place/route/content; demo/review остаются отдельными. Organisation-name не подменяет future canonical organisation ID.

**Готово, когда:** Реальное событие появляется в нужный день; повторение видно в следующую дату; перенос/отмена/истечение отражены; draft/demo не выдаются за подтверждённую афишу.


#### PM-17 — Кухня 2

**Область:** M5.5 product. **Зависимость:** PM-16.

**Что делаем:** Увеличить editorial recipes; фотографии, ingredients/steps, время/порции, состав и allergens, filters и подборки; date context действительно ведёт к соответствующей подборке; links к feasts/fasting остаются editorial guidance.

**Готово, когда:** Выбор даты/состава даёт понятный результат и рабочую recipe page; рецепты воспроизводимы; кулинарная рекомендация не превращена в церковное предписание.


#### PM-18 — «Сегодня» — первая полезная версия

**Область:** Daily Layer v1. **Зависимость:** PM-17.

**Что делаем:** Public daily screen: день, праздники, святые/иконы, чтения, постный контекст, рецепты, статьи, реальные события и места рядом; выбранный город/timezone и честные missing-data states. Без фиктивного персонального аккаунта.

**Готово, когда:** Пользователь открывает один экран и переходит к нескольким связанным доменам; каждый блок получает данные из своего runtime; даты/источники согласованы. News/library добавляются после их реализации.


#### PM-19 — Canonical domain инфраструктуры

**Область:** M5.6 domain. **Зависимость:** PM-18.

**Что делаем:** Amenity, amenity_type и service: трапезная, гостиница/паломнический дом, лавка, транспорт, парковка, купель/источник, туалет, accessibility, family/pilgrim support; coords/hours/contacts/status/availability/trust/temporal contracts; typed place/route refs и organisation contract.

**Готово, когда:** Домен различает физическое удобство, услугу и организацию; stable IDs/aliases/source snapshots/build/runtime существуют; неизвестные данные остаются unknown, а не yes.


#### PM-20 — Миграция и наполнение инфраструктуры

**Область:** M5.6 data. **Зависимость:** PM-19.

**Что делаем:** 85 legacy pilgrim services сохраняются как services с provenance; candidate bindings требуют evidence; canonical/system, verified organisation, editorial и community отделены; добавить подтверждённые реальные amenities и review/rejected queues. Organisation refs остаются pending до M7 registry.

**Готово, когда:** Ни одна legacy запись не потеряна; нет автоматического превращения текста в verified facility; первая подборка реальных сервисов связана с местами доказуемо.


#### PM-21 — Каталог и страницы сервисов

**Область:** M5.6 UI. **Зависимость:** PM-20.

**Что делаем:** Canonical amenity/service URLs; filters по типу, location, availability, проверенности и подтверждённой доступности; contacts/hours, условия размещения/посещения, sources, map links; неизвестная доступность не исключается скрыто.

**Готово, когда:** Человек находит сервис, видит условия/актуальность и связывается по проверенному каналу; страницы честно показывают неизвестное и закрытые/устаревшие данные.


#### PM-22 — Полноценные паломнические маршруты

**Область:** Routes 2. **Зависимость:** PM-21.

**Что делаем:** Расширить route records/stops и media; маршрут как самостоятельная сущность: track/геометрия при наличии источника, расстояния/длительность с происхождением, порядок остановок, ограничения, transport, расходы с датой/статусом, related places/amenities.

**Готово, когда:** Маршрут позволяет планировать поездку, имеет несколько реальных остановок и источник информации; оценка стоимости/времени отличима от проверенного факта; старые waypoints не потеряны.


#### PM-23 — Интеграция M5.6 и паломничества

**Область:** M5.6 gate. **Зависимость:** PM-22.

**Что делаем:** Место→сервисы→map; route→stop→amenities; подтверждённые family/accessibility options; pilgrim support contacts и trip preparation. Финальная проверка связных инфраструктурных сценариев.

**Готово, когда:** Сценарии храм→трапезная→гостиница→парковка и маршрут→остановка→сервисы выполнены на реальных records. Только после этого M5.6 получает product-ready статус.


#### PM-24 — Новости как самостоятельный domain

**Область:** M5.7. **Зависимость:** PM-23.

**Что делаем:** M5.7 sources, news records, provenance, freshness, dedupe, correction/version history; previews/rights; explicit connections к event/place/entity/content и pending organisation refs; news page/catalog и Today integration.

**Готово, когда:** Пользователь отличает новость от события и статьи; видит исходный источник и дату; материал связан с нужным объектом без text-match canonical promotion.


#### PM-25 — Библиотека и чтение

**Область:** M5.8 texts. **Зависимость:** PM-24.

**Что делаем:** M5.8 work/author/text/edition: Scripture, жития, богословие, молитвы, проповеди, история Церкви; поиск, таблица содержания, версии/переводы, attribution/licensing, reader/book pages и typed graph links.

**Готово, когда:** Текст доступен к чтению при разрешённых правах либо через внешний источник; work != edition; версия/авторство понятны; IDs и ссылки стабильны.


#### PM-26 — Аудио и видео

**Область:** M5.8 media. **Зависимость:** PM-25.

**Что делаем:** M5.8 media editions, разрешённые assets/embeds, reader/player, оглавление и time codes, subtitles/transcripts по доступным источникам, authors/topics links, соответствие media конкретной edition.

**Готово, когда:** Материал воспроизводится, имеет источник/права и связан с текстом/автором/темой; внешний player обозначен; пустая карточка не считается полноценным media item.


#### PM-27 — Единый поиск и исследование мира

**Область:** Cross-domain discovery. **Зависимость:** PM-26.

**Что делаем:** Поиск по places/entities/routes/events/content/news/works/media/food/services; типовые facets, russian relevance, suggestions, consistent cards, source/trust context и связанные подборки. На public уровне без аккаунта.

**Готово, когда:** Один запрос возвращает несколько типов релевантных объектов; переходы ведут к canonical pages; search indexes не дублируют raw datasets и укладываются в измеренные budgets.


#### PM-28 — «Сегодня» 2 и M5.9 Integration Gate

**Область:** M5.9. **Зависимость:** PM-27.

**Что делаем:** Добавить news/library/media/amenities в daily и общий graph; согласовать source/scope/date/context; проверить целевые длинные переходы и public mobile experience; зафиксировать готовность всей M5 отдельно от engineering-only компонентов.

**Готово, когда:** Проходят календарь→святой→икона→храм→маршрут→трапезная; статья→книга→автор→святой→место; новость→событие→место→карта. M5.9 завершён до начала M6.


#### PM-29 — Backend и API foundation

**Область:** M6 backend. **Зависимость:** PM-28.

**Что делаем:** Модульный backend, единая persistence model, migrations, API contracts/versioning, readonly data adapters/import generated snapshots, staff authentication foundation и разделение canonical/public/private records. Стек выбрать по поддержке, эксплуатации и текущему frontend.

**Готово, когда:** Реальный API обслуживает данные, IDs не изменены; static frontend продолжает работать через adapter; нет преждевременного набора микросервисов или переписывания всего проекта.


#### PM-30 — Аккаунты и безопасные сессии

**Область:** M6 accounts. **Зависимость:** PM-29.

**Что делаем:** Registration/login/logout/recovery, server-side sessions/permissions, user preferences, city/timezone, account deletion/export foundation; явно заданные роли пользователя и служебного reviewer; защита ownership и ошибок auth.

**Готово, когда:** Два разных аккаунта не читают и не изменяют private records друг друга; public контент доступен без входа; recovery/logout и ошибки работают.


#### PM-31 — «Мой ПМ» и миграция локальных данных

**Область:** M6 profile. **Зависимость:** PM-30.

**Что делаем:** Личный dashboard/settings; controlled import localStorage favorites/readLater с IDs/aliases/URLs и подтверждением пользователя внутри продукта; server persistence, dedupe/conflicts и сохранение legacy records.

**Готово, когда:** После входа/выхода или другого устройства данные пользователя сохраняются; старое «Читать позже» не теряется; импорт не загружает локальную историю молча.


#### PM-32 — Избранное, коллекции и чтение

**Область:** M6 collections. **Зависимость:** PM-31.

**Что делаем:** Favorites для разных domains, lists/collections, saved content, reading progress по article/work/edition, продолжить чтение, private/public sharing states по явному выбору.

**Готово, когда:** Пользователь сохраняет, организует и вновь открывает объект или текст; прогресс привязан к edition; личные коллекции по умолчанию private. Молитва не превращается в score/streak.


#### PM-33 — Посещения и личная история

**Область:** M6 visits. **Зависимость:** PM-32.

**Что делаем:** Visits, заметки, личные фото/история путешествий, контроль видимости и удаления; достижения только за путешествия, обучение и вклад с понятными условиями и без обязательного вовлечения.

**Готово, когда:** Посещение сохраняется с place ID и приватностью; история не требует постоянного geo-tracking; отсутствуют духовный уровень и баллы за молитву/исповедь/причастие.


#### PM-34 — Персональные маршруты

**Область:** M6 route planner. **Зависимость:** PM-33.

**Что делаем:** Создать маршрут из canonical stops, reorder/edit, day plan, personal notes, сохранение и controlled share; distinguish personal route vs published verified route; связи с verified infrastructure и условиями поездки.

**Готово, когда:** Пользователь планирует, сохраняет и возвращается к своему маршруту; чужие данные защищены; private план не становится canonical публичным маршрутом.


#### PM-35 — Подписки и уведомления

**Область:** M6 subscriptions. **Зависимость:** PM-34.

**Что делаем:** Follow places/topics/events/content; канал, частота, quiet hours/timezone, opt-in/out, event cancellation/changes, notification delivery/idempotency и пользовательский контроль. Church timetable subscriptions полноценно включаются после M7.

**Готово, когда:** Уведомление уходит только подписанному пользователю, не дублируется и прекращается после opt-out; сообщение сохраняет источник и статус события. Ничего не отправляется внешним людям от имени владельца проекта без его команды.


#### PM-36 — Отзывы, фотографии и предложения

**Область:** M6 contributions. **Зависимость:** PM-35.

**Что делаем:** User contributions с ownership, provenance, pending review, отчёт об ошибке/жалоба, rate limits и feedback statuses; basic staff review queue. Community никогда напрямую не перезаписывает canonical facts.

**Готово, когда:** Пользователь отправляет вклад и видит его статус; непроверенная запись не публикуется как verified; авторство/права media сохранены; чужие private submissions защищены.


#### PM-37 — M6 Integration Gate

**Область:** M6 gate. **Зависимость:** PM-36.

**Что делаем:** Устранить разрывы My PM; onboarding, save/reopen, reading progress, personal route, visits и subscriptions; проверка local migration, cross-device consistency, consent и аккаунтных ошибок.

**Готово, когда:** Пользователь завершает личные сценарии с реальным backend; нет demo identity и незаписываемой кнопки. My Parish/официальное расписание остаются зависимыми от organisation registry M7.


#### PM-38 — Организации и церковная иерархия

**Область:** M7 registry. **Зависимость:** PM-37.

**Что делаем:** Canonical organisation registry: parish/monastery organisation/deanery/diocese; clergy/public roles по подтверждённым источникам; explicit links к places, territories, events и services; history/jurisdiction/temporal metadata.

**Готово, когда:** Place != Organisation соблюдается: одна организация может иметь несколько places, одно место может иметь разные historical associations; нет organisation IDs, созданных из текста автоматически.


#### PM-39 — Представители и подтверждение прав

**Область:** M7 representatives. **Зависимость:** PM-38.

**Что делаем:** Claim organisation/place, verified representative evidence, reviewer decisions, permission matrix, срок/отзыв прав, multi-organisation membership, ownership boundaries и audit.

**Готово, когда:** Представитель редактирует только разрешённые объекты; claim проходит проверку; права нельзя получить по одному совпадению имени; history и revoke работают.


#### PM-40 — Админка и редакторский процесс

**Область:** M7 admin. **Зависимость:** PM-39.

**Что делаем:** Редактирование content/news/events/works/media/recipes/places/amenities; draft→review→publish→update; source/evidence fields, preview, schema/ref checks, permissions и version history; без прямого изменения raw/generated вручную.

**Готово, когда:** Редактор публикует валидный sourced материал и исправляет его с историей; плохие references и неразрешённые действия блокируются; production остаётся reviewable.


#### PM-41 — Официальные расписания храмов

**Область:** M7 timetable. **Зависимость:** PM-40.

**Что делаем:** Organisation-authorised schedule, regular services/exception dates, timezone, feasts/overrides, cancellation, valid/verified/expiry metadata, event occurrence generation и единственный источник расписания для UI/API.

**Готово, когда:** Изменение представителем отражается в храме, calendar, Today и subscriptions; старое расписание не выдаётся за актуальное; конфликт источников сохраняется.


#### PM-42 — «Мой приход»

**Область:** M7 My Parish. **Зависимость:** PM-41.

**Что делаем:** Связь пользователя с canonical organisation и её places, проверенное расписание/события, объявления, contacts и subscriptions; home place/favorite не подменяют parish membership. Public organisation page и personal parish dashboard.

**Готово, когда:** Профиль→мой приход→расписание→событие→уведомление работает с verified organisation; принадлежность к общине не присваивается молча из избранного храма.


#### PM-43 — Модерация, конфликты и доверие

**Область:** M7 trust. **Зависимость:** PM-42.

**Что делаем:** Углублённая moderation contributions/photos/reviews, conflict evidence/version comparison, resolution statuses/appeals, restore, audit trail; canonical/system, verified organisation, editorial и community display rules.

**Готово, когда:** При конфликте факт не перетирается молча; видно происхождение/статус; canonical публикуется через разрешённый процесс; история изменений доступна staff.


#### PM-44 — Операции с источниками и данными

**Область:** M7 Data Ops. **Зависимость:** PM-43.

**Что делаем:** Admin controls для import/update/review/dedupe queues, migrations, mapping candidates, source freshness dashboards и отклонённых records; batch corrections через pipeline с preview и отчётом, сохранение history/aliases.

**Готово, когда:** Команда обновляет dataset без ручной правки тысяч объектов; изменения reviewable и восстанавливаемы; stale источники видимы; community и official не смешиваются.


#### PM-45 — M7 Integration Gate

**Область:** M7 gate. **Зависимость:** PM-44.

**Что делаем:** Проверить role boundaries для пользователя/редактора/moderator/представителя/admin; organisation↔place↔schedule↔events↔services; review workflow и audit; развязать unresolved organisation references только при evidence.

**Готово, когда:** Полная цепочка новости→событие→приход→карта работает; неразрешённое изменение и чтение private data отвергнуты; refs/aliases/history сохранены.


#### PM-46 — Безопасность и приватность production

**Область:** M8 security/privacy. **Зависимость:** PM-45.

**Что делаем:** Укрепить auth/session/API и upload handling, secrets/config, data minimisation, consent/export/deletion/retention, abuse limits; проверка текущих реальных угроз и чувствительных потоков, применимых к реализованным функциям.

**Готово, когда:** Аккаунт/контент/файлы имеют проверенные границы доступа; удаление/экспорт и retention исполняются; известные опасные уязвимости устранены. Это hardening уже защищённого backend, а не первая защита после публикации.


#### PM-47 — PWA и offline

**Область:** M8 PWA. **Зависимость:** PM-46.

**Что делаем:** Service worker, install/update states, выбранные региональные данные и сохранённые материалы offline, versioned cache, stale indicators, безопасная синхронизация/outbox. Maps offline только в пределах допустимого provider/asset contract.

**Готово, когда:** Без сети открываются заранее сохранённые материалы/регион/маршрут; пользователь видит актуальность; после обновления нет смешения несовместимых snapshots или чужого аккаунтного cache.


#### PM-48 — Production performance

**Область:** M8 performance. **Зависимость:** PM-47.

**Что делаем:** Production caching/compression, lazy queries/index shards, responsive media/fonts, low-memory режим, backend query profiling, map rendering и сетевые ошибки; реалистичные budgets и capacity по измерениям.

**Готово, когда:** На Android и desktop соблюдены зафиксированные loading/input/memory budgets; dataset рост не возвращает глобальную тяжёлую загрузку; ускорение не удалило функционал.


#### PM-49 — Финальная UX и accessibility проверка

**Область:** M8 UX/accessibility. **Зависимость:** PM-48.

**Что делаем:** Реальные Android/desktop screen sizes, keyboard/screen-reader paths, zoom/focus/contrast, forms/labels/empty states, slow network и full workflows; системные repairs через общие компоненты.

**Готово, когда:** Нет существенных препятствий в основных journeys; screenshots и результаты подтверждают проверки; недоступное устройство/браузер не объявляется проверенным.


#### PM-50 — SEO, URL и права контента

**Область:** M8 discoverability/content. **Зависимость:** PM-49.

**Что делаем:** Metadata/canonical URLs, stable aliases/redirects, sitemap/robots, structured content preview/indexability, share cards; лицензии/attribution для photos/texts/media, external source presentation и correction/contact surfaces.

**Готово, когда:** Внешний пользователь/поисковик получают понятную страницу и устойчивый URL; legacy ссылки не потеряны; используемые assets имеют задокументированное основание.


#### PM-51 — Наблюдение и актуальность

**Область:** M8 operations. **Зависимость:** PM-50.

**Что делаем:** Errors/health/metrics/logging с privacy limits; source freshness и expired events/schedules; background update jobs, retries/idempotency, alert routing и ownership; content errors и provider failures видны команде.

**Готово, когда:** Обрыв source/import/provider не молча выдаёт устаревшее за новое; jobs диагностируются и повторяются безопасно; пользователь видит актуальность/ограничения.


#### PM-52 — Резервные копии и восстановление

**Область:** M8 recovery. **Зависимость:** PM-51.

**Что делаем:** Backup DB/media/source snapshots/config без публикации secrets; migration rollback strategy, restore rehearsal, downtime/recovery procedure и release handoff; сохранение полного canonical ZIP независимо от runtime package.

**Готово, когда:** Контрольное восстановление действительно выполнено; IDs/private records/media и история не потеряны; documented recovery имеет проверенные входы и результат.


#### PM-53 — Пилотный production-релиз

**Область:** M8 launch gate. **Зависимость:** PM-52.

**Что делаем:** Reviewable production configuration/runtime package, ограниченный содержательно наполненный pilot, measured usability/performance/error feedback, устранение release blockers и итоговая готовность M8. Публикация и GitHub — только по явной команде.

**Готово, когда:** Реальные пользователи завершают основные сценарии, source/freshness/support работают, app наблюдается и восстанавливается; статус production подкреплён результатом пилота.


## Что следует после M8

Эти направления входят в полную продуктовую цель, но не подменяют завершение PM-01…PM-53. Каждое позднее направление — отдельная серия функциональных патчей, которую детализируем по готовому production baseline, эксплуатации и реальным требованиям.

| Направление | Первая часть | Следующие части | Зависимости |
|---|---|---|---|
| Parish OS | Staff dashboard, operational timetable/tasks и представители | Volunteer coordination, помещения/ресурсы, объявления/документы, отчётность | PM-38…45, защищённый backend и M8 |
| Community | Группы прихода/города/паломничества, membership и privacy | Обсуждения, moderation/report/appeals и совместные события | Accounts, organisation registry, moderation, M8 |
| Pilgrimage marketplace | Verified operators и trip offers/availability | Booking, cancellation/support, lodging/transport coordination, payment integration по отдельной финансовой модели | Полные routes/amenities/events/org domains, M8 |
| Пожертвования и приходские сервисы | Проверенные recipients/campaigns и прозрачные условия | Платёжные сценарии, receipts/reporting и контролируемая интеграция provider | Organisations/trust, security/privacy, отдельная payment model |
| Public/partner API | Versioned endpoints, credentials/scopes, quotas и attribution | Widgets/export/partner integrations и поддержка API contracts | Stable registry, audit, performance/operations |
| Native apps | Android client на общем API с offline/notifications | Дальнейшие platform clients без копирования domain logic | M8 API, PWA/offline, account privacy |
| Масштаб RF/CIS | Проверенные source adapters новых территорий | Jurisdiction/calendar scope, язык/переводы, география и устойчивое обновление | Data ops, source/legal metadata, production performance |

После pilot возможна корректировка объёма поздних направлений по реальному использованию. Она не должна стирать уже выполненные функции, evidence и history или превращать проект в другой продукт.

