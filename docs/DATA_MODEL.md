# Data Model v1.0 — `place`

Канонический контракт данных для карты, каталога, поиска и карточек объектов.

## Идентичность

`id` — неизменяемый внутренний идентификатор формата `pm-<uuid5 hex>`.

Правило версии 1.0:
- если у источника есть `source_id`: UUID5 строится из `provider + source_id`;
- если `source_id` отсутствует: используется `provider + source_file + source_row`.

Имя регионального CSV **не входит** в ID, когда `source_id` известен. Поэтому перенос одного и того же объекта между региональными выгрузками не меняет ID.

`slug` — URL-ключ, включающий стабильный суффикс от `id`; первичным ключом не является.

`merged_from_ids` — ID отдельных записей, автоматически объединённых dedupe. Повторные выгрузки одной source identity агрегируются ещё в importer и поэтому не создают искусственных `merged_from_ids`.

Для совместимости с ранее выданным M2.4 recovery importer создаёт `data/generated/import_id_aliases.json`: старые file-scoped ID → новые stable ID v1.0. Dedupe объединяет эту таблицу с `dedupe_aliases.json` и нормализует alias chains до прямых ссылок на конечный canonical ID.

## Нормализованные поля

`place_type`: church, cathedral, chapel, monastery, skete, metochion, bell_tower, holy_spring, memorial, other, unknown.

`status`: active, preserved, inactive, ruined, lost, under_construction, restoring, unknown.

Исходные значения сохраняются в `type_raw`, `status_raw` и `source_records`.

Если исходный type пуст/неизвестен, importer использует консервативный fallback по названию объекта. Более специфичные признаки (`подворье`, `скит`) имеют приоритет над общими (`монастырь`, `храм`).

## География

`address.region` сначала получает регион source-file, затем проверяется по явному региону в `address.formatted` через `data/schema/region_mapping.json`.

Если адрес однозначно указывает другой регион:
- канонический `address.region` исправляется по адресу;
- в quality добавляется `region_conflict`;
- исходный регион файла сохраняется в `source_records[].source_region`.

Если адрес действительно неоднозначен, сохраняется регион source-file и выставляется `region_ambiguous`.

`location.lat/lon` должны быть либо одновременно числами, либо одновременно `null`.

## Provenance

Каждый объект имеет минимум один `source_record` с:
- provider;
- source_id/source_url;
- source_file/source_row;
- source_region;
- raw type/status;
- imported_at/last_verified_at.

Одинаковая `provider + source_id`, встретившаяся в нескольких CSV, агрегируется importer в один объект с несколькими `source_records`. Если записи одной source identity существенно конфликтуют по имени/координатам, importer останавливается с fatal `source_identity_conflict`.

При dedupe `source_records` всех объединённых объектов сохраняются.

## Quality

`quality.score` — 0..100. Основные flags:
- `coordinates_missing`
- `address_incomplete`
- `description_missing`
- `dedications_missing`
- `source_url_missing`
- `type_unmapped`
- `status_unmapped`
- `region_conflict`
- `region_ambiguous`
- `possible_duplicate`

## Rejected rows

Строки без имени не превращаются в place, но не теряются. Они пишутся в `data/generated/rejected_rows.json` с:
- source_file/source_row/source_id;
- source_region;
- reason;
- полным `raw_row`;
- `raw_fields` по исходным заголовкам.

Исходные 17 CSV всегда остаются в полном ZIP.

## M2.4 dedupe

`tools/dedupe_places.py` создаёт:
- `data/generated/places_deduped.json`
- `data/generated/dedupe_report.json`
- `data/generated/review_candidates.json`
- `data/generated/dedupe_aliases.json`

Auto-merge остаётся консервативным. Exact name+address автоматически объединяется только если координаты отсутствуют или не расходятся больше чем на 1 км; иначе создаётся review-кандидат `same_name_address_coordinate_conflict`.

Candidate generation версии 1.0 использует bounded blocking:
- source identity;
- exact normalized name внутри региона;
- exact normalized address внутри региона;
- редкие информативные токены имени;
- соседние мелкие geo-cells.

Это устраняет прежний почти-квадратичный перебор широких религиозных токенов.

Review по похожим name/address ограничен локальным радиусом, если координаты известны, чтобы одинаковые посвящения в разных городах не давали ложные кандидаты.

Complete-link clustering сохраняется: цепочка A↔B↔C не склеивается автоматически, если не проходят все cross-pairs.

## Release integrity

`FILE_SHA256SUMS.txt` покрывает shipped project files, включая deterministic generated outputs, кроме самого checksum-файла и двух transient diagnostic reports `data/generated/import_report.json` / `data/generated/dedupe_report.json`, содержащих `generated_at`. Эти два отчёта проверяются структурно, но не являются reproducibility artifacts.

## M2.5 derived data contract

M2.5 не меняет canonical `place`. Все новые файлы — производные от `data/generated/places_deduped.json` и могут быть пересобраны `python tools/build_indexes.py`.

### `data/generated/index.json`

Главный lookup index содержит:
- `by_id`: canonical ID → `slug`, `region_slug`, `doc`;
- `by_slug`: slug → canonical ID;
- registry регионов (`name`, `slug`, `file`, `count`);
- `source_sha256` canonical deduped input.

`doc` — стабильный ordinal в `search_index.json.documents`, потому что document table всегда сортируется по canonical ID.

### `data/generated/search_index.json`

Содержит:
- компактный ID-sorted `documents` array для результата поиска;
- `terms` — отсортированный уникальный словарь поисковых токенов;
- `postings` — term → отсортированный список document ordinals;
- `exact_names` — нормализованное полное имя → document ordinals.

Нормализация поиска:
- Unicode NFKC;
- casefold;
- `ё` → `е`;
- punctuation → token separators;
- короткие/служебные address stopwords не индексируются.

Токены строятся по name, alt_names, dedications, region, district, locality, formatted address, place_type и status. Search-document намеренно компактнее canonical place; полная запись загружается из регионального shard по ID/region.

### Regional shards

`data/generated/regions_manifest.json` перечисляет 18 shards.

`data/generated/regions/<region_slug>.json` содержит полные canonical place objects соответствующего `address.region`. Все shards вместе обязаны образовывать точное непересекающееся разбиение `places_deduped.json`.

### M2.5 invariants

Обязательные invariants: 100% coverage canonical IDs/slugs, отсутствие dangling references, уникальные IDs/slugs, точное разбиение canonical dataset по regional shards и согласованный `source_sha256` у generated outputs. Эти гарантии проверяются единым `tools/check_project.py`; отдельные milestone-checkers удалены в v1.17.

## M2.6 runtime data-layer contract

M2.6 не изменяет canonical `place` schema и не создаёт новые canonical IDs. Он вводит browser runtime boundary `window.PravmirData` (`js/data-layer.js`) между generated data и frontend consumers.

### Primary canonical source

Data-layer использует только M2.5 derived contract для canonical объектов:
- `index.json` — ID/slug/region lookup;
- `search_index.json` — compact documents + postings;
- `regions/<region_slug>.json` — полные canonical записи по требованию.

`home.js`, `search.js` и `catalog.js` не должны напрямую fetch'ить эти файлы.

### Runtime API

Основные методы:
- `getMapPlaces()` / `getCatalogPlaces()` — компактные UI documents;
- `search(query, {limit})` — indexed canonical search;
- `getPlaceById(id)` — lazy full canonical lookup через region shard;
- `getPlaceBySlug(slug)` — slug → ID → lazy region shard;
- `getRegionPlaces(region)` — полные canonical записи региона;
- `getRegions()` / `getStats()`;
- `toMapTarget(place)` / `getDetailUrl(place)`.

Core index, search index и curated metadata кешируются после первой загрузки. Region shards кешируются отдельно и загружаются только при полном lookup.

### Историческая SPB compatibility boundary — закрыта M3.5

В M2.6 `data/spb_temples.json` временно подключал 414 существующих frontend-объектов Санкт-Петербурга через runtime IDs `legacy-spb-*`, потому что эти записи ещё не входили в canonical Data Core. Это была только переходная совместимость.

Начиная с M3.5/v1.7 этот boundary закрыт: SPB проходит обычный importer → validator → dedupe → indexes и входит в canonical dataset. `PravmirData` больше не fetch'ит legacy SPB JSON как runtime data source. Старые `legacy-spb-*` сохраняются как historical aliases, разрешаемые через `index.json.runtime_id_aliases` до конечного canonical ID.

`data/spb_temples.json` и `catalog/temples_active_spb.json` сохранены в полном проекте как исходный/архивный legacy source и его mirror. `data/catalog.json` остаётся curated metadata для проверенных object-page links и не считается canonical place-source.

### M2.6 invariants после M3.5

Frontend consumers используют `PravmirData`, не читают raw place-data напрямую; SPB runtime compatibility fetch отсутствует; 414 historical `legacy-spb-*` aliases продолжают разрешаться в canonical IDs. Structural checks выполняются единым `check_project.py`, runtime smoke — единым `check_runtime.js`.

## v1.3 deterministic source snapshot

Начиная с v1.3 importer не использует текущее время повторного запуска для canonical `source_records[].imported_at`.

`data/schema/source_snapshot.json` фиксирует:
- provider;
- `snapshot_at` — provenance timestamp текущего набора source-файлов;
- SHA256 и размер каждого из 17 региональных CSV.

Перед импортом `tools/import_places.py` проверяет выбранные source-файлы против snapshot. Любое незаявленное изменение CSV становится fatal `source_snapshot_mismatch`, а не тихо создаёт новый canonical dataset.

Фактическое время конкретного запуска сохраняется только в diagnostic `import_report.generated_at`; оно не входит в canonical place records и поэтому не меняет `places_imported.json`, `places_deduped.json` или M2.5 `source_sha256` при идентичном source snapshot.

Deterministic outputs остаются обязательным свойством build pipeline. Начиная с v1.17 одноразовое hash-сравнение повторного build выполняется только при release-проверке и не хранится отдельным test-файлом в проекте.

## M3.1 object routing contract

M3.1 не меняет canonical `place` schema. Он добавляет универсальное представление объекта поверх M2.6 data-layer.

`PravmirData.getDetailUrl(place)` работает в порядке:
1. существующий `detail_path` — сохраняет проверенную ручную legacy/curated страницу;
2. canonical `slug` — `objects/place.html?slug=<stable-slug>`;
3. historical alias `id` — `objects/place.html?id=<old-runtime-id>`, который data-layer сначала разрешает в canonical ID.

`objects/place.html` получает full record только через `PravmirData.getPlaceBySlug/getPlaceById`. Карточка не создаёт отсутствующие данные: расписание, контакты, изображения, святыни и связи не показываются, если их нет в источнике/модели.

Для canonical place доступны фактические поля `address`, `foundation`, `descriptions`, `dedications`, `architects`, `source_records`. После M3.5 это относится и к Санкт-Петербургу; отдельного compatibility SPB record contract больше нет. Координаты используются для перехода на карту и построения маршрута через существующий sessionStorage contract.

## M3.2 Discovery catalog contract

M3.2 не меняет canonical `place` schema и не создаёт отдельную копию данных для каталога.

### SPB normalization после M3.5

Legacy-SPB source сохраняется без изменений как source artifact, а нормализация выполняется внутри importer pipeline до canonical runtime:
- `Действующий` → `active`;
- `сохр.` → `preserved`;
- `строит.` → `under_construction`;
- `неизв.`/неизвестные значения → `unknown`.

Generic legacy category `Храм` консервативно уточняется по leading name token только для поддерживаемых canonical типов (например `Собор`, `Часовня`, `Монастырь`). Raw type/status остаются в `source_records`.

### Discovery search

`PravmirData.search(query, {limit: 'all'})` использует тот же M2.5 inverted index и scoring, что обычный search consumer, но разрешает вернуть полную candidate set для локального faceting. Максимальный safety cap — 20 000 runtime results, что выше текущих 12 957 canonical объектов.

Обычный вызов без `limit` по-прежнему возвращает 20 результатов. Никакого полного scan canonical place array для текстового поиска каталог не выполняет.

### Facet model

`js/catalog-discovery.js` — pure runtime helper без DOM/network. Поддерживает измерения:
- `region`;
- `place_type`;
- `status`.

Facet count конкретного измерения считается с применением query и остальных активных измерений, но без фильтра по самому измерению. Это позволяет показывать meaningful count до переключения facet.

Комбинированный result — пересечение выбранных region + type + status внутри candidate set текущего query.

### URL state

Discovery state сериализуется в query parameters:
- `q`;
- `region`;
- `type`;
- `status`;
- `sort`.

Невалидные region/type/status из внешнего URL сбрасываются в `all`. Browser `popstate` повторно восстанавливает state без отдельного data source.

### Rendering

Catalog UI получает compact runtime docs из `PravmirData`. Рендер выполняется страницами по 60 элементов; следующая порция append'ится к DOM, а не пересоздаёт уже отрисованные карточки.

Карточка использует `PravmirData.getDetailUrl()` и `PravmirData.toMapTarget()`, поэтому object routing и map routing остаются едиными с M3.1/M2.6.

## M3.3 map/region discovery contract

M3.3 не меняет canonical `place` schema. Карта работает поверх того же runtime dataset, что M3.2 catalog.

### Map state

`js/map-discovery.js` хранит чистую логику без DOM/network. Поддерживаемые параметры:
- `q`;
- `region`;
- `type`;
- `status`.

Текстовый candidate set берётся из `PravmirData.search(query, {limit: 'all'})`, затем region/type/status применяются как пересечение. Карта не создаёт отдельный data index.

`PravmirData.mapUrl(options)` сериализует discovery state и `#map`, поэтому переход из каталога сохраняет фильтры.

### Coordinates / bounds

Точки без валидных координат остаются в runtime dataset, но не передаются marker renderer. `coordinateItems()` и `bounds()` используются для viewport fit и не изменяют исходные records.

### Map runtime

`js/map-runtime.js` изолирует network/provider dependencies от data-layer:
- Leaflet 1.9.4;
- markercluster 1.5.3;
- routing-machine 3.2.12;
- local Leaflet 1.9.4 core + CDN fallback;
- OpenStreetMap Standard → CARTO tile fallback;
- optional official Yandex JS API v3 loader.

Map provider failure не должен менять Data Core, search/catalog/object routing и не должен превращаться в uncaught `L is not defined` на странице.

### Yandex JS API v3

API key не является частью Data Core. Он задаётся в `CONFIG.maps.yandexJsApiKey`. При отсутствии ключа Yandex runtime возвращает явную ошибку `YANDEX_KEY_MISSING`, которую UI переводит в безопасный fallback. Реальный v3 key должен настраиваться с HTTP Referer restriction.


## M3.4 advanced search/discovery contract

M3.4 не создаёт новый data source. После M3.5 `PravmirData.searchAdvanced()` строится только поверх единого canonical M2.5 inverted index; отдельный SPB compatibility adapter отсутствует.

Параметры facets: `region`, `type`, `status`. `total` считается после активных filters, а facet counts каждого измерения — с сохранением остальных filters и без собственного измерения.

`PravmirData.suggest()` возвращает ограниченный ranked object list и lightweight region/type suggestions. `catalogUrl()` сериализует search/discovery state, поэтому поиск на главной передаёт запрос и facet в M3.2 каталог без отдельной копии данных.

Exact name и prefix-name получают больший ranking weight, но stable IDs, canonical order и M2.5 generated indexes не изменяются.

## M3.5 canonical SPB migration contract

M3.5 формально подключает `data/spb_temples.json` к Data Core как source `pravmir-legacy-spb`, не изменяя исходный JSON вручную.

### Source identity и snapshot

`data/schema/legacy_sources.json` задаёт provider, формат, canonical region и поле `source_id`. `data/schema/legacy_source_snapshot.json` фиксирует доказуемый snapshot source-файла: 414 records, SHA256 `0bd525a80fee352161e0f34d3ff94b11acb006a37d90e639b53504e11494ae5f`, размер 170199 bytes.

Legacy dataset не содержит доказуемого external upstream URL/provider. Поэтому `external_upstream_provenance` в migration report явно отмечен как отсутствующий; importer не выдумывает источник, которого нет в baseline.

Stable ID каждой SPB source identity строится тем же UUID5 правилом `provider + source_id`, что и для остальных источников. Все 414 source IDs сохраняются в `source_records`.

### Dedupe и aliases

Из 414 legacy source records получается 413 canonical SPB places: records с source IDs `69` и `387` имеют одинаковое нормализованное имя и одинаковые координаты и безопасно объединяются. Остальные близкие/похожие объекты остаются раздельными или review candidates.

M3.5 не выполняет автоматический cross-provider merge SPB с прежними canonical providers. `data/generated/spb_migration_report.json` отдельно фиксирует global cross-canonical audit; unresolved suspicious cross-canonical candidates для текущего snapshot отсутствуют.

Для сохранения ссылочной совместимости используются два уровня истории:
- `import_runtime_id_aliases.json`: `legacy-spb-<source_id>` → initial stable ID;
- `runtime_id_aliases.json`: тот же historical runtime ID → final canonical ID после dedupe alias-chain normalization.

`index.json.runtime_id_aliases` содержит 414 final mappings. Поэтому оба старых IDs `legacy-spb-69` и `legacy-spb-387` разрешаются в один canonical place, а остальные historical IDs остаются адресуемыми.

### Runtime replacement

После проверки canonical shard/index/aliases `PravmirData` больше не загружает legacy SPB JSON. Санкт-Петербург представлен обычным shard `data/generated/regions/sankt-peterburg.json` и участвует в карте, каталоге, поиске и object lookup на тех же правилах, что остальные 17 регионов.

`data/spb_temples.json` и его побайтовый mirror `catalog/temples_active_spb.json` не удаляются: они остаются исходными/архивными файлами, необходимыми для воспроизводимого rebuild и аудита происхождения.

### M3.5 invariants

- imported canonical records: 12 963;
- deduped canonical places: 12 957;
- rejected rows: 645;
- review candidates: 76;
- canonical shards: 18;
- SPB canonical places: 413;
- preserved SPB source records: 414;
- historical SPB runtime aliases: 414;
- compatibility runtime places: 0.

M3.5 invariants входят в единый release checker: source snapshot, provenance coverage, alias completeness, canonical SPB migration и отсутствие compatibility runtime records. Отдельные milestone test-файлы удалены в v1.17.

## M4.1 entity / relation / route graph contract

M4.1 добавляет отдельный derived graph layer поверх canonical `place`. Он **не меняет** schema `place`, stable IDs, slugs, dedupe aliases или regional shards.

### Source identity

Legacy M4 inputs:
- `data/holiness.json` → `pravmir-legacy-holiness`;
- `data/routes.json` → `pravmir-legacy-routes`.

`data/schema/graph_source_snapshot.json` фиксирует SHA256 и размер обоих source-файлов. `tools/build_graph.py` отказывается строить graph при тихом изменении source snapshot.

External provenance для старого project-local контента не выдумывается. До подключения проверяемых внешних/официальных sources эти записи имеют `verification_status: legacy_unverified`.

### Entity

Schema: `data/schema/entity.schema.json`.

Поддерживаемые типы M4.1:
- `saint`;
- `icon`;
- `relic`;
- `shrine`.

Stable entity ID строится детерминированно из provider + source ID и имеет вид `pm-ent-<hash>`. Legacy presentation fields нормализуются в `name`, `title`, `description`, `feast_day`, `location_text`, `saint_name`, `detail_path`; исходная identity сохраняется в `source_records`.

### Relation

Schema: `data/schema/relation.schema.json`.

M4.1 поддерживает:
- `located_at` — entity находится в canonical place;
- `relics_at` — мощи/почитание святого привязаны к canonical place на основании legacy field;
- `relic_of` — relic → saint.

Каждая связь имеет stable ID, typed endpoints, provenance и verification status. Place endpoint обязан существовать в canonical `places_deduped.json`.

Legacy `detail_path` сам по себе не считается доказательством связи. Если location text и legacy-link противоречат друг другу, запись получает `legacy_location_link_conflict`, а canonical place relation **не создаётся**.

Текущий snapshot содержит три таких quarantined conflicts и одну semantically consistent legacy location, для которой canonical place binding пока недостаточно доказан.

### Route

Schema: `data/schema/route.schema.json`.

Начиная с M4.2/v1.9 generated route разделяет два типа ordered points:
- `stops` — **только canonical place references**; каждый stop содержит `order`, обязательный canonical `place_id` и quality flags;
- `waypoints` — сохранённые legacy/curated точки, для которых canonical place binding не доказан; они могут содержать source label/detail_path/coordinates и всегда явно помечены quality flags.

Canonical stop больше не дублирует name/address/coordinates из Data Core. Эти поля гидратируются через `PravmirData.getPlaceById()` во время runtime. Это исключает расхождение route-copy и canonical place source of truth.

Legacy waypoint не считается place и не попадает в `routes_by_place`. Он сохраняется, чтобы не терять исходный маршрут, но не превращается в выдуманный canonical объект. В текущем snapshot так сохранены «Храм Христа Спасителя» и «Арзамас».

Stable route IDs и source provenance M4.1 сохранены без изменения.

### Generated graph

`tools/build_graph.py` детерминированно создаёт:
- `entities.json`;
- `relations.json`;
- `routes.json`;
- `graph_index.json`;
- `graph_report.json`.

`graph_index.json` содержит `relations_by_entity`, `relations_by_place`, `routes_by_place`, `routes_by_entity`. Начиная с M4.3/v1.10 он также содержит детерминированные обратные индексы `places_by_entity` и `entities_by_place`, построенные только из canonical relation endpoints. Route ↔ entity связь выводится только через уже существующий canonical place relation + canonical route stop.

Начиная с M4.4/v1.11 `graph_index.json` schema `1.2.0` также содержит `adjacency`: детерминированный список направленных переходов между узлами `place:<id>`, `entity:<id>`, `route:<id>`. В adjacency разрешены только canonical relation edges и canonical route-stop edges. Legacy waypoints без canonical `place_id` туда не попадают.

### Runtime API

`PravmirData` v1.11.0 сохраняет M4.1–M4.3 API и добавляет M4.4 graph-traversal API:
- `getEntities()`;
- `getEntityById()`;
- `getRelationsForEntity()`;
- `getRoutes()`;
- `getRoutesForEntity()`;
- `getRoutesForPlace()`;
- `getRouteById()` / `getRouteBySlug()`;
- `getRoutePoints()` — hydration canonical stops + ordered legacy waypoints;
- `getEntitiesForRoute()`;
- `getRelationsForPlace()`;
- `routesUrl()` / `routeDetailUrl()`;
- `resolveSiteUrl()`;
- `getRelatedEntitiesForPlace(placeId)` — hydrated entity + relation для canonical place;
- `getRelatedPlacesForEntity(entityId)` — hydrated canonical place + relation для entity;
- `entityDetailUrl()` / `placeDetailUrl()` — stable shareable deep-links relation discovery;
- `traverseGraph(startRef, options)` — bounded shortest-path traversal по generated adjacency;
- `getRelatedPlacesForPlace(placeId)` — canonical places через общий entity или canonical route;
- `getRelatedEntitiesForEntity(entityId)` — связанные entities по shortest canonical graph path;
- `getRouteSuggestionsForPlace(placeId)` / `getRouteSuggestionsForEntity(entityId)` — route suggestions с depth/path evidence;
- `getRelatedRoutesForRoute(routeId)` — related route discovery без legacy waypoint inference.

Graph data lazy-loads и кешируется отдельно от place indexes. `holiness.html` и раздел «Наши маршруты» больше не читают raw legacy source напрямую.

Project URL строится относительно фактического URL `js/data-layer.js`, поэтому deployment в подпапку/GitHub Pages не должен превращать dynamic links в site-root paths.

### M4.1 invariants

- 7 migrated entities;
- 4 safe legacy-derived relations;
- 2 migrated routes;
- 2 canonical route stops;
- 2 preserved legacy route waypoints;
- 0 noncanonical records inside canonical `route.stops`;
- 3 quarantined legacy location/link conflicts;
- no dangling entity/place/route references;
- deterministic graph outputs for identical source snapshot;
- M2/M3 place dataset unchanged.
### M4.2 route detail / map contract

`routes/route.html` + `js/route.js` — универсальная route detail page по `id` или `slug`. Страница получает route/points/entities только через `PravmirData`.

Multi-stop map использует local Leaflet core через `PravmirMapRuntime`. Для route detail optional markercluster/routing plugins не загружаются, чтобы не блокировать мобильный экран. Все доступные точки показываются в заданном порядке; между ними рисуется только пунктирная визуальная линия. Она явно не считается автомобильной/пешеходной route geometry.

Кнопка общей карты переносит ordered points через существующий sessionStorage contract; `home.js` показывает отдельный route preview layer и сохраняет прежний single-destination flow. External navigation передаётся внешнему картографическому сервису, который уже сам рассчитывает реальный маршрут.

M4.2 deep-link contract:
- route → canonical place: `objects/place.html?id|slug=...`;
- canonical place → route: `getRoutesForPlace()` на universal object page;
- entity → route: существующий graph route filter;
- route → entity: `getEntitiesForRoute()`;
- search → route: главная search surface дополнительно запрашивает `getRoutes({query})`.

`PravmirMapRuntime` теперь разрешает локальные asset URLs относительно project root, поэтому local Leaflet остаётся primary и на вложенных страницах (`routes/route.html`), а не только на root `index.html`.



### M4.3 relation discovery contract

M4.3 не создаёт новых фактических связей из UI metadata. Единственным источником place ↔ entity discovery являются generated canonical `relations.json` и соответствующие graph indexes.

Правила:
- legacy `detail_path` не является доказательством location relation;
- `location_text` сохраняется как provenance/legacy text и не становится place ID через догадку;
- conflict/unresolved записи не появляются в `places_by_entity` / `entities_by_place`;
- object page показывает entity только если существует canonical relation с этим place;
- entity detail показывает canonical place только если relation реально существует;
- каждая показанная связь сопровождается `verification_status` и `provenance`;
- `legacy_unverified` явно отображается как требующий проверки, а не как независимо подтверждённый факт.

Текущий snapshot M4.3:
- 7 entities;
- 4 relations;
- 3 unique canonical place ↔ entity links;
- 4 `legacy_unverified` relations;
- 0 `source_verified` relations;
- 3 quarantined location/link conflicts;
- 1 unresolved canonical location.

`holiness.html?entity=<stable-id>` является shareable entity state. `holiness.html?search=<query>` также реально применяется к entity catalog. Route → entity deep-link использует stable entity ID, а не имя как неявный идентификатор.


### M4.4 graph traversal / related discovery contract

M4.4 не добавляет новых factual relations. Он индексирует уже существующие canonical graph edges и canonical route stops, после чего выполняет bounded shortest-path traversal.

Правила:
- node key имеет вид `place:<stable-id>`, `entity:<stable-id>` или `route:<stable-id>`;
- relation edge содержит `relation_id`, `relation_type`, `verification_status`;
- route-stop edge содержит `route_id`, canonical stop `order`, `verification_status`;
- каждое undirected factual edge хранится как две deterministic adjacency arcs;
- traversal depth ограничен максимум 4 переходами, result limit — максимум 100;
- start node не возвращается как recommendation;
- legacy waypoint без canonical place ID не является graph node;
- quarantined/unresolved legacy entity не получает place/route recommendation без canonical edge;
- UI получает `depth`, `path` и machine-readable `reason`, поэтому recommendation можно объяснить и воспроизвести.

Текущий snapshot M4.4:
- connected nodes: 7;
- undirected traversal edges: 6 (4 relations + 2 canonical route stops);
- directed arcs: 12;
- legacy waypoints in adjacency: 0.

UI использует единый traversal contract:
- place → route suggestions / related places;
- entity → related entities / route suggestions;
- route → entities / related routes.

Traversal обязан оставаться детерминированным, без dangling nodes и без legacy-waypoint leakage. Эти свойства входят в единый project/runtime verification contract вместо отдельных M4.4 test-файлов.

### M4.5 verified graph-source contract

Начиная с v1.12 verified factual graph expansion не выполняется ручным редактированием `data/generated/relations.json`.

Source-of-truth pipeline:
1. проверяемый claim добавляется в `data/graph_sources/verified_relations.json`;
2. файл обязан совпадать с `data/schema/graph_source_snapshot.json` по SHA256/size;
3. `tools/import_graph_sources.py` валидирует bundle по `verified_graph_source.schema.json`, проверяет тип endpoints и существование canonical refs;
4. importer детерминированно создаёт `verified_graph_claims.json` и source report;
5. `tools/build_graph.py` материализует claims в canonical relations и отказывается работать со stale generated claims;
6. единый release checker проверяет materialization, provenance и historical quarantine invariants без отдельного M4.5 checker-файла.

Verified claim обязательно содержит source identity, HTTPS URL, authority class, checked date, evidence note и typed relation endpoints.

`relation.source_records` является полной цепочкой provenance. Поздний verified claim может подтвердить корректную связь для сущности, которая ранее имела ошибочный legacy link, но не имеет права стирать исходный conflict record. Ошибочный legacy `detail_path` при этом не становится evidence новой canonical relation.

M4.5 current snapshot:
- 7 verified claims from 5 official providers;
- 7 `source_verified` relations;
- 6 unique canonical place ↔ entity links;
- 3 historical `legacy_location_link_conflict` records preserved;
- 1 historical unresolved record preserved;
- 13 connected traversal nodes, 9 undirected edges, 18 directed arcs.

`PravmirData` v1.12.0 гидратирует verified provenance из generated graph. Frontend не читает raw source bundle напрямую.

## M5.1 Content Core contract — v1.13

M5 вводит отдельный canonical content layer поверх уже существующих place/graph contracts. Он не меняет `place`, entity/relation/route IDs и не смешивает editorial/content records с factual graph без explicit evidence.

### Content source snapshot

`data/schema/content_source_snapshot.json` фиксирует SHA256/size Content Core source inputs. Исторические M5.1 inputs:
- `data/articles.json`;
- `data/pilgrim-centers.json`;
- `data/content_sources/journalpp_legacy.json`;
- `data/content_sources/calendar_2026_legacy.json`.

M5.2 добавил snapshotted article bodies, а v1.21 добавляет `data/content_sources/editorial_links.json` как отдельный explicit editorial source typed cross-domain links.

`tools/build_content.py` прекращает сборку при silent source drift. Generated outputs не содержат runtime timestamp и должны быть byte-deterministic для идентичного snapshot.

### Canonical record families

`content_item.schema.json`:
- stable `pm-content-*` ID;
- stable source-oriented slug;
- `content_type` (`article`, `external_article`, `news`, `guide`, `recipe`);
- title/summary/author/date/tags;
- internal `body_path` либо external URL;
- `verification_status` + `source_records`;
- typed `references`.

`event.schema.json` начиная с M5.4 является canonical event contract. Исторический M5.1 `events.json` сохраняется как compatibility payload и остаётся пустым; M5.4 factual runtime использует отдельные `event_records.json`/`event_index.json` через `PravmirEvents`.

`calendar_entry.schema.json` разделяет feast/commemoration/fast/calendar_event и хранит date range. Legacy 2026 data помечается `calendar_system: civil_date_legacy` и `verification_status: legacy_unverified` до M5.3 source verification.

`pilgrim_service.schema.json` хранит service type, name, region text, organization, contacts, provenance и typed refs. M5.1 сохраняет 85 legacy records без автоматического place binding.

`content_link.schema.json` — отдельный verified/editorial cross-domain relation contract. Schema-supported endpoint kinds:
- `content`, `event`, `calendar_entry`, `pilgrim_service`;
- `place`, `entity`, `route`;
- `author`, `saint`, `icon`, `feast`, `work`, `organisation`;
- `calendar_day`, `commemoration`, `fasting_rule`, `reading`.

Текстовое совпадение названия не является evidence для `content_link`.

### Generated Content Core

`tools/build_content.py` создаёт:
- `data/generated/content_items.json`;
- `events.json`;
- `calendar_entries.json`;
- `pilgrim_services.json`;
- `content_links.json`;
- `content_index.json`;
- `content_report.json`.

`content_index.json` содержит global `by_id`, `by_slug` и единый compact search index для всех M5 record families. Каждый generated payload содержит один и тот же `source_snapshot_sha256`.

M5.1 snapshot:
- content: 21;
- events: 0;
- calendar entries/ranges: 31;
- pilgrim services: 85;
- content links: 0;
- search documents: 137.

### Runtime boundary

`window.PravmirContent` (`js/content-layer.js`) — runtime boundary для M5.1–M5.2 content families. Начиная с M5.3 домены имеют отдельные boundaries: календарь использует `window.PravmirLiturgical`, события — `window.PravmirEvents`, православная кухня — `window.PravmirFood`. `PravmirContent.getEvents()` сохраняет backward compatibility и делегирует event layer при его наличии.

API v1.13.0:
- `getContentItems`, `getContentById`, `getContentBySlug`;
- `getEvents`;
- `getCalendarEntries`, `getCalendarEntriesForDate`;
- `getPilgrimServices`;
- `search`;
- `getLinksFor`, `getRelated`, `resolveReference`.

`resolveReference` для place/entity/route делегирует существующему `PravmirData`; M5 не дублирует place/graph records.

M5.2 перевёл journal surfaces на `PravmirContent`; M5.3 — calendar surfaces на `PravmirLiturgical`; M5.4 — event surfaces на `PravmirEvents`; M5.5 добавил food surfaces через `PravmirFood` и calendar/day integration. Raw/legacy/source bundles остаются provenance/build inputs, а не параллельной runtime-базой.

### M5.1 invariants

- source files preserved and snapshotted;
- deterministic build;
- schema-valid generated records;
- global ID/slug uniqueness;
- exact source coverage (no lost legacy rows);
- no dangling typed refs;
- no inferred content↔graph links;
- raw content source is not fetched by `PravmirContent`;
- M2/M3/M4 canonical counts and IDs unchanged.

## M5.2 Journal & canonical article delivery contract — v1.14

M5.2 не меняет stable `pm-content-*` IDs M5.1. Он расширяет delivery metadata и переводит journal surfaces на generated Content Core.

### Content metadata

`content_item` дополнительно содержит:
- `canonical_path` — стабильный internal deep-link `articles/article.html?slug=<slug>`;
- `author_ref` → `pm-author-*`;
- `category_refs[]` → `pm-category-*`;
- `publisher`;
- `media[]` (`emoji/image/audio/video` contract; текущий legacy snapshot фактически содержит emoji presentation metadata);
- `body_ref` для generated local article body.

`author_ref` и `category_refs` материализуются только из explicit `author`/`tag`/section metadata legacy sources. Это content metadata, а не factual graph inference.

### Author/category registries

Generated:
- `content_authors.json` — stable authors with source_records;
- `content_categories.json` — stable categories with source_records.

Они готовят M5 к future `author` graph/domain entity, не смешивая её преждевременно с organisation/person canonical facts.

### Article body delivery

10 `articles/article-*.html` добавлены в `content_source_snapshot.json` как legacy local article body sources.

`build_content.py`:
1. подтверждает snapshot hash/size;
2. извлекает только `.article-content` body;
3. удаляет legacy UI controls из body delivery;
4. разрешает ограниченный HTML subset;
5. пишет `content_bodies.json` с `content_id`, `source_file`, `source_sha256`.

Runtime article surface не fetch'ит legacy article HTML.

### Canonical article surface

`articles/article.html` + `js/article.js` разрешают `slug`/`id` через `PravmirContent` и показывают:
- title/summary;
- author/category/publication metadata;
- media presentation;
- verification/provenance;
- generated body либо safe external-source handoff;
- typed Knowledge Graph links, только если они реально присутствуют в `content_links`;
- related-content suggestions.

External material не открывается автоматически. Canonical card ПМ отделена от original source URL.

### Related content semantics

`PravmirContent.getRelatedContent()` может ранжировать материалы по shared explicit category/tag metadata.

Это **derived discovery**, не `content_link`, не factual graph relation и не evidence связи с place/entity/route.

### Runtime boundary

`PravmirContent 1.14.0` сохраняет API M5.1 и объявляет compatibility `1.13.0`.

Новые методы:
- `getAuthors`, `getAuthorById`;
- `getCategories`, `getCategoryById`;
- `getArticleBody`;
- `getRelatedContent`.

Journal и home journal preview обязаны получать content через `PravmirContent`; `data/articles.json`, legacy external arrays и article source HTML не являются runtime journal database.

### Current M5.2 counts

- content items: 21;
- content authors: 11;
- content categories: 7;
- generated local article bodies: 10;
- events: 0;
- calendar entries/ranges: 31;
- pilgrim services: 85;
- canonical content links: 0;
- unified search documents: 137.


## v1.21 Content/Existing Domains expansion contract

Исторические M5.1/M5.2 counts выше сохраняются как снимок соответствующих milestone. Текущий v1.21 слой расширяет только explicit cross-domain links:

- current canonical content links: **11**;
- source: `data/content_sources/editorial_links.json`;
- provider: `pravmir-editorial-content-links`;
- trust layer: `editorial`;
- verification status: `editorial_verified`;
- stable IDs: детерминированные `pm-clink-*`;
- endpoints создаются только из явно перечисленных stable IDs; title/text matching запрещён как evidence;
- relation provenance хранит source file/row/source ID;
- обратная навигация place/entity ← content вычисляется runtime через `PravmirContent.getRelated()` и не материализует новый factual graph edge;
- `PravmirContent 1.21.0` разрешает liturgical references делегированием `PravmirLiturgical`, не дублируя records;
- M4 source-verified graph relations остаются отдельным canonical fact layer и не повышаются/не заменяются editorial links.

Текущий `reading` count остаётся **0**. Наличие schema/runtime не даёт права импортировать текст Писания без подходящего source, licensing, jurisdiction/tradition и applicability metadata.


## v1.23 Today / Daily Layer orchestration contract

`window.PravmirToday` — consumer/orchestration boundary, а не новый canonical fact domain. Он не имеет source manifest, schema family или generated storage и не читает raw/generated JSON напрямую.

`PravmirToday 1.23.0` использует только публичные domain APIs:
- `PravmirLiturgical.getDayBundle/getRecords` — day, feast/saint/commemoration/fasting/readings;
- `PravmirContent.getRelated/getContentItems` — explicit related content либо явно помеченный latest fallback;
- `PravmirEvents.getForDate` — только canonical events; review queue не является runtime source Today;
- `PravmirFood.getForDate` — только existing `editorial_guidance` relations к fasting_rule/feast.

### Non-inference rules

- отсутствие liturgical record не заполняется по названию даты;
- отсутствие reading не создаёт citation: допускается только ссылка на ближайшую дату уже существующего explicit coverage;
- latest journal fallback не получает semantic relation к календарному дню;
- generic recipes не выдаются за рекомендацию дня без existing food relation;
- demo/community/review event records не попадают в snapshot;
- Today не материализует новые Knowledge Graph edges.

### Snapshot shape

`getSnapshot(date)` возвращает composition: `day`, `items`, `feasts`, `saints`, `commemorations`, `fasting_rules`, `readings`, optional `next_reading`, `food`, `events`, `related_content`, `latest_content`, `content_mode`, `trust`. Все IDs/records принадлежат исходным domain layers.

Этот контракт завершает текущий Data & Existing Domains Expansion integration layer и подготавливает будущий ключевой экран «Сегодня» к дальнейшему наполнению M5.6–M5.9 без обхода domain boundaries.

## v1.22 Liturgical readings/source-quality expansion contract

Исторический M5.3 snapshot ниже остаётся неизменённым как описание состояния v1.15. Текущий v1.22 расширяет этот домен отдельным editorial reading source, не переписывая legacy calendar facts.

### Multi-provider source contract

`data/liturgical_sources/source_manifest.json` содержит два независимых provider scopes:
- `pravmir-legacy-calendar-2026` — `legacy_unverified`, исходные feast/saint/commemoration/fasting records;
- `azbyka-calendar-2026-editorial` — `editorial_verified`, библиографические reading references; `jurisdiction.code = unspecified`, поэтому provider не трактуется как официальный юрисдикционный источник.

`data/schema/liturgical_source_snapshot.json` v1.1.0 фиксирует legacy source, semantic mapping, manifest и `readings_2026_editorial.json`. Новые reading IDs строятся только из explicit provider/source IDs; text/title matching не создаёт reading record или relation.

### Reading record semantics

Current counts:
- reading: **48** на **13** civil dates;
- liturgical_relation: **215** total, из них 48 explicit `calendar_day -> reading` / `has_reading`;
- остальные M5.3 family counts сохранены: 365 days / 15 feasts / 7 saints / 8 commemorations / 4 fasting rules / 31 legacy aliases.

Каждый v1.22 `reading` содержит:
- stable `pm-reading-*` ID;
- date, service label, Scripture citation и при наличии lection reference;
- `verification_status: editorial_verified`;
- provider scope/provenance и exact `source_url`;
- `text_ref: null`.

Generated payload не содержит Scripture body. В v1.22 импортируется только библиографическая ссылка на место чтения. Если source не даёт явный список (в текущем snapshot это 2026-11-04 и 2026-12-04), record не создаётся и факт не выводится из названия праздника.

### Runtime/UI

`PravmirLiturgical 1.22.0` сохраняет API v1.15 (`getStats`, `getCoverage`, `getCalendarDay`, `getDayBundle`, `getById`, `getBySlug`, `getRecords`, `getRelations`, `resolveReference`, `resolveLegacyCalendarEntry`). Calendar day UI показывает readings отдельным блоком; item provenance может вести на exact source page. Raw source files frontend не читает.

## M5.3 Calendar / Liturgical Core contract — v1.15

M5.3 вводит отдельный доменный runtime boundary `window.PravmirLiturgical`. Старый `calendar_entries.json` сохраняется как M5.1 compatibility/provenance слой и не является runtime-базой мигрированного `calendar.html`.

### Source layer

- `data/liturgical_sources/source_manifest.json` описывает provider, source class, verification status, jurisdiction, tradition, calendar style, locale и временную применимость.
- `data/liturgical_sources/calendar_2026_semantics.json` содержит только explicit migration semantics (fast-start aliases и commemoration→saint decompositions). Эти mappings не повышают verification status.
- `data/schema/liturgical_source_snapshot.json` фиксирует SHA256/size legacy calendar source, semantic map и source manifest.
- текущий provider `pravmir-legacy-calendar-2026` имеет `verification_status: legacy_unverified`, `verified_at: null`, coverage `2026-01-01..2026-12-31`.

### Canonical record families

Generated schemas/records:
- `calendar_day` → `pm-day-YYYY-MM-DD`;
- `feast` → `pm-feast-*`;
- `saint` → `pm-saint-*`;
- `commemoration` → `pm-comm-*`;
- `fasting_rule` → `pm-fast-*`;
- `reading` → `pm-reading-*`;
- `liturgical_relation` → `pm-lrel-*`.

Каждая domain record содержит stable ID, canonical path, provenance/source records, verification status и scope: `jurisdiction`, `tradition`, `calendar_style`, `locale`, `valid_from`, `valid_to`, `verified_at`.

`calendar_day` создаётся детерминированно для каждого civil day source coverage и имеет `verification_status: system_derived`. Это не означает верификацию литургических facts, связанных с днём.

### Aliases / compatibility

Все 31 historical M5.1 `pm-cal-*` IDs сохранены в `calendar_entries.json`. `liturgical_aliases.json` разрешает каждый из них в новую canonical record family. Четыре legacy «Начало ... поста» явно alias'ятся на соответствующий canonical fasting period вместо создания дубликата факта.

### Relations

`liturgical_relations.json` хранит typed relations между `calendar_day`, feast, commemoration, saint, fasting_rule и reading. Cross-domain relation не создаётся по совпадению текста. Saint relations в текущем snapshot существуют только там, где mapping явно записан в semantic source file.

### Readings

Schema/runtime/index для readings реализованы, но текущий legacy source не содержит reading evidence. Поэтому `readings.json` корректно содержит 0 records. Наполнение требует отдельного verified/editorial source с jurisdiction/tradition/applicability metadata.

### Runtime API

`PravmirLiturgical 1.15.0`:
- `getStats`, `getCoverage`;
- `getCalendarDay`, `getDayBundle`;
- `getById`, `getBySlug`, `getRecords`;
- `getRelations`, `resolveReference`;
- `resolveLegacyCalendarEntry`.

Runtime проверяет единый `source_snapshot_sha256` всех payloads и кеширует generated data после первой загрузки. `calendar.html`, `calendar/day.html`, `calendar/item.html` не читают raw/legacy sources.

### M5.3 snapshot counts

- calendar_day: 365;
- feast: 15;
- saint: 7;
- commemoration: 8;
- fasting_rule: 4;
- reading: 0;
- liturgical_relation: 167;
- legacy calendar aliases: 31.

## M5.4 Events contract — v1.16

M5.4 отделяет реальные temporal events от исторического пустого M5.1 compatibility family `events.json`. Canonical event runtime строится только из explicit event source bundles.

### Trust/source channels

`data/event_sources/source_manifest.json` задаёт три независимых канала:
- `editorial` — редакционные записи ПМ; canonical-eligible только после явной проверки;
- `verified_organisation` — данные подтверждённой организации;
- `community` — пользовательские предложения, которые всегда идут в review queue.

`data/schema/event_source_snapshot.json` фиксирует SHA256/size manifest и source bundles. Silent source drift — fatal build error.

Текущий package содержит 4 синтетических development seeds (`[ДЕМО]`): 3 editorial `draft` + 1 community contribution. Они нужны для проверки trust/review flow и **не являются реальными событиями**. Builder помещает их только в `event_review_queue.json`.

### Canonical event

`event` содержит:
- stable `pm-event-*` ID и slug;
- title/summary/type/status;
- temporal: `starts_at`, `ends_at`, `all_day`, valid IANA timezone, explicit UTC offset for timed records, recurrence;
- venue и organizer metadata;
- registration metadata;
- trust layer + verification status;
- freshness: `observed_at`, `verified_at`, `expires_at`;
- scope: jurisdiction/tradition/locale;
- explicit typed references;
- immutable source records;
- canonical deep link.

Canonical-eligible record без `verified_at` или без `source_url/evidence_note` отклоняется. Draft и community records не проходят в canonical delivery.

### Relations

`event_relation` связывает event только с explicit target ID. Разрешённые target kinds:
`place`, `entity`, `route`, `content`, `calendar_day`, `feast`, `saint`, `commemoration`, `fasting_rule`, `reading`, `organisation`.

Для всех существующих registries target должен реально существовать. `organisation` уже предусмотрен типом, но builder намеренно не допускает canonical organisation target до M7 registry: `Place != Organisation`.

Никакого text/title matching и promotion из journal/news/calendar prose нет.

### Generated outputs

`tools/build_events.py` создаёт:
- `event_records.json`;
- `event_relations.json`;
- `event_aliases.json`;
- `event_review_queue.json`;
- `event_rejected.json`;
- `event_index.json`;
- `event_report.json`.

`event_index.json` содержит by-id/by-slug, date/type/target indexes и date ranges для multi-day overlap.

### Runtime API

`PravmirEvents 1.16.0`:
- `getStats`;
- `getEvents`;
- `getForDate`;
- `getUpcoming`;
- `getById`;
- `getBySlug`;
- `getRelations`;
- `getRelatedEvents`;
- `resolveReference`.

Runtime читает только generated payloads и проверяет единый source snapshot hash. Calendar UI и calendar-day page используют `PravmirEvents`, поэтому future verified events автоматически появляются на соответствующих днях без чтения raw sources.

### Current M5.4 snapshot

- source rows: 4 synthetic review-only;
- canonical events: 0;
- event relations: 0;
- aliases: 0;
- review queue: 4;
- rejected rows: 0;
- automatic text promotion: false;
- community writes canonical: false.



## M5.5 Orthodox Food contract — v1.17

M5.5 вводит отдельный culinary domain поверх canonical liturgical data. Он не определяет меру поста и не создаёт церковные предписания.

### Source and provenance

Source-of-truth:
- `data/food_sources/source_manifest.json`;
- `data/food_sources/recipes_editorial.json`;
- `data/schema/food_source_snapshot.json`.

Каждый recipe имеет stable `pm-recipe-*` ID, canonical slug/path, editorial provenance и явный `source_record`. Silent source drift блокирует build.

### Recipe contract

`recipe` содержит:
- title/summary/type;
- servings и время приготовления;
- structured ingredients/steps;
- tags;
- dietary profile;
- fasting compatibility classification;
- canonical path;
- provenance.

Текущая классификация `general_fast_friendly` означает только общий состав без мяса/молочных продуктов/яиц/рыбы. `oil_mode` отдельно показывает использование масла.

### Food relations

M5.5 создаёт typed recipe → fasting_rule и recipe → feast links только как `relation_class: editorial_guidance` и `verification_status: editorial_guidance`. Feast binding допускается только через explicit stable `feast_refs` в editorial source record; текстовое совпадение названия не является evidence. Эти связи нужны для discovery/UI и не являются canonical liturgical fact. `food_report.json` обязан фиксировать `canonical_liturgical_prescriptions_created: 0`.

### Generated outputs

`tools/build_food.py` создаёт:
- `recipe_records.json`;
- `food_relations.json`;
- `food_index.json`;
- `food_report.json`.

### Runtime API

`PravmirFood 1.17.0`:
- `getStats`;
- `getRecipes`;
- `getById`;
- `getBySlug`;
- `getRelations`;
- `getForFastingRule`;
- `getForFeast`;
- `getForDate`.

`getForDate` использует `PravmirLiturgical.getDayBundle()` и объединяет редакционные подборки для активных `fasting_rule` records и explicit feast relations. Calendar UI и canonical calendar-day page ведут в `food.html?date=...`.

### Current M5.5 snapshot

- recipes: 9 (6 post-friendly + 3 festive editorial recipes);
- food relations: 27 (24 fasting-period guidance + 3 feast guidance);
- linked fasting rules: 4;
- canonical liturgical prescriptions: 0.

## v1.18 frontend/runtime boundary clarification

Product surfaces обязаны использовать уже существующие runtime layers, включая вторичные виджеты и legacy UI:

- домашний календарный виджет получает `feast`, `commemoration` и `fasting_rule` только через `PravmirLiturgical`; отдельный inline `calendar2026` удалён;
- каталог паломнических служб получает все records только через `PravmirContent.getPilgrimServices()` и generated `pilgrim_services.json`;
- `data/pilgrim-centers.json` остаётся source/provenance input `build_content.py` и не является runtime endpoint;
- ошибка загрузки generated layer показывается пользователю и не подменяется встроенным набором записей;
- 85 текущих pilgrim-service records сохраняют `legacy_unverified` и не превращаются в verified organisation/amenity/place relation без evidence.

Локальный профиль v1.18 хранит `pravmirLocalProfile`, `readLater`, `favorites` и `myRoutes` только в `localStorage`. Это временный device-local product layer, не account contract M6. Сохранённая карточка может содержать внутренний `url`; профиль открывает только same-origin URL.

Release environment описан `requirements.txt`. Строгий `run_m2.py --verify-only` требует Node.js, проверяет runtime smoke и полный `FILE_SHA256SUMS.txt`; manifest исключает только себя и два timestamped diagnostic reports.

## v1.19 presentation contract

Schemas, source snapshots, canonical IDs, aliases и typed relations не меняются ради визуального обновления.

| Основное направление | Существующий URL | Группировка вложенных страниц |
| --- | --- | --- |
| Сегодня | `index.html` | calendar/events |
| Рядом | `index.html#map` | только состояние карты на home |
| Исследовать | `catalog/catalog.html` | places, holiness, journal/articles, food |
| Паломничество | `routes/routes.html` | route detail и legacy service catalog |
| Мой ПМ | `profile.html` | device-local списки и настройки |

Вторичные разделы сохраняют прежние canonical URLs и доступны отдельно из menu/footer. Hash-aware active state не создаёт новые domain aliases.

`window.PravmirUI` отвечает только за SVG/человекочитаемые статусы/форматирование дат. Это presentation helper, не новый источник данных и не подтверждение facts. Неизвестный status не обозначается как verified.

Home route preview читает `PravmirData.getRoutes()` и использует `routeDetailUrl()`. Duration и legacy status явно относятся к исходному описанию; неподтверждённые amenities не выводятся как действующие сервисы.

Food date filter использует набор recipe IDs из `PravmirFood.getForDate()` и существующие `editorial_guidance` relations. Он не создаёт литургическое предписание, factual relation или запись события. Пустая event афиша не подменяется четырьмя demo records из review queue.

Source metadata сохраняется полностью в данных и доступна в UI disclosures. 10 snapshotted article HTML не редактируются ради интерфейса; generated body и canonical article surface остаются основным delivery contract. Menu/skip-link не имеют права переименовывать существующий ID domain main container.


## v1.20 runtime performance contract

v1.20 не меняет canonical data model и не вводит новую сущность. Изменён только способ потребления существующих M2.5 derived indexes:

- search/discovery consumer загружает `search_index.json` независимо от `index.json`;
- exact ID/slug/region lookup загружает `index.json` независимо от search index;
- `PravmirData.init()` остаётся совместимым full-init, но product pages должны вызывать минимальный нужный API;
- map place documents по-прежнему приходят только через `PravmirData.getMapPlaces()`; lazy boot карты не является новым data source;
- routing/cluster plugins не являются data-layer и не создают canonical facts;
- map viewport cards строятся только из уже отфильтрованных canonical UI documents;
- ни один frontend consumer не получает разрешение читать raw place/source files напрямую.

Stable IDs, aliases, `source_sha256`, regional shards, canonical URLs и M2–M5.5 graph/content/liturgical/event/food contracts остаются без миграции.


# M5.6.1 — Pilgrim Infrastructure Core (v1.24)

## Domain boundary

Новый browser boundary — `window.PravmirPilgrim`. Product UI читает только generated M5.6 payloads. `data/pilgrim-centers.json` и `data/pilgrim_sources/*` являются build/provenance inputs и не являются runtime database. Старый `PravmirContent.getPilgrimServices()` сохраняется только для обратной совместимости.

## Entity families

- `amenity_type` — системная taxonomy (`pm-amenity-type-*`), 12 записей, `canonical_system/system_defined`;
- `amenity` — будущий canonical физический/сервисный объект инфраструктуры (`pm-amenity-*`);
- `service` — будущая canonical услуга (`pm-service-*`);
- `pilgrim_relation` — typed relation `amenity|service → place|route|organisation|amenity|service`;
- `pilgrim_review_item` — evidence/review слой legacy-данных, не canonical fact.

Canonical amenity/service обязаны иметь stable ID, slug, aliases, canonical path, status/availability, contacts, provenance и `freshness` с полями `observed_at`, `verified_at`, `valid_from`, `valid_to`, `expires_at`. Amenity дополнительно поддерживает address/coordinates, opening hours, accessibility и family suitability.

## Trust separation

Canonical amenity/service verification statuses: `source_verified`, `verified_organisation`, `editorial_verified`, `community_unverified`. `legacy_unverified` **не допускается** как canonical verification status.

Все 85 строк старого `data/pilgrim-centers.json` в v1.24 находятся в `pilgrim_review_queue.json` со статусом `needs_evidence`. Каждая запись сохраняет raw fields, source row, URL/contact provenance и прежний compatibility `legacy_ref`. `candidate_refs` пусты у 85/85 записей. Совпадение названия, города, организации, телефона или URL само по себе не создаёт canonical link.

`Place != Organisation`: поле текста организации в legacy queue остаётся `organisation_text`; никакая Organisation entity не создаётся до M7. Typed relation на `organisation` предусмотрен schema для будущего, но release checker v1.24 запрещает фактические organisation relations.

## Deterministic outputs

`tools/build_pilgrim.py` проверяет source snapshot и создаёт:
- `amenity_types.json`;
- `amenity_records.json`;
- `pilgrim_service_records.json`;
- `pilgrim_relations.json`;
- `pilgrim_review_queue.json`;
- `pilgrim_rejected.json`;
- `pilgrim_index.json`;
- `pilgrim_report.json`.

M5.6.1 counts: 12 types / 0 amenities / 0 services / 0 relations / 85 review / 0 rejected. Нулевые canonical counts являются намеренным trust-gate, а не отсутствием реализации.


# M5.6.2 — Evidence / Verification / Binding (v1.25)

Canonical M5.6 record может быть создан только из `canonical_records` provider, закреплённого в `pilgrim_source_snapshot.json`. Источник обязан явно содержать stable target ID; build pipeline не ищет target по названию, адресу, региону, телефону или URL.

Current v1.25 snapshot: 12 amenity types / 2 amenities / 2 services / 4 relations / 85 review items / 1 unresolved evidence conflict / 0 rejected. Две legacy service rows имеют `review_status: promoted`, `candidate_refs[].basis: explicit_evidence` и evidence на официальный source; 83 строки остаются `needs_evidence`.

Canonical records v1.25 используют `trust_layer: editorial` + `verification_status: source_verified`: это означает, что редакционная система ПМ проверила официальный публичный источник, но организация ещё не заявлена/верифицирована через будущий M7 claim flow. `verified_organisation` не присваивается без такого flow.

Relation создаётся только из source bundle как `amenity|service → place` с `source_verified` provenance. Organisation entities и organisation relations до M7 не создаются.

При конфликте официальных источников build сохраняет значения в `pilgrim_conflicts.json` со статусом `unresolved`. Пока конфликт не разрешён evidence/manual review, соответствующий canonical fact не создаётся и существующее значение не перетирается.


# M5.6.3 — Discovery / Route Integration (v1.26)

v1.26 does not add or mutate canonical M5.6 facts. Discovery consumers may traverse an existing canonical route stop to its stable `place_id`, then call `PravmirPilgrim.getForPlace(place_id)` to surface amenities/services already connected by explicit source-verified M5.6 relations. This traversal is presentation/discovery logic and must not be persisted as a `supports_route` relation.

Canonical infrastructure search/filter state (`q`, type, status) is a runtime concern. Freshness labels are computed from `freshness.verified_at`; they do not modify source status. Legacy review rows remain a separate trust layer and are not returned as canonical amenity/service search results.


# M5.6.4 — Domain Gate (v1.27)

M5.6 closes without adding new canonical records. The gate fixes the current trust-safe topology: 12 system amenity types, 2 source-verified amenities, 2 source-verified services, 4 explicit `amenity|service → place` relations, 85 preserved legacy review items (2 promoted by evidence, 83 pending), 1 unresolved conflict and 0 rejected rows.

Canonical deep links/slugs must be unique, mutable records must keep the full freshness contract, all canonical evidence URLs must be HTTPS, and every generated M5.6 payload must share the source snapshot hash used by `pilgrim_index.json`. Unresolved conflicts may not appear as canonical amenity/service facts.

Persisted route relations remain zero. Route surfaces may discover infrastructure only through `route stop → stable place ID → explicit M5.6 place relation`. Persisted organisation relations remain zero until M7; provider text does not create an Organisation entity.

`PravmirPilgrim.getTrustSummary()` is a computed runtime view over generated payloads, not a new data source or trust authority. Legacy review data remains excluded from canonical amenity/service search.


# M5.7.1 — News Core (v1.28)

News becomes a separate temporal/trust domain. `content_type=news` in legacy Content Core remains a compatibility/content record and does not become a canonical News fact automatically. The initial source `pravmir-legacy-journalpp` is `review_only` and `legacy_unverified`.

Generated boundary: `news_sources.json`, `news_records.json`, `news_relations.json`, `news_review_queue.json`, `news_rejected.json`, `news_index.json`, `news_report.json`. Product UI reads these only through `PravmirNews`; `data/content_sources/journalpp_legacy.json` and `data/news_sources/*` are build/provenance inputs.

Initial snapshot: 1 source / 0 canonical news / 0 relations / 5 review / 0 rejected. Each review row preserves source publication date, source URL, provider/source-row provenance and an exact `legacy_content_ref` back to the existing Content Core record. That bridge is provenance identity, not a canonical news relation.

Future canonical News records require stable `pm-news-*` IDs, canonical paths, explicit publication/update timestamps, provenance and freshness (`observed_at`, `verified_at`, validity/expiry when applicable). Canonical relations may target place/event/entity/content/route and, only after an organisation registry exists, organisation. Text/title matching must never create a canonical relation.


# M5.7.2 — Source Verification & Temporal Ingestion (v1.29)

Canonical News ingestion is allowed only from a `canonical_source` provider in the frozen News source snapshot. v1.29 adds `pravmir-editorial-patriarchia-verification-2026-10-05`, containing three manually verified official Patriarchia.ru publications.

Each canonical record has a stable `pm-news-*` ID, unique slug/canonical path, exact source publication timestamp, `original_url`, publisher, `editorial/source_verified` trust state, and freshness observation/verification timestamps. The 5 legacy Journal news records remain separate review-only rows and are not deduplicated/promoted by title similarity.

M5.7.2 intentionally creates zero News relations. Cross-domain binding is an independent M5.7.3 concern and must require explicit stable IDs/evidence; text/title matching remains forbidden.


# M5.7.3 — Relations & Daily Integration (v1.30)

News relations are persisted only when a verified source bundle explicitly supplies a stable target ID. v1.30 adds one `about_place` relation from a canonical News record to the canonical Troitsa-Sergieva Lavra place ID. The builder validates that the target stable ID already exists; it never resolves targets from names or article text.

`PravmirNews.getRelatedNews(ref)` is the reverse lookup boundary for place/content surfaces. Starting with the v1.31 repair/gate, `PravmirNews.getForDate(date)` owns deterministic temporal selection: same-day canonical publications when available, otherwise the latest canonical publications strictly before the requested date. `PravmirToday` consumes that domain API; legacy review rows and future publications are never eligible.

Current snapshot: 2 sources / 4 canonical news / 1 relation / 5 review / 0 rejected. Organisation entities/relations remain zero.

# M5.7.4 — News Domain Gate (v1.31)

M5.7 closes without adding new canonical facts. The frozen topology remains 2 sources, 4 canonical source-verified News records, 1 explicit `news → place` relation, 5 isolated legacy review items and 0 rejected rows. Inferred relations and organisation entities remain zero.

The gate treats stable IDs and indexes as deterministic products of explicit source identity: canonical IDs derive from provider + source ID, relation IDs additionally include relation type + stable target ID, and canonical slugs/deep links must be unique. Every generated News payload must carry the same canonical hash of the frozen News source snapshot.

Temporal rules are source-preserving: `published_at` is copied from verified source evidence; `observed_at`/`verified_at` come from the frozen verification snapshot and may not precede publication; validity/expiry fields remain null unless a source explicitly supplies them. Daily selection uses only `published/source_verified` canonical News and never backfills from the future.

Relation evidence must resolve back to the exact verified source row that explicitly supplied `place_ref` and `relation_type`; text/title matching cannot satisfy the gate. `Place != Organisation` remains enforced: M5.7 creates no organisation entities/relations before M7.

`PravmirNews.getTrustSummary()` is a computed runtime view over generated payloads and reports canonical/review/relation topology; it is not a new source of truth.

# M5.8.1 — Orthodox Library & Media Core (v1.32)

Library/Media is a separate domain boundary. Product consumers use `PravmirLibrary` and generated `library_*` payloads; `data/library_sources/*` is provenance/build input only. Core entity families are `work`, `author`, `edition`, `text_asset`, `media_asset` and typed Library relations.

Stable IDs are reserved by family: `pm-work-*`, `pm-author-*`, `pm-edition-*`, `pm-text-*`, `pm-media-*`, `pm-library-rel-*`. Future canonical deep links use `library/item.html?slug=...`. No canonical relation may be created from title/name matching.

Copyright is enforced at the **asset** level. A work may be old or bibliographically public while a specific translation, edition, scan, recording, video or image remains separately protected. Each future local text/media asset therefore carries `rights_status`, provenance, and when required license/permission evidence. M5.8.1 defines seven system policies: `public_domain_verified`, `open_license`, `permission_granted`, `metadata_only`, `external_link_only`, `restricted`, `review_required`.

Local full-content storage is permitted only under the first three policies and only after rights evidence for the exact asset. The remaining policies prohibit local full text/media bytes. Bibliographic metadata and external references are modeled separately from content bytes.

M5.8.1 intentionally starts with zero canonical works/authors/editions/assets/relations. This is a trust property, not missing seed data: later stages must add bibliographic facts from verified sources and must preserve copyright/licensing evidence. Organisation entities remain outside this domain until M7.



## M5.8.2 — Verified Bibliography & Scripture References (v1.33)

Library bibliography is seeded only from frozen verified source records. v1.33 adds 6 source-verified bibliographic authors, 14 Scripture works and 14 metadata-only editions covering the books actually referenced by the existing 48 liturgical reading records. Full Scripture text is not copied into the project.

The bridge `reading → work` is explicit and deterministic: the frozen source contains a closed abbreviation map and each generated `library_scripture_reference` stores the exact stable `reading_ref` and `work_ref`. Unknown abbreviations fail the build instead of being guessed. The 48 reading bridges are represented by `scripture_citation_of` relations; author attribution exists only where the verified source supports it and is not inferred from titles or tradition alone.

Canonical paths remain Library-owned (`library/item.html?slug=...` for works; `library.html?author=...` for authors). Metadata-only editions carry rights status separately from the abstract work, preserving the asset-level copyright model introduced in M5.8.1.

## M5.8.3 — Rights-cleared Text / Audio / Video & Relations (v1.34)

Rights-bearing content is modeled as an external asset with its own provenance, license/evidence and storage policy. v1.34 adds exactly 1 public-domain external text asset, 1 CC0 external audio asset and 1 CC BY-SA 4.0 external video asset. Remote bytes are not bundled into the release.

Typed relations are explicit: `text_asset → work`, `media_asset → work`, and one source-evidenced `media_asset → feast` (`depicts_feast`) using the pre-existing stable feast ID. No relation is created from name/title matching. Current topology totals 4 sources, 7 rights policies, 7 authors, 16 works, 15 editions, 48 Scripture references, 1 text asset, 2 media assets and 64 explicit relations; review/rejected remain zero.

Local full-content storage remains forbidden unless the exact asset has a policy permitting local bytes (`public_domain_verified`, `open_license` or `permission_granted`) plus matching evidence. v1.34 deliberately keeps all three new assets external-only despite their verified rights status.

## M5.8.4 — Library Domain Gate (v1.35)

M5.8 closes without adding new facts. The gate validates source-provider isolation, unique stable IDs/canonical paths, HTTPS provenance/evidence, rights/storage policy, relation endpoint closure, exact relation topology and deterministic generated outputs. Cross-domain provenance is accepted only for a provider present in the frozen owning-domain manifest (for the 48 liturgical reading bridges), not as a generic exception.

`PravmirLibrary.getRelatedForTarget(kind,id)` exposes reverse traversal over already persisted typed relations and does not create relations. Legacy/community data cannot overwrite Library canonical records. Inferred relations, organisation entities/relations, unlicensed local assets and copied protected full content remain zero.


## M5.9 — Knowledge integration consumer layer (v1.36)

`PravmirKnowledge` не является новым fact-domain и не имеет собственного source/generated dataset. Он композирует только существующие domain APIs и explicit typed relations. Domain ownership сохраняется: source/provenance остаются в исходном домене, а integration bundle лишь агрегирует `source_records` для видимости происхождения данных.

Разрешённые consumer traversal paths в v1.36 включают `place`, `feast`, `route`, `reading`; новые canonical связи при traversal не записываются. Daily Layer связывает reading с Library исключительно через существующий stable `reading_ref → work_ref` bridge. Совпадение текста/названия не создаёт relation.

M5.9 release gate требует нулевых новых inferred/organisation facts и byte-identical deterministic generated outputs относительно v1.35, поскольку этап меняет только consumer/runtime integration.

# M6 — Backend / Users / My PM

## M6.1 — User & My PM Core (v1.37)

`PravmirMyPm` — отдельный mutable personal-state boundary. Он не является canonical/system knowledge и не изменяет place/content/calendar/news/library records. Favorite, read-later или saved route — личный pointer пользователя, а не Knowledge Graph fact.

Shipped client adapter использует `schema_version: 1`, `storage_mode: device_local`, `sync_status: local_only`. v1.37 не создаёт удалённый account/session и не заявляет sync. M6.2 должен подключать backend через миграцию/adapter к этому контракту, а не silently заменять его.

Коллекции хранят только typed stable refs:
- `favorites[]` → `place` stable ID;
- `read_later[]` → `content` stable ID;
- `saved_routes[]` → `route` stable ID.

Canonical title/address/article/route payload в personal state не копируется. Product UI разрешает refs через owning domain API (`PravmirData` / `PravmirContent`) при рендере.

Legacy keys `pravmirLocalProfile`, `favorites`, `readLater`, `myRoutes` — preservation inputs. Rows со stable `id` мигрируют идемпотентно с `source=legacy_migration`. Rows без stable ID сохраняются в `migration.unresolved` с fingerprint и не превращаются в stable refs по title/name matching. Legacy keys M6.1 не удаляет.

Profile v1.37 содержит только локальные display name/email preferences. Credentials/tokens, organisation membership, subscriptions, reviews/community claims и My Parish authoritative binding отсутствуют. `Place != Organisation` сохраняется.

# M5.10.1 — Text Library Expansion (v1.38)

M5.10.1 не создаёт новый домен и не меняет базовые M5.8 entity contracts. `work`, `author`, `edition`, `text_asset` и Library relations остаются владельцами данных; `PravmirLibrary` остаётся единственным frontend data-layer для Library.

Текстовое произведение из frozen rights-cleared source создаётся только при явном `work_key`, `author_key`, source URL и per-asset rights evidence. Повторяющийся `author_key` обязан разрешаться в один и тот же stable `pm-author-*`; несовместимые имя/aliases для одного ключа считаются build error. `work`/`edition`/`text_asset` IDs детерминированы от provider/source keys.

Все 10 текущих text assets имеют `storage_mode=external_url`, `content_path=null`, `rights_status=public_domain_verified`, `verification_status=rights_verified` и HTTPS rights evidence. Поэтому релиз содержит библиографические/правовые metadata и deep links, но не удалённые текстовые байты. Это не ослабляет `public_domain_verified`: если позднее текст будет сохранён локально, права конкретного asset должны быть повторно достаточны для local storage.

v1.38 totals: 4 sources / 7 rights policies / 9 authors / 25 works / 24 editions / 48 Scripture references / 10 text assets / 2 unchanged media assets / 82 explicit relations. Relation topology: 22 `author_attribution`, 48 `scripture_citation_of`, 10 `full_text_of`, 1 `recording_of`, 1 `depicts_feast`. Inferred relations, organisation entities, unlicensed local assets and copied protected full content remain zero.

M6.1 personal state remains orthogonal: user favorites/read-later/saved-routes do not change Library canonical truth or trust status. Audio/video expansion is intentionally deferred; existing media IDs/relations remain stable.


# M5.10.2 — Hagiography / Lives (v1.39)

M5.10.2 reuses the M5.8 Library entities. A житие is a normal `work` with `work_type=life`; its edition and external full-text representation remain `edition` + `text_asset`. No separate saint biography object is introduced.

A canonical hagiographic relation is `work --life_of--> saint`. The source record must contain an explicit `saint_refs[]` entry with the existing saint stable ID, expected canonical label and relation evidence. The builder resolves that stable ID against `data/generated/saints.json` and fails if the ID is missing or the label differs. It never searches saints by title/name.

v1.39 creates five life works covering six saints, because the Cyril/Methodius source explicitly has two subjects. Anna of Kashin remains without `life_of` until a sufficiently verified source record is frozen. This missing coverage is preserved as absence rather than inferred data.

All hagiographic text assets remain `storage_mode=external_url`, `content_path=null`, `rights_status=public_domain_verified`, with per-asset HTTPS rights evidence. No remote text bytes are bundled.

`PravmirLibrary.getLivesForSaint(stableSaintId)` resolves the forward consumer path; `getWorkBundle()` exposes `related_saints`. `PravmirKnowledge.getSaintBundle()` combines the Liturgical saint object with Library lives and provenance. Calendar/day is a consumer surface for the same API.

No `life→place` relation is created in v1.39: a church dedication or shared name is not evidence of a historical/biographical place relation. Such edges require their own stable place ID + explicit source evidence in a later patch.

v1.39 totals: 4 sources / 7 rights policies / 9 authors / 30 works / 29 editions / 48 Scripture references / 15 text assets / 2 unchanged media assets / 93 explicit relations. Relation topology: 22 `author_attribution`, 48 `scripture_citation_of`, 15 `full_text_of`, 6 `life_of`, 1 `recording_of`, 1 `depicts_feast`. Inferred relations, organisation entities, unlicensed local assets and copied protected full content remain zero.


# M5.10.3 — Local theological text editions (v1.40)

Backward-compatible migration extends `text_records.storage_mode` from external-only to external/local; existing source keys, stable IDs, aliases and relation IDs are retained. Generated text schema 1.2 supports conditional local-only `content_sha256` and `content_size_bytes` with a closed `library/texts/*.txt` path. External assets keep null content paths.

The original abstract work may be public-domain while the exact electronic transcription is CC BY-SA 4.0. `work_rights_status` describes that distinction in the frozen source; editions/assets retain the exact applicable policy and notice. Two uncertain modern editions are downgraded conservatively to external-link-only; their previous assessment is retained in `text_verification_2026-10-05.json`, and no data is silently deleted.

Five immutable frozen block snapshots include pinned source URL/revision, verification date, author rights reference, edition header, license, extraction transformations, transcription quality and completeness scope. `build_library.py` joins all stored heading/paragraph/footnote blocks with two LF characters and appends one final LF, checks exact UTF-8 size/SHA256, and emits local TXT. No runtime source fetch, name-matching relation, synthetic text, translation or abridgment occurs. Source transcription errors are retained rather than silently editorially rewritten.

`PravmirLibrary.getLocalText(stableAssetId)` resolves only a known canonical text asset, checks local storage policy and path, fetches its body on demand and rejects wrong size or (when Web Crypto exists) wrong SHA256. The release checker always compares shipped bytes to source blocks and SHA256. The Library item UI renders plain text safely with attribution/source/license, loading/error/retry and keyboard focus; it does not bypass the data-layer or load every full text with the catalog.

All 48 Scripture bridges and 6 saint-life relations remain explicit and unchanged. No author is automatically made a canonical saint; no work/place relation is inferred from a name or dedication. Media remains 2 external assets. Personal M6.1 state remains independent.


# M5.10.4 — Prayer, liturgical and hymnographic texts (v1.41)

M5.10.4 reuses the existing `work` → `edition` → `text_asset` contract. New textual work types are existing schema values `prayer`, `liturgy` and `hymnography`; no parallel prayer/liturgy entity is introduced.

Traditional or anonymous works use an explicit nullable source authorship contract (`author_key=null`, `author_name=null`, empty aliases). The builder creates neither an `author` entity nor an `author_attribution` relation without explicit authorship evidence. This avoids synthetic canonical facts while keeping `getWorkBundle()` valid with `authors=[]`.

Each local publication has a pinned source revision, source/version provenance, rights evidence, classification evidence, completeness scope, CC BY-SA 4.0 license/attribution, and deterministic UTF-8 `content_size_bytes` + `content_sha256`. Historical/public-domain work status is separate from the electronic transcription license.

`PravmirLibrary.getLocalText()` remains the reader boundary. Short prayer texts are valid assets: integrity is determined by exact path/policy/bytes/size/checksum, not by a minimum text length. The five long v1.40 local publications remain separately regression-covered.

No M5.10.4 relation to feast, saint, place or organisation is inferred from a title, dedication or textual/liturgical mention. Such links require an explicit stable target plus source evidence and a target whose trust status is eligible for canonical promotion.

# M5.10.5 — Sermons, catechesis and Church history (v1.42)

M5.10.5 не создаёт новые entity kinds: проповедь, катехизический текст и церковно-исторический труд остаются `work` с `work_type=sermon|catechesis|church_history`, связанным с `author`, `edition` и `text_asset` только через explicit source records.

Для новых записей v1.42 electronic asset хранится как `storage_mode=external_url`; ПМ не включает удалённые байты текста. Source record обязан фиксировать pinned revision/source URL, дату проверки, rights evidence и classification evidence. Историческое public-domain произведение и лицензия/права конкретной электронной публикации — разные поля и не наследуются друг от друга автоматически.

`philaret-longer-catechism` демонстрирует этот boundary: stable `work` сохраняет `public_domain_verified`, тогда как конкретный электронный `text_asset` имеет `external_link_only`, потому что источник указывает современную редакционную подготовку. Предыдущая rights-оценка сохраняется в audit evidence, а stable IDs/relations не меняются.

M5.10.5 не создаёт saint/feast/place/organisation relations из имени автора, заголовка, упоминания или fuzzy matching. Canonical cross-domain edge по-прежнему требует stable target ID + typed relation + explicit evidence/provenance.



## v1.43 Library discovery / traversal contract

M5.10.6 не добавляет canonical фактов и не меняет schemas. `PravmirLibrary 1.43.0` строит consumer indexes только из generated Library payloads.

Discovery filters разрешены по существующим полям `work_type`, `rights_status` и вычисляемой доступности asset: `local_text`, `external_text`, `metadata_only`. Author-aware search разрешён только после traversal `author_attribution`; имя автора не используется для создания canonical attribution.

Canonical author surface остаётся `library.html?author=<slug>`. Author-view получает works через stable author ID. Work surface остаётся `library/item.html?slug=<slug>` и может показывать: `work → reading` через существующие `scripture_reference.work_ref`, `work → saint` через `life_of`, а также соседние works, разделяющие подтверждённый `author_attribution`. Последнее является navigation projection и не записывается как новая relation.

Daily traversal для житий: `calendar_day → commemoration` (existing day reference) → `saint` (existing Liturgical `commemorates`) → `work` (existing Library `life_of`). Каждый шаг использует stable IDs и сохранённую relation evidence. Title/name/fuzzy matching запрещён.

Place links в Library не публикуются, пока нет explicit source-supported relation. v1.43 не повышает legacy calendar trust и не создаёт organisation entities.


## v1.44 Library / Knowledge Expansion Gate contract

M5.10.7 не вводит новые Library entity kinds, relations или API methods. Corpus остаётся 11 authors / 39 works / 38 editions / 48 Scripture refs / 24 text assets / 2 media assets / 107 explicit relations. Stable IDs и URL slugs являются миграционным контрактом и сравниваются с предыдущим canonical release вне shipped проекта.

Author/work aliases должны быть непустыми и уникальными после той же NFKC/case/`ё→е`/punctuation normalization, которую использует Library search. Исправление alias не меняет identity сущности. Builder обязан отклонить normalized duplicates до generation.

`library_index.json` считается deterministic projection: `work_by_slug`, `author_by_slug`, Scripture prefix/reading maps и asset-by-work maps должны точно совпадать с canonical generated rows, а не только иметь правильный размер. `canonical_path` обязан точно кодировать canonical slug.

Current corpus не содержит подтверждённой Library↔place relation. Gate явно сохраняет нулевое состояние; place edge нельзя получить из названия храма, посвящения, текста, имени святого или fuzzy matching. Cross-domain `life_of`, `scripture_citation_of` и `depicts_feast` остаются только explicit source/evidence relations.

M5.10.7 отдельно не повышает content completeness: инженерная целостность Library не означает достаточное число книг, Scripture full texts, мест, событий или региональных сценариев. M6.1 остаётся device-local и не смешивается с canonical graph.


## M6.2 backend / account / profile-sync contract (v1.45)

M6.2 не меняет canonical/system data model M2–M5 и не переносит public facts в user storage. Backend читает public generated snapshots через read-only adapter и хранит private identity/personal state отдельно.

SQLite schema migration v1 содержит `users`, `sessions`, `recovery_tokens`, `my_pm_states` и `schema_migrations`. `user.id` имеет server-generated stable form `pm-user-<20 hex>` и никогда не используется как canonical Orthodox Knowledge ID. Roles v1 ограничены `user|reviewer`; role не создаёт organisation/clergy fact.

Passwords не хранятся в открытом виде: salted scrypt. Raw session/recovery tokens возвращаются только клиенту, в БД хранится SHA256. Sessions server-side, имеют expiry и CSRF hash. Browser session transport — same-origin HttpOnly cookie; mutations account/profile/My-PM дополнительно требуют CSRF. Production HTTPS должен включать Secure cookies через environment.

`my_pm_states` хранит одну versioned server copy на user: `revision`, canonicalized JSON bytes, `state_sha256`, `updated_at`. Payload обязан оставаться M6.1 schema v1 с `storage_mode=device_local` и `sync_status=local_only`; сервер не превращает device-local state в canonical facts. PUT использует optimistic `base_revision`; stale writer получает conflict с current revision/checksum.

Browser boundary: `PravmirMyPm 1.37.0` остаётся local adapter и не делает network I/O. `PravmirAccount 1.45.0` — remote adapter. Upload/download запускаются только явной командой пользователя. Pull не создаёт silent merge по title/name: серверный state проходит ту же typed-ref normalization, unresolved legacy rows сохраняются отдельно, а destination device сохраняет свой `local_user_id`.

Public API v1 — read-only projection existing generated snapshots (`place`, `content`, `route`, `work`, `author`, `news`, `event`, `saint`, `feast`, `amenity`, `service`). Он не изменяет source/provenance files и не заменяет доменные browser layers. Backend отсутствует — static product и M6.1 продолжают работать.
