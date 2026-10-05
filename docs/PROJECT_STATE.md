# PROJECT STATE — v1.45

Дата: 2026-10-05. Canonical release line: **1.45**.
Baseline: проверенный полный `Pravoslavnii-mir_v1.44.zip`, **19 560 512 bytes**, SHA256 **c9198cd0c7bd2151b619591d8284702067eb0be3b7259a6ec10892afa7d2a8c2**. Использована сохранённая рабочая копия v1.45, созданная именно от clean-extract v1.44; GitHub не использовался.

## v1.45 — M6.2 Backend / Accounts / Authentication / Profile Sync

- M6.1 не переписан: `PravmirMyPm 1.37.0`, schema v1, device-local/local-only state, legacy isolation и локальные favorites/read-later/saved-routes сохранены.
- Добавлен отдельный backend boundary на Python stdlib + SQLite: versioned migrations, `users`, server-side `sessions`, hashed recovery tokens и versioned `my_pm_states`. База по умолчанию хранится вне проекта (`~/.pravmir/pravmir.db`).
- Password hashing: `hashlib.scrypt` с per-password salt; session/recovery secrets хранятся только как SHA256 hashes. Session cookie = HttpOnly + SameSite=Lax; Secure включается через `PRAVMIR_SECURE_COOKIES=1`. State-changing authenticated routes требуют CSRF token и same-origin check.
- API v1 обслуживает public read-only generated snapshots и private account endpoints. Static frontend продолжает работать без backend; сервер по умолчанию слушает только `127.0.0.1`.
- `PravmirAccount 1.45.0` отделён от локального `PravmirMyPm`: registration/login/logout, profile, recovery foundation/reset, export/delete и explicit My-PM push/pull. Автоматическая отправка localStorage запрещена контрактом.
- `profile.html` получил рабочий account/sync UI. Push выполняется только отдельной кнопкой; pull требует явного подтверждения и сохраняет local device ID. Optimistic revision/checksum conflict предотвращает тихое перетирание более новой серверной копии.
- Recovery delivery по email/SMS не притворяется готовой production-функцией: backend создаёт одноразовый token, production delivery относится к дальнейшей инфраструктуре; dev-token доступен только при `PRAVMIR_DEV_RECOVERY=1`.
- Добавлен один компактный `tools/check_backend.py`, который использует временную SQLite DB и localhost server; отдельные test suites/directories не создаются.

## v1.45 verification state

До rebuild: project **0 errors / 0 warnings**, backend/API smoke **OK**, runtime **OK**; baseline inventory **363/363** сохранён, добавлено **8** файлов и удалено **0**; все **98** stable generated artifacts byte-identical v1.44; Library stable IDs **11/39/38/24/2/107** сохранены. Выполнен ровно один canonical `tools/run_m2.py`: все M2→Library build stages завершились, embedded project integrity = **0/0**, backend/API smoke = **OK**; внешний execution timeout сработал уже на `START runtime smoke`, поэтому rebuild не повторялся. Первая незавершённая стадия выполнена отдельно: runtime **OK**. Pre/post rebuild stable generated artifacts **98/98 identical**, и v1.44→v1.45 generated regression **98/98 identical**. Pre-package: project **0/0**, backend **OK**, runtime **OK**, JS syntax **42/42**, Python syntax **25/25**, HTTP HTML/Library-TXT **48/48**, inventory **371**, junk **0**. Final checksum manifest, strict verify-only и clean-extract gate выполняются после заморозки release docs. Реальный Android/SPCK, visual Chromium и Lighthouse QA в этой среде не заявляются.

## Historical release — v1.44

## v1.44 — M5.10.7 Library / Knowledge Expansion Gate

- Corpus не расширяется: сохраняются **11 authors / 39 works / 38 editions / 48 Scripture refs / 24 text assets / 2 media assets / 107 explicit relations**. Новые canonical facts, media и external sources не добавляются.
- Gate усиливает существующий lean checker, а не создаёт новый набор tests: проверяются schema/stable-ID contracts, slug/alias integrity, exact deterministic indexes, provenance/rights/local bytes/checksums, relation topology и endpoint closure, canonical deep links, отсутствие inferred Library↔place links, Discovery/author/work traversal, Today и M6.1 regressions.
- Найден реальный source-quality defect: у source-verified автора Игнатия Брянчанинова две aliases отличались только скобками и после той же нормализации, что использует поиск, становились одним значением. Frozen source исправлен до одного уникального alias; stable author ID, slug, display name, works и relations не меняются. Builder теперь отклоняет normalized duplicate/empty author aliases.
- Исправлена диагностическая слабость checker: topology mismatch теперь печатает фактические counts; deterministic Library indexes сверяются по содержимому, а canonical paths — с exact slug, а не только по префиксу.
- `library_source_snapshot` обновлён до **1.8.0** из-за source alias correction. Rights boundaries, local full-text bytes, pinned revisions и topology остаются без содержательных изменений.
- `PravmirLibrary 1.43.0`, `PravmirToday 1.43.0` и `PravmirMyPm 1.37.0` сохраняются: v1.44 — engineering gate, не API-feature release.

## v1.44 verification state

Previous v1.43 clean-extract strict gate повторно подтверждён: **0 errors / 0 warnings / runtime OK**. До full rebuild: project **0/0**, runtime **OK**, inventory **363/363**, Library stable IDs **11/39/38/24/2/107** сохранены, non-Library deterministic JSON **67/67** byte-identical v1.43. Выполнен ровно один canonical `tools/run_m2.py`; он завершился полностью без timeout за **33.57s**, включая project integrity **0/0** и runtime **OK**. Pre/post rebuild deterministic generated JSON совпали **80/80**; local TXT **9/9** byte-identical v1.43; inventory остаётся **363/363**, missing/added = **0/0**, junk = **0**. Post-build syntax: JS **41/41**, Python **18/18**; HTTP HTML/TXT **48/48**. Финальный checksum/strict verify-only и clean-extract gate выполняются после фиксации release docs. Android/SPCK, visual Chromium и Lighthouse QA не заявляются.

Gate findings закрыты внутри v1.44; отдельный пустой M5.10.8/v1.45 release не требуется, если финальный clean-extract gate остаётся чистым. Следующий утверждённый product stage после закрытия M5.10 — **M6.2 Backend / Accounts / Authentication / Profile Sync**.

## v1.43 — M5.10.6 Интеграция расширенной библиотеки

- Library corpus не расширяется: сохранены **11 authors / 39 works / 38 editions / 48 Scripture refs / 24 text assets / 2 media assets / 107 explicit relations**. v1.43 — consumer/runtime/UI integration release без новых canonical facts.
- `PravmirLibrary 1.43.0` добавляет discovery-фильтры по `work_type`, правовому статусу и доступности текста (`local_text` / `external_text` / metadata-only), author-aware search и facets. Поиск произведений может учитывать имя автора только через существующий explicit `author_attribution`.
- Canonical author URL `library.html?author=<slug>` теперь является полноценным author-view: описание, число связанных произведений, локальные тексты и фильтруемый каталог. Никакой атрибуции по совпадению имени не создаётся.
- Work page теперь показывает реальные переходы к связанным богослужебным чтениям и календарным дням через существующий `reading_ref → work_ref`, explicit `life_of` к святым, другие произведения через общий explicit author и source/provenance. Это навигация поверх существующих relations, а не новые canonical edges.
- `PravmirToday 1.43.0` расширяет Daily Layer: saints, достижимые из календарной `commemoration → saint` relation, получают source-verified Library lives только через существующий `life_of`. Today не выводит житие по имени или посвящению.
- Place links в Library не добавлены: в текущем source graph нет достаточного explicit place-level evidence. M6.1 сохранён, M6.2 остаётся paused до закрытия M5.10.

## v1.43 verification state

Pre-rebuild: `check_project.py` **0 errors / 0 warnings**, runtime **OK**, existing Library stable IDs preserved, baseline inventory **363/363** without deletions/additions, and **98/98 deterministic generated JSON** byte-identical v1.42. Выполнен ровно один canonical `tools/run_m2.py`: все build-стадии M2→M5 Library завершились, embedded project integrity = **0/0**; внешний execution timeout сработал уже на `START runtime smoke`, поэтому завершённые стадии не повторялись. Первая незавершённая стадия выполнена отдельно: runtime **OK**. Post-build determinism снова **98/98**, Library IDs **11/39/38/24/2/107** сохранены, inventory **363/363**, junk **0**. Post-build syntax: JS **41/41**, Python **18/18**; HTTP HTML/TXT **48/48**. Final checksum/strict verify-only и clean-extract gate выполняются после фиксации этих release docs и перед handoff. Android/SPCK, visual Chromium и Lighthouse QA не заявляются.

Следующий утверждённый этап после успешного v1.43 release gate: **v1.44 / M5.10.7 — Library / Knowledge Expansion Gate**.

## v1.42 — M5.10.5 Проповеди, катехизация и история Церкви

- Добавлены три source-verified внешних Library-публикации с pinned Wikisource revisions: сборник проповедей Феофана Затворника 1863 года (`sermon`), учебно-назидательная Священная история Филарета (Гумилевского) 1850 года (`catechesis`) и церковно-исторический труд К. П. Победоносцева 1891 года (`church_history`). Удалённые текстовые байты не копируются.
- Добавлены два подтверждённых автора без изменения существующих author IDs. Итог Library: **4 sources / 7 policies / 11 authors / 39 works / 38 editions / 48 Scripture refs / 24 text assets / 2 media assets / 107 relations / 0 review / 0 rejected**.
- Relation topology: **27 author_attribution / 48 scripture_citation_of / 24 full_text_of / 6 life_of / 1 recording_of / 1 depicts_feast**. Новые связи ограничены explicit author→work и work→text для новых source records; saint/feast/place links не выводятся из текста или названия.
- Rights-cleared text assets = **21**, local CC BY-SA text assets = **9**, external-link-only unresolved exact publications = **3**. Audio/video не расширялись.
- Исправлена rights-ошибка старого asset `philaret-longer-catechism`: историческое произведение остаётся `public_domain_verified`, но конкретная электронная страница с редакционной подготовкой современного издания переведена в `external_link_only`. Stable work/edition/text IDs, metadata, relations и previous assessment audit сохранены.
- `PravmirLibrary` = **1.42.0**. M6.1 сохранён; M6.2 остаётся paused до закрытия M5.10.

## v1.42 verification state

До canonical rebuild source-driven Library build, project integrity и runtime smoke прошли **0 errors / 0 warnings / OK**; stable-ID comparison подтвердил сохранение всех существующих Library IDs, а **85/85 non-Library generated JSON** были byte-identical v1.41. Единственный полный `run_m2.py` завершил M2→M5.6 и был оборван внешним execution timeout после `START M5 news`; завершённые стадии не повторялись. Прерванный News builder затем завершён отдельно, после него выполнены ещё не начавшиеся Library builder, project integrity и runtime smoke: **0/0 / OK**. Pre/post rebuild deterministic generated payloads совпали **80/80**. Pre-package release gates: `check_project.py` **0/0**, runtime **OK**, checksums **360/360**, JS syntax **41/41**, Python syntax **18/18**, HTTP HTML/TXT **48/48**, bytecode/junk **0**, non-Library regression **85/85 byte-identical**. Финальный clean-extract strict gate выполняется после упаковки. Реальный Android/SPCK, визуальный Chromium и Lighthouse QA не заявляются.

Следующий утверждённый этап после успешного v1.42 release gate: **v1.43 / M5.10.6 — интеграция расширенной библиотеки (Discovery, filters/search, author/work UX, related/Daily integration)**.

## v1.41 — M5.10.4 Молитвы, богослужебные и гимнографические тексты

- Добавлены 4 локальные source-verified публикации из закреплённых ревизий Викитеки: **«Отче наш» (`prayer`)**, **«Царю Небесный» (`hymnography`)**, **«Достойно есть» (`hymnography`)**, **Никео-Цареградский Символ веры (`liturgy`)**.
- Для каждого asset сохранены pinned revision/source URL, отдельное evidence жанра/богослужебного употребления, rights evidence, CC BY-SA 4.0 attribution/license, completeness scope, точный UTF-8 size и SHA256. Исторический текст/редакция и права электронной транскрипции разделены.
- Традиционные/анонимные тексты больше не требуют фиктивного автора: source schema допускает явное `null`-авторство, builder не создаёт `author` и `author_attribution` без evidence. Существующие авторы и их stable IDs не меняются.
- Исправлен неверный runtime-инвариант v1.40 «любой локальный текст ≥5000 символов». Для всех локальных текстов проверяются bytes/size/SHA256/license; отдельная регрессия сохраняет пять прежних длинных публикаций.
- Library после source-driven build: **4 sources / 7 policies / 9 authors / 36 works / 35 editions / 48 Scripture refs / 21 text assets / 2 media assets / 101 relations / 0 review / 0 rejected**. Rights-cleared text assets = **19**, local CC BY-SA text assets = **9**, unresolved external-only = **2**.
- Relation topology: **24 author_attribution / 48 scripture_citation_of / 21 full_text_of / 6 life_of / 1 recording_of / 1 depicts_feast**. Четыре новых традиционных work не имеют author_attribution.
- `PravmirLibrary 1.41.0` использует прежний reader и data-layer; новый UI-текст отражает молитвенное/богослужебное/гимнографическое покрытие. Audio/video не расширялись.
- Новые canonical links к feast/saint/place не создавались: M5.10.4 хранит только подтверждённую классификацию источника. Совпадение названия/упоминание праздника не повышает существующие legacy/unverified target records.
- M6.1 сохранён. M6.2 остаётся paused до завершения M5.10.

## v1.41 verification state

Baseline strict gate выполнен до изменений. В единственном canonical `run_m2.py` все 13 build stages завершились, Library построена как **36/35/21/101**, а embedded `check_project.py` напечатал **0 errors / 0 warnings**. После этого внешний execution timeout оборвал orchestrator до старта `runtime smoke`; rebuild не повторялся. По release protocol отдельно выполнены `check_project.py` → **0/0** и `check_runtime.js` → **OK**. Pre/post full-build deterministic generated JSON совпали **80/80**; все **355/355** файлов v1.40 сохранены, добавлены ровно 4 frozen source JSON + 4 TXT, `__pycache__/.pyc` = 0. Финальный clean-extract strict gate выполняется после упаковки. Реальный Android/SPCK/визуальный Chromium/Lighthouse QA в этом релизе не заявляется.

Следующий утверждённый этап после успешного v1.41 release gate: **v1.42 / M5.10.5 — проповеди, катехизация и история Церкви**.

## v1.39 — M5.10.2 Жития и explicit saint↔work integration

- audio/video expansion по решению пользователя остаётся отложенным; existing **2 media assets** и их stable IDs/relations не меняются;
- frozen rights-cleared source расширен отдельным `life_records` contract; canonical life создаётся только из source record с `public_domain_verified` rights evidence;
- добавлены **5 hagiographic works / 5 editions / 5 external text assets**, покрывающие **6 из 7** существующих canonical saints: Серафим Саровский, Николай Чудотворец, Татиана, Кирилл, Мефодий и Владимир;
- создано **6 explicit `life_of` relations** `work → saint`; target saint подтверждается одновременно exact stable ID + ожидаемым source label, поэтому title/name matching не используется;
- Анна Кашинская намеренно остаётся без canonical жития: неподтверждённая запись не повышается ради полноты;
- Library totals: **4 sources / 7 rights policies / 9 authors / 30 works / 29 editions / 48 Scripture references / 15 text assets / 2 media assets / 93 explicit relations / 0 review / 0 rejected**;
- relation topology: **22 author_attribution / 48 scripture_citation_of / 15 full_text_of / 6 life_of / 1 recording_of / 1 depicts_feast**;
- `PravmirLibrary 1.39.0` добавляет `getLivesForSaint()` и возвращает `related_saints` в work bundle;
- calendar day Library section теперь показывает source-verified жития для святых конкретного дня; Library detail разрешает обратный переход к canonical saint record через `PravmirLiturgical`;
- `PravmirKnowledge 1.39.0` добавляет consumer-only `getSaintBundle()` для traversal `saint → life`, сохраняя provenance исходных domain records;
- explicit `life → place` relation в v1.39 **не создаётся**, потому что в текущем frozen source нет достаточного place-level evidence. Никакие храмовые связи не выводятся из имени святого или посвящения храма;
- remote text bytes не копируются: все 15 text assets остаются `external_url`; inferred relations / organisation entities / unlicensed local assets / copied protected full content = 0.

Next after successful v1.39 gate: **M5.10.3 / v1.40 — Святоотеческая и богословская текстовая библиотека**, без расширения audio/video. M6.2 остаётся paused до завершения согласованного текстового расширения.

## v1.39 verification

Pre-rebuild: `check_project.py` → **0 errors / 0 warnings**, `check_runtime.js` → **OK**, JS syntax **39/39 OK**, deterministic snapshot **80 JSON**; относительно v1.38 все **67/67 non-Library generated JSON** byte-identical. Выполнен ровно один полный `tools/run_m2.py`: все M2→M5.10.2 builders завершены, embedded gates **0/0 + runtime OK**, `DONE total=28.91s`, `RUN_M2_STATUS=0`. Post-rebuild determinism: **80/80** generated JSON byte-identical pre/post; v1.38→v1.39 non-Library **67/67** byte-identical. Inventory **343→343**, missing=0, added=0. Final checksum/verify-only/HTTP/clean-extract gate выполняются после фиксации release docs.

## v1.38 — M5.10.1 Расширение текстовой библиотеки: авторы и произведения

После закрытия структурных M5.8/M5.9 gates продуктовый объём текстовой библиотеки признан недостаточным для исходной цели экосистемы. По решению пользователя дальнейший M6 после уже завершённого M6.1 временно поставлен на паузу; Library повторно не проектируется, а расширяется поверх стабильных M5.8 contracts.

- audio/video expansion отложен: существующие **2 media assets** и их stable IDs/relations остаются без расширения;
- frozen rights-cleared source расширен только текстовыми произведениями с per-asset rights evidence;
- canonical Library теперь: **4 sources / 7 rights policies / 9 authors / 25 works / 24 editions / 48 Scripture references / 10 text assets / 2 media assets / 82 explicit relations / 0 review / 0 rejected**;
- добавлены 9 rights-verified public-domain external full-text assets: произведения святителей Филарета Московского, Игнатия Брянчанинова и Феофана Затворника; исходный текстовый asset Феофана сохранён, всего text assets = 10;
- новые текстовые типы покрытия: theology, catechesis, sermon; существующие Scripture/hymnography records сохранены;
- repeated source author keys дедуплицируются детерминированно, stable author/work/edition/text IDs сохраняются по source keys;
- все text assets остаются `storage_mode=external_url`: удалённые байты текстов не копируются в ZIP; provenance/rights evidence хранится на уровне каждого asset;
- relation topology: **22 author_attribution / 48 scripture_citation_of / 10 full_text_of / 1 recording_of / 1 depicts_feast**;
- inferred relations = 0, organisation entities = 0, unlicensed local assets = 0, copied protected full content = 0;
- `PravmirLibrary 1.38.0` и Library UI расширены под новый текстовый каталог; media contracts не меняются.

Next after successful v1.38 gate: **M5.10.2 / v1.39 — Жития и связи святой ↔ житие ↔ место**, без расширения audio/video. M6.2 остаётся paused до завершения согласованного текстового расширения.

## v1.38 verification

Pre-rebuild: `check_project.py` → **0 errors / 0 warnings**, `check_runtime.js` → **OK**, JS syntax **41/41 OK**, deterministic snapshot **80 JSON**. Выполнен ровно один полный `tools/run_m2.py`: все M2→M5.10.1 builders завершены, embedded project/runtime gates **0/0 + OK**, `DONE total=27.84s`, `RUN_M2_STATUS=0`. Post-rebuild determinism: **80/80** generated JSON byte-identical pre/post; относительно v1.37 все **67/67 non-Library generated JSON** byte-identical, изменены только 13 Library payloads. Inventory **343→343**, missing=0, added=0; compiled junk=0. Post-rebuild project/runtime **0/0 + OK**; JS syntax **41/41 OK**; HTTP surfaces **39/39 → 200**; My PM JSON Schema remains OK. Final checksum manifest + strict verify-only + clean-extract gate выполняются после фиксации release docs.

## v1.37 — M6.1 Ядро пользователя и «Мой ПМ»

- создан `PravmirMyPm 1.37.0` как единая mutable personal-state boundary; canonical/system domains M2–M5 остаются read-only;
- состояние формально описано `schemas/my_pm_state.schema.json`: `schema_version=1`, `storage_mode=device_local`, `sync_status=local_only`; v1.37 не выдаёт локальный профиль за backend account;
- коллекции содержат только typed stable refs: `favorites → place`, `read_later → content`, `saved_routes → route`; карточки разрешаются через `PravmirData` / `PravmirContent` во время отображения;
- прежние ключи `pravmirLocalProfile`, `favorites`, `readLater`, `myRoutes` сохраняются и мигрируются идемпотентно; записи без stable ID идут в `migration.unresolved`, без title/name canonicalization;
- canonical Journal/Article перестали напрямую писать personal collections в localStorage; place detail получил рабочее «В избранное», route detail — «Сохранить маршрут»;
- `profile.html` показывает реальные stable-ref коллекции, миграционный статус и честно сообщает local-only режим;
- M6.1 не создаёт auth/session/backend storage, subscriptions, community facts или organisation relations. `Place != Organisation` сохраняется.

### v1.37 verification

Pre-rebuild: `check_project.py` → **0 errors / 0 warnings**, `check_runtime.js` → **OK**, checksum manifest 340 entries, saved deterministic snapshot **98 JSON**. Выполнен ровно один полный `tools/run_m2.py`: все M2→M5 builders завершены, embedded project/runtime gates **0/0 + OK**, `DONE total=27.76s`, `RUN_M2_STATUS=0`; terminal cleanup сообщение после DONE не требовало повторного rebuild.

Regression/determinism: **98/98** deterministic generated JSON byte-identical pre/post и **98/98** byte-identical финальному v1.36; generated add/remove = 0. Inventory v1.36→v1.37: **341→343**, missing=0, added only `js/my-pm-layer.js` + `schemas/my_pm_state.schema.json`; compiled junk 0. JSON Schema Draft 2020-12: OK; JS syntax **39/39 OK**; HTTP surfaces **39/39 → 200**. Финальный checksum + clean-extract gate выполняется после фиксации release docs.

## v1.36 — M5.9 Content / Knowledge Integration Gate

- добавлен `PravmirKnowledge 1.36.0` как consumer-only orchestration layer; он не имеет собственного source/generated dataset и не создаёт canonical facts;
- knowledge bundles объединяют только существующие explicit relations/API для place, feast, route и reading; provenance агрегируется из исходных `source_records`, не переписывая domain ownership;
- Daily Layer расширен stable-ID связью `reading_ref → Scripture reference → work_ref` через `PravmirLibrary`; title/citation matching не используется;
- homepage отображает Library work рядом с чтением только когда существует explicit Scripture bridge;
- runtime final M5 gate проверяет Лавра → News + pilgrim infrastructure, Крещение → Library media relation, reading → Scripture work и Daily → Library;
- M5.9 не создаёт organisation entities, inferred relations или новые data facts. После успешного release-gate M5 считается закрытым и следующий milestone — M6 Backend / Users / My PM.

### v1.36 verification

Pre-rebuild: `check_project.py` → **0 errors / 0 warnings**, `check_runtime.js` → **OK**. Выполнен ровно один полный `tools/run_m2.py`: все стадии M2→M5.9 завершены, встроенные gates **0/0 + runtime OK**, `DONE total=27.71s`, `RUN_M2_STATUS=0`.

Regression/determinism: **98/98 complete deterministic generated JSON** (включая 18 region payloads; исключены только timestamped `import_report.json` и `dedupe_report.json`) побайтово совпадают с финальным v1.35; сохранённый pre-rebuild root snapshot **80/80** также неизменен. Generated files не добавлены и не удалены. File inventory v1.35→v1.36: **340→341**, missing=0, added only `js/knowledge-layer.js`. JS syntax: **38/38 OK**; HTTP surfaces: **39/39 → 200**; compiled Python junk: **0**.

Финальный v1.36 release-gate завершён: ZIP `19 294 502` bytes, SHA256 `e81db183a8c27eb546508c8cafe8620a2ae0f612f8797b02c8c034ff1d983272`; clean-extract 338/338 checksums, verify-only 0/0 + runtime OK, work/final 341/341 exact. **M5 закрыт.**

## v1.35 — M5.8.4 Library Domain Gate

- новых authors/works/editions/text/media фактов не добавляется; canonical Library dataset остаётся **4 / 7 / 7 / 16 / 15 / 48 / 1 / 2 / 64 / 0 / 0**;
- project gate дополнительно проверяет unique canonical deep links, provider provenance, HTTPS source/evidence URLs, relation endpoint closure и external-only storage policy текущих assets;
- `PravmirLibrary 1.35.0` добавляет reverse typed-relation lookup для существующих canonical связей; UI показывает вычисляемый trust summary;
- exact rights topology остаётся: 13 `author_attribution`, 48 `scripture_citation_of`, 1 `full_text_of`, 1 `recording_of`, 1 `depicts_feast`;
- 0 inferred relations, 0 organisation entities, 0 unlicensed local assets, 0 copied protected full text/media;
- после успешного release-gate M5.8 считается закрытым. Следующий этап — **M5.9 Content/Knowledge Integration Gate**.

### v1.35 verification

Pre-rebuild: `check_project.py` → **0 errors / 0 warnings**, runtime → **OK**. Выполнен ровно один полный `tools/run_m2.py`: все стадии M2→M5.8.4 завершены, встроенные gates **0/0 + runtime OK**, `DONE total=27.15s`, `RUN_M2_STATUS=0`. Все **80/80 deterministic generated JSON** (исключая только timestamped import/dedupe diagnostics) byte-identical как pre/post rebuild, так и относительно финального v1.34; generated files не добавлены и не удалены. Это подтверждает, что v1.35 закрывает M5.8 как gate без изменения canonical фактов. Final clean-extract gate выполняется после упаковки ZIP.

## v1.34 — M5.8.3 Материалы с подтверждёнными правами и связи

- `PravmirLibrary` расширен до M5.8.3 без изменения M2–M5.7 contracts;
- frozen rights source добавляет ровно 1 external full-text asset общественного достояния, 1 external CC0 audio asset и 1 external CC BY-SA 4.0 video asset; remote bytes в release не копируются;
- canonical Library counts до rebuild: **4 sources / 7 rights policies / 7 authors / 16 works / 15 editions / 48 Scripture refs / 1 text asset / 2 media assets / 64 explicit relations / 0 review / 0 rejected**;
- сохранены все 48 stable Scripture bridges M5.8.2 и 14 metadata-only Scripture works;
- добавлены explicit relations `full_text_of`, `recording_of` и source-evidenced `depicts_feast` на существующий stable ID праздника Крещения Господня;
- 0 inferred relations, 0 organisation entities, 0 unlicensed local assets, 0 copied protected full texts;
- Library UI/runtime показывают rights-cleared внешние материалы, license/evidence и work bundles; local storage остаётся запрещённым без отдельного разрешения.

Следующий подпункт после успешного release-gate — **M5.8.4 Library Domain Gate**.

### v1.34 verification

Pre-rebuild gate: project integrity **0 errors / 0 warnings**, runtime **OK**. Выполнен ровно один полный `tools/run_m2.py`: все стадии M2→M5.8.3 завершились, встроенные project/runtime gates дали **0/0 + OK**, runner вывел `DONE total=28.45s` и `RUN_M2_STATUS=0`; последующий служебный terminal cleanup оболочки сообщил `TERM environment variable not set` уже после завершения, поэтому полный rebuild не повторялся. После rebuild **67/67** прежних non-Library deterministic generated JSON byte-identical v1.33; baseline files missing = 0, добавлены только source+schema M5.8.3. Пост-сравнение выявило только ненужный wording drift summary у 14 Scripture works; формулировка v1.33 восстановлена в builder и пересобран только Library stage, после чего все M5.8.2 authors/works/editions/Scripture refs/60 relations совпадают с v1.33 по record ID и payload. Final checksum/clean-extract gate выполняется после упаковки полного ZIP.

## v1.33 — M5.8.2 Проверенная библиография и ссылки на Священное Писание

- `PravmirLibrary` расширен до библиографического слоя M5.8.2 без изменения M2–M5.7 contracts;
- frozen source catalog фиксирует 6 author records, 14 Scripture works, 14 metadata-only editions и 48 stable reading bridges;
- создано 60 explicit relations: 48 `reading → work` + 12 `work → author`; Деяния и Евреям не получили спорной canonical author relation;
- локальные text/audio/video assets = 0; полный текст Писания не копируется.

### v1.33 verification

Один rebuild M2→M5.8.2: 0 errors / 0 warnings + runtime OK, RUN_M2_STATUS=0; 67/67 прежних non-Library generated JSON byte-identical; 13/13 Library pre/post rebuild hashes identical; финальный clean-extract: 335/335 checksum entries OK, verify-only 0/0 + runtime OK, compiled junk 0.

## v1.32 — M5.8.1 Orthodox Library & Media Core

- начат отдельный domain `PravmirLibrary 1.32.0`; runtime читает только generated Library payloads;
- добавлены closed schemas для `work`, `author`, `edition`, `text_asset`, `media_asset`, typed relations и review items со stable-ID contracts;
- введена системная rights taxonomy из **7** ingestion statuses: verified public domain, open license, permission granted, metadata-only, external-link-only, restricted, review-required;
- каждый будущий full text/audio/video/image asset обязан иметь отдельный rights status + provenance/evidence; статус произведения сам по себе не разрешает копирование конкретной цифровой версии/записи;
- M5.8.1 намеренно создаёт **0 works / 0 authors / 0 editions / 0 text assets / 0 media assets / 0 relations**: никаких фиктивных записей и никаких защищённых полных текстов ради наполнения;
- добавлены `library.html` и future canonical `library/item.html?slug=...`, secondary navigation и честный empty state;
- следующие verified-source этапы смогут добавлять библиографию и assets, не меняя domain boundary.

Следующий подпункт после успешного release-gate — **M5.8.2 Verified Bibliography & Scripture References**.

### v1.32 verification

- выполнен ровно один canonical `tools/run_m2.py`; все M2→M5.8.1 builders завершились, встроенный project gate дал **0 errors / 0 warnings**, runtime smoke — **OK**, runner напечатал `DONE total=27.02s` и `RUN_M2_STATUS=0`; последующий служебный terminal-cleanup оболочки вернул status 1 из-за `TERM environment variable not set`, поэтому rebuild не повторялся — незавершённых builders не осталось;
- Library result: **1 system source / 7 rights policies / 0 authors / 0 works / 0 editions / 0 text assets / 0 media assets / 0 relations / 0 review / 0 rejected**; full protected texts copied = 0, unlicensed local assets = 0, inferred relations = 0, organisation entities = 0;
- из **69** общих generated JSON с v1.31 изменились только исключённые transient diagnostics `import_report.json` и `dedupe_report.json`; остальные **67/67** прежних generated JSON byte-identical; добавлены ровно **12** Library generated payloads;
- file inventory: **303 baseline files → 334 v1.32 files**, missing = 0, new = 31; compiled Python junk отсутствует;
- post-rebuild structural/runtime gate: **0 errors / 0 warnings + runtime OK**; JS syntax: **37/37 OK**; HTTP smoke по всем текущим non-legacy HTML surfaces: **39/39 → 200**.

## v1.31 — M5.7.4 News Domain Gate

- закрывает M5.7 без добавления новостей «ради количества»: snapshot остаётся **2 sources / 4 canonical news / 1 explicit relation / 5 legacy review / 0 rejected**;
- исправлены подтверждённые дефекты поставленного v1.30: отсутствовавшая News-композиция в `PravmirToday`, отсутствовавшая place reverse-news surface и устаревший runtime smoke с ожиданиями M5.7.2;
- `PravmirNews 1.31.0` добавляет deterministic `getForDate()` и вычисляемый `getTrustSummary()` поверх generated News payloads;
- Domain Gate проверяет schemas, deterministic stable IDs/slugs/indexes, canonical deep links, source snapshot, publication/freshness timestamps, HTTPS provenance, legacy isolation, exact evidence-backed relation topology и нулевые inferred/organisation facts;
- `PravmirToday 1.31.0` использует только canonical/source-verified News: same-day first, иначе latest-before-date; future news и legacy review не попадают в Daily Layer;
- canonical place page получает News только через explicit `news → place` relation на stable ID.

После успешного release-gate M5.7 считается **завершённым**. Следующий domain — **M5.8 Orthodox Library & Media**.

### v1.31 verification

- выполнен ровно один полный `tools/run_m2.py`; все M2–M5.7 build stages завершились без timeout за `24.94s`;
- встроенный post-build gate: `check_project.py` → **0 errors / 0 warnings**, `check_runtime.js` → **OK**;
- News counts после rebuild: **2 sources / 4 canonical / 1 explicit relation / 5 review / 0 rejected**, inferred relations = 0, organisation entities = 0;
- **66 deterministic generated JSON** byte-identical поставленному v1.30; изменился только `news_report.json` из-за исправленных M5.7.4 notes, а `import_report.json`/`dedupe_report.json` являются исключёнными transient diagnostics;
- baseline file inventory сохранён полностью: **303 → 303**, missing = 0, new = 0;
- JS syntax: **34/34 OK**; HTTP smoke: **18/18** ключевых product surfaces → 200; compiled Python junk отсутствует.

## Completed roadmap

- M1 — Core Stability;
- M2.1–M2.6 — Data Core;
- M3.1–M3.5 — Objects & Discovery;
- M4.1–M4.5 — Routes & Knowledge Graph;
- M5.1 — Content Core;
- M5.2 — Journal;
- M5.3 — Calendar / Liturgical Core;
- M5.4 — Events;
- M5.5 — Orthodox Food;
- M5.6 — Pilgrim Infrastructure;
- M5.7 — News.

## v1.30 — M5.7.3 Relations & Daily Integration

- verified source bundle расширен официальной публикацией Патриархия.ru от 24 сентября 2026 о музее колокольного искусства в Троице‑Сергиевой лавре;
- News snapshot: **2 sources / 4 canonical news / 1 relation / 5 legacy review / 0 rejected**;
- создана ровно одна explicit relation `news → place` типа `about_place` на stable ID Троице‑Сергиевой лавры; text/title matching не используется;
- `PravmirNews 1.30.0` даёт reverse lookup по explicit relations; object page Лавры показывает связанную canonical news;
- `PravmirToday 1.30.0` включает только canonical News: same-day publications либо latest verified fallback, никогда legacy review;
- M5.7.3 не создаёт Organisation facts и не выводит relation из совпадения текста. Следующий подпункт — **M5.7.4 Domain Gate**.

Проверено после единственного rebuild v1.30: runner завершил M2–M5.6 и был остановлен внешним 30-секундным timeout ровно перед M5 News; предыдущие этапы не повторялись, `build_news.py` выполнен отдельно как пропущенный шаг того же rebuild. После этого `check_project.py` — 0 errors / 0 warnings, `check_runtime.js` — OK; **все generated outputs вне News byte-identical v1.29**, изменились ровно 7 News payloads.


## v1.29 — M5.7.2 Source Verification & Temporal Ingestion

- добавлен маленький frozen verified-source bundle Патриархия.ru, проверенный 5 октября 2026;
- canonical News теперь содержит **3 source-verified записи** с точными `published_at`, `observed_at/verified_at`, stable IDs, canonical deep links и official provenance;
- legacy `journalpp` слой не повышен: **5/5** записей остаются `legacy_unverified / needs_source_verification`;
- News relations остаются **0** намеренно: M5.7.2 занимается temporal ingestion, а explicit cross-domain binding отложен до M5.7.3;
- добавлена canonical detail surface `news/item.html`; `PravmirNews` обновлён до 1.29.0;
- current News counts: **2 sources / 3 canonical news / 0 relations / 5 review / 0 rejected**; inferred relations/organisation entities = 0.

Проверено после единственного rebuild v1.29: основной runner дошёл до `START M5 news` и был остановлен только внешним 30-секундным timeout; предыдущие этапы не повторялись, а пропущенный `build_news.py` выполнен отдельно как продолжение того же rebuild. После этого `check_project.py` — 0 errors / 0 warnings, `check_runtime.js` — OK. **Все generated outputs вне News byte-identical v1.28**; изменились ровно 7 News payloads.


## v1.28 — M5.7.1 News Core

- начат отдельный domain `PravmirNews 1.28.0`; product UI читает только generated News payloads, а не legacy/raw source files;
- добавлены source manifest/snapshot, canonical news/relation schemas и review-item schema с temporal/provenance полями;
- обнаруженные **5** старых `content_type=news` из `journalpp_legacy.json` не повышены до canonical News: они сохранены как `legacy_unverified` review queue с provenance и точными Content Core refs;
- current canonical News snapshot: **1 source / 0 canonical news / 0 relations / 5 review / 0 rejected**; inferred relations/organisation entities = `0`;
- добавлена отдельная страница `news.html`, navigation/discovery entry и честный empty state для verified feed; legacy Journal news tab теперь явно ведёт в authoritative News domain и остаётся архивным compatibility surface;
- следующий подпункт — **M5.7.2 Source Verification & Temporal Ingestion**: canonical news разрешены только после повторной проверки источника, даты/актуальности и explicit relations.

Проверено после единственного полного rebuild v1.28: все build steps до M5 News завершились успешно; финальный integrity/runtime gate выполнен отдельно после timeout оболочки, без повторного rebuild. `check_project.py` — 0 errors / 0 warnings; `check_runtime.js` — OK; **60/60** прежних deterministic generated outputs byte-identical v1.27; добавлены только 7 News generated payloads; все **282/282** baseline-файла сохранены.


## v1.27 — M5.6.4 Domain Gate

- M5.6 trust-gate расширен внутри существующих `check_project.py` и `check_runtime.js`, без новых standalone checker/test файлов;
- проверяются unique canonical deep links/slugs, freshness dates, HTTPS provenance, source snapshot consistency и explicit relation endpoints;
- canonical relation topology зафиксирована как 3 explicit place relations к Троице-Сергиевой лавре + 1 к Николо-Берлюковской пустыни; persisted route/organisation relations остаются `0`;
- unresolved evidence conflict обязан оставаться вне canonical amenity/service records; 83 legacy rows остаются `needs_evidence`, 2 promoted rows обязаны иметь explicit evidence/stable place refs;
- `PravmirPilgrim 1.27.0` получил `getTrustSummary()`; UI показывает canonical/pending/conflict/topology summary без изменения фактов;
- route discovery остаётся runtime traversal `route stop → canonical place → explicit M5.6 relation` и не создаёт `supports_route`;
- M5.6 после успешного release-gate считается **завершённым**. Следующий domain roadmap — **M5.7 News**.

Проверено после единственного полного rebuild v1.27: `check_project.py` — 0 errors / 0 warnings; `check_runtime.js` — OK; **60/60 deterministic generated outputs byte-identical v1.26**; все **282/282** baseline-файла сохранены, новых/удалённых файлов нет; canonical M5.6 counts не изменились.


## v1.26 — M5.6.3 Discovery / Route Integration

- canonical infrastructure получила фильтры по запросу, типу и status с query-state в URL; legacy review остаётся отдельным слоем и не смешивается с verified results;
- freshness UX показывает дату verification и автоматически усиливает предупреждение по мере старения mutable сведений;
- unified home search теперь ищет source-verified amenities/services через `PravmirPilgrim`, не читая raw/source data;
- route detail показывает инфраструктуру для canonical route stops через traversal `route stop → place → explicit M5.6 relation`; новый `supports_route` fact не создаётся;
- существующий place → infrastructure reverse surface сохранён; M5.6 data/schema/source facts в v1.26 не меняются;
- следующий подпункт — **M5.6.4 Domain Gate**.

Проверено после единственного полного rebuild v1.26: `check_project.py` — 0 errors / 0 warnings; `check_runtime.js` — OK; **60/60 deterministic generated outputs byte-identical v1.25**; все **282/282** файла baseline v1.25 сохранены, новых/удалённых файлов нет; JS syntax 33/33 и HTTP smoke 19/19 прошли. v1.26 изменяет только consumer/UI и не создаёт новых canonical facts.


## v1.25 — M5.6.2 Evidence / Verification / Binding

- добавлен frozen editorial evidence source `data/pilgrim_sources/verified_records_2026-10-04.json`; он содержит только явно проверенные по официальным страницам записи и stable `place_ref`, без поиска связей по тексту;
- созданы первые canonical M5.6 facts: **2 amenities + 2 services + 4 source-verified relations**;
- Троице-Сергиева лавра получила две проверенные записи размещения и Паломнический центр; Николо-Берлюковская пустынь — проверенную паломническую службу;
- из 85 legacy rows ровно **2** переведены в `promoted` после official-source evidence и explicit stable place binding; остальные **83** остаются `needs_evidence`;
- unresolved конфликт адреса Вознесенской гостиницы сохранён в `pilgrim_conflicts.json` как два официальных evidence values; canonical amenity до разрешения конфликта не создан;
- `Place != Organisation` сохранено: organisation entities/relations не создаются; provider name остаётся атрибутом сервиса, а не Organisation entity;
- `PravmirPilgrim 1.25.0` показывает verified records, evidence conflicts и review state; canonical place page получила блок «Паломнику рядом» только для explicit M5.6 relations;
- M5.6 ещё не завершён: следующий подпункт — **M5.6.3 Discovery / Route Integration**.

Проверено перед упаковкой v1.25: выполнен ровно один полный `tools/run_m2.py`; `check_project.py` — 0 errors / 0 warnings; `check_runtime.js` — OK; **51/51 common generated outputs вне M5.6 byte-identical v1.24**; все **280** файлов v1.24 сохранены; добавлены ровно 2 новых files (`verified_records_2026-10-04.json`, `pilgrim_conflicts.json`); JS syntax 33/33 и HTTP smoke 19/19 прошли. Финальный checksum/clean-extract gate выполняется после фиксации release files.


## v1.24 — M5.6.1 Pilgrim Infrastructure Core

- создан новый domain boundary `PravmirPilgrim 1.24.0` и отдельный build-step `tools/build_pilgrim.py`; frontend не читает raw pilgrim sources напрямую;
- введена системная taxonomy из **12 amenity types**: ночлег, трапезная, лавка, транспорт, парковка, святой источник, купель, туалеты, wheelchair accessibility, family/children, pilgrim support, information point;
- добавлены schemas для canonical `amenity`, canonical `service`, typed pilgrim relations, source manifest и legacy review items;
- canonical amenities/services требуют stable IDs, aliases, canonical deep links, contacts/opening-hours/availability, accessibility/family fields, coordinates/address, provenance и freshness (`observed_at`, `verified_at`, `valid_from`, `valid_to`, `expires_at`);
- все **85/85** старых паломнических служб перенесены только в `pilgrim_review_queue.json` со статусом `needs_evidence`; canonical amenities/services/relations из них не создаются;
- `candidate_refs` у legacy queue пусты: совпадение текста, города, названия или организации не создаёт canonical fact;
- старый `PravmirContent.getPilgrimServices()` и `pilgrim_services.json` сохранены как compatibility contract; их stable `pm-pilgrim-*` IDs побайтово сопоставляются с review queue;
- правило `Place != Organisation` соблюдено: M5.6.1 не создаёт organisation entities и запрещает organisation relations до M7;
- добавлена пользовательская страница `pilgrim/infrastructure.html`: verified layer отдельно от legacy review queue, поиск/регион, provenance disclosure и честный empty state при отсутствии проверенных объектов;
- homepage и паломнический раздел получили переход в новый infrastructure domain; старый справочный каталог не удалён;
- M5.6 ещё **не завершён**: следующий подпункт — M5.6.2 Evidence / Verification / Binding, где canonical записи могут появляться только из явных доказательств и ручной проверки.

Проверено до упаковки v1.24: выполнен ровно один полный `tools/run_m2.py`; все build steps включая M5.6.1 — OK; `check_project.py` — 0 errors / 0 warnings; `check_runtime.js` — OK; **69/69** прежних deterministic generated outputs byte-identical v1.23; все **256** baseline-файлов сохранены; добавлено 24 новых M5.6 files; canonical counts M2–M5.5 не изменились. JS syntax 33/33 и HTTP smoke 19/19 прошли. Финальный checksum/clean-extract gate выполняется после фиксации release files.

## v1.23 — Existing Domains Expansion III — Today / Daily Layer 1.0

- главная вкладка «Сегодня» получила реальный cross-domain Daily Layer вместо набора независимых входов: церковный день, чтения, трапеза, журнал и события собираются в одном контексте;
- добавлен `PravmirToday 1.23.0` (`js/today-layer.js`) — orchestration/runtime layer без собственного canonical storage и без прямого чтения raw/generated JSON;
- `PravmirToday` использует только публичные API `PravmirLiturgical`, `PravmirContent`, `PravmirEvents` и `PravmirFood`; существующие domain contracts не меняются;
- блок «Церковный день» показывает только записи текущего day bundle и явно отмечает legacy verification status;
- блок «Чтения» показывает только explicit v1.22 reading records; при отсутствии данных сообщает об этом и может указать ближайшую дату существующего editorial coverage вместо догадки;
- блок «Трапеза» показывает только recipes, связанные через existing `editorial_guidance` food relations; generic recipe fallback не выдаётся за рекомендацию конкретного дня;
- блок «Журнал» сначала использует explicit typed content relations к feast/saint/commemoration; если связи нет, отдельным label показывает просто свежие материалы и не называет их связанными с днём;
- блок «События» использует только canonical `PravmirEvents`; 4 demo/review records не попадают в Today и не изображаются реальными событиями;
- homepage теперь подключает event/food/today layers и отображает responsive Daily grid с loading/error/empty states;
- `check_runtime.js` проверяет Easter composition (readings + food + explicit related content), honest ordinary-day fallback и отсутствие review/demo event leak; отдельные milestone checkers/tests не добавлены;
- canonical/generated datasets, stable IDs, source snapshots, M2–M5.5 schemas и 85 legacy pilgrim services не изменяются.

Этим v1.21–v1.23 закрывают текущую серию Data & Existing Domains Expansion: connected content → source-aware readings → cross-domain Daily Layer. M5.6 в v1.23 не реализуется; следующий этап — **M5.6 Pilgrim Infrastructure**.

Проверено до упаковки: выполнен ровно один полный `tools/run_m2.py`; `check_project.py` — 0 errors / 0 warnings; `check_runtime.js` — OK; **69/69 deterministic generated outputs byte-identical v1.22**; все 255 baseline-файлов сохранены и добавлен ровно один runtime consumer `js/today-layer.js`; 30/30 JS syntax OK; 17/17 HTTP surfaces → 200; `__pycache__/.pyc` отсутствуют. Финальный clean-extract gate выполняется после сборки release ZIP.

## v1.22 — Existing Domains Expansion II — Liturgical Readings & Source Quality

- добавлен отдельный editorial source `data/liturgical_sources/readings_2026_editorial.json` с библиографическими ссылками на чтения для 13 дат существующих canonical feast records; текст Священного Писания не копируется;
- generated `readings.json` расширен с 0 до **48** stable `pm-reading-*` records; каждый record имеет `verification_status: editorial_verified`, `text_ref: null`, explicit source URL и scope провайдера;
- `liturgical_relations.json` расширен с 167 до **215** relations только за счёт 48 explicit `calendar_day → reading` links; старые liturgical facts и relation IDs не переопределяются;
- source manifest теперь описывает legacy calendar provider и отдельный editorial reading provider. Новый provider не объявляется официальным источником церковной юрисдикции; его jurisdiction остаётся `unspecified`;
- для дат `2026-11-04` и `2026-12-04` reading records не создаются: доступный источник не дал явного списка библиографических чтений, поэтому проект ничего не выводит по совпадению праздника/даты;
- calendar day UI показывает чтения отдельным блоком, calendar cells/summary используют compact reading count, а item/source disclosure даёт прямую ссылку на provenance page;
- `PravmirLiturgical` обновлён до `1.22.0` без удаления существующих API; project/runtime checker валидирует reading counts, provenance URLs, отсутствие copied Scripture text и day→reading coverage;
- canonical place/content/event/food schemas, M2–M4 contracts, stable IDs и 85 legacy pilgrim services не меняются.

M5.6 в v1.22 не начат. Следующий релиз серии должен продолжить усиление source quality/coverage существующих journal/event/food/Daily surfaces; только после завершения серии начинается Pilgrim Infrastructure.

Проверено до упаковки: выполнен ровно один полный `tools/run_m2.py`; `check_project.py` — 0 errors / 0 warnings; `check_runtime.js` — OK; 59/69 deterministic generated outputs остались byte-identical v1.21, изменились ровно 10 liturgical payloads; все старые 167 liturgical relations сохранились без изменения и добавились ровно 48 `has_reading`; все прежние feast/saint/commemoration/fasting records сохранены, а 13 calendar-day records изменились только добавлением reading references; все 254 файла v1.21 сохранены и добавлен один source file; 29/29 JS syntax OK; 17/17 HTTP surfaces → 200; junk bytecode отсутствует. Финальная чистая распаковка release ZIP выполняется после сборки архива.

## v1.21 — Existing Domains Expansion I — Connected Objects & Content

- Content Core получил отдельный explicit editorial source `data/content_sources/editorial_links.json`; 11 cross-domain links создаются только из перечисленных stable IDs и не выводятся из совпадений текста/названий;
- generated `content_links.json` теперь содержит 11 стабильных `pm-clink-*` relations с provenance на конкретные source rows и статусом `editorial_verified`;
- связи охватывают существующие content → place/entity/route/feast endpoints и не изменяют source-verified M4 graph relations;
- `PravmirContent 1.21.0` умеет разрешать liturgical references через `PravmirLiturgical`, сохраняя старые Content Core APIs;
- canonical place page показывает явно связанные материалы через reverse `content_link`;
- canonical article page показывает человекочитаемые связанные места, сущности, маршруты и литургические объекты вместо технических ID;
- holiness entity detail показывает связанные материалы по explicit entity links;
- project/runtime gate валидирует link endpoints и запрещает dangling cross-domain references; дополнительных milestone checker/test файлов не добавлено;
- readings остаются честно пустыми (`0`): v1.21 не копирует Scripture text из внешних источников без подходящей лицензии/jurisdiction contract;
- canonical schemas, M2–M4 stable IDs, place data, graph relations, routes, calendar/event/food facts и 85 legacy pilgrim services не переопределялись.

M5.6 в v1.21 не начинался. Следующий релиз серии должен расширять качество/покрытие существующих liturgical/journal/event/food данных и источников, не создавая факты по text matching.

Проверено до упаковки: один полный rebuild успешно завершён; `check_project.py` — 0 errors / 0 warnings; `check_runtime.js` — OK; 59/69 deterministic generated outputs совпали с v1.20, а 10 изменённых относятся только к новому Content source snapshot/Content Core compatibility payloads; все 253 baseline-файла сохранены и добавлен один editorial source; 29/29 JS syntax OK; 17/17 HTTP surfaces → 200; junk bytecode отсутствует. Chromium render в среде снова не завершился надёжно, поэтому screenshot/Lighthouse/device QA не заявляется.

## v1.20 — Performance & Discovery 2.0

- главная карта больше не запускается на `DOMContentLoaded`: загрузка начинается при приближении map-section к viewport, прямом `#map`, pending mapTarget/mapRoute или явном взаимодействии пользователя;
- тяжёлый `search_index.json` больше не загружается из-за обычного lookup карточки: `PravmirData` разделяет search-core и lookup-index promises, сохраняя прежний публичный API;
- поиск не загружает `index.json` только ради suggestions; lookup по ID/slug/region не загружает `search_index.json`;
- Leaflet Routing Machine стал opt-in: основной map boot загружает core + clustering, routing plugin запрашивается только при реальном построении маршрута;
- marker rendering остаётся batch/idle и использует SVG-систему вместо emoji marker; map engine error допускает явный повторный запуск;
- добавлен map-to-list discovery: после движения карты показываются карточки ближайших к центру объектов в видимой области;
- home search получил debounce, loading/error states, keyboard combobox semantics, быстрые discovery-входы и смешанные результаты Places / Routes / Journal / Calendar через существующие domain layers;
- добавлен визуальный discovery hub: Места / Святые и святыни / Маршруты / Календарь / Журнал / Кухня;
- каталог получил skeleton loading, явный retry при ошибке, SVG location/status states и aria-busy;
- нижние тяжёлые homepage sections используют `content-visibility:auto` + intrinsic size; изображения ниже первого экрана получили lazy decoding/loading там, где это безопасно;
- canonical schemas, stable IDs, URLs, provenance, M2–M5.5 data и domain boundaries не изменялись; raw sources страницы напрямую не читают.

M5.6 в v1.20 не начинался.

Проверено перед упаковкой: один полный rebuild успешно завершён; structural/project check — 0 errors / 0 warnings; runtime smoke — OK; все 69 deterministic generated outputs совпали с v1.19. В среде найден Chromium, но headless-render не завершался надёжно, поэтому screenshot/Lighthouse/real-device QA в доказательства релиза не включаются.

## v1.19 — UX / Design System 2.0

- единая пятичастная навигация: Сегодня / Рядом / Исследовать / Паломничество / Мой ПМ; остальные действующие разделы доступны из меню и footer;
- active state различает домашний экран и `#map`, обновляется при hashchange и работает на вложенных страницах;
- единые SVG-иконки, tokens, шрифтовой запрос, системные font fallbacks, поверхности, скругления, контраст и фокус;
- исправлены page offsets под fixed header на desktop/tablet/mobile, desktop bottom padding и mobile safe-area;
- нижняя мобильная навигация получила читаемые подписи и отдельные SVG-иконки;
- меню: aria-expanded/controls, скрытое состояние, focus containment, Escape, возврат фокуса и scroll lock;
- skip link сохраняет существующий ID основного domain container; масштабирование разблокировано на текущих product pages;
- главный экран получил лёгкий CSS-фон и быстрые входы в календарь, журнал, кухню, карту и паломничество;
- watermarked `hero-bg.jpg` больше не используется интерфейсом, но сохранён как legacy asset;
- домашние маршруты читаются через `PravmirData` и ведут на реальные canonical route pages; прежние демонстрационные карточки и придуманные counts убраны из показа;
- будущие amenities/contributions явно отмечены как готовящиеся; неработавшие плитки не изображают действующие гостиницы/парковки;
- кухня показывает реальные подборки по explicit calendar relations, понятные состав/масло, empty/reset/error/retry states;
- афиша честно сообщает об отсутствии подтверждённых событий; 4 demo records остаются только в review queue;
- journal read-later control вынесен из ссылки карточки; ошибка localStorage больше не выглядит успешным сохранением;
- технические идентификаторы и provenance сохранены; основные тексты переведены на пользовательский язык, подробности источников доступны в disclosure blocks;
- image fallback и progressive motion: сбой изображения/IntersectionObserver не оставляет скрытый контент.

Только presentation/runtime consumers изменены. Canonical schemas, IDs, generated domain data и source snapshots не менялись. 10 legacy article-body HTML сохранены побайтово; их исторические head attributes не переписываются, доступный основной путь — `articles/article.html`.

Проверки: один full rebuild, project/schema/reference check, компактный runtime smoke (в том числе navigation hash/five-section contracts и реальный menu handler), HTTP surfaces и строгий clean-extract ZIP gate. Одноразовый UI DOM smoke проверил food date/empty/reset, event empty/date-range, calendar/day, recipe, unpublished event, canonical article body и home route preview; скрипт не включается в ZIP. Все 253 файла baseline сохранены; 69 deterministic generated outputs побайтово совпадают с v1.18. Новые milestone checkers/runners/tests не добавлены.

Ограничение QA: в среде нет установленного браузера для рендера. Проверки не означают скриншотный review, Lighthouse, Android-device test или сертификацию WCAG. Шрифты и часть исторических фотографий по-прежнему имеют внешние endpoints и безопасные fallbacks.

## v1.18 — Corrective Release & Runtime Boundaries

- добавлен `requirements.txt` для build-зависимостей `jsonschema` / `referencing`;
- `tools/run_m2.py` получил preflight Python/dependencies/Node, строгую ошибку вместо ложного runtime skip, `PYTHONDONTWRITEBYTECODE` и cleanup также при ошибке;
- `check_project.py` проверяет полноту checksum manifest и согласованность версии;
- исправлены вложенные пути `food/recipe.html` и active state разделов;
- домашний календарный виджет переведён с отдельного `calendar2026` на `PravmirLiturgical`;
- каталог 85 паломнических служб переведён с raw `data/pilgrim-centers.json` и встроенного fallback на `PravmirContent` / generated `pilgrim_services.json`;
- интерфейс каталога больше не называет legacy records аккредитованным реестром: они явно показаны как требующие проверки;
- сохранённые статьи открываются из локального профиля; старые записи без URL сопоставляются с canonical материалами через `PravmirContent`;
- локальные настройки профиля работают и ясно отделены от будущих аккаунтов M6;
- устранены основные пустые ссылки общей навигации и главной страницы; будущие действия обозначены честным состоянием.

## Stable core snapshot

- imported records: `12 963`;
- canonical places: `12 957`;
- rejected: `645`;
- regions: `18`;
- historical SPB aliases: `414`;
- compatibility runtime places: `0`;
- graph entities: `7`;
- graph relations: `7`;
- routes: `2`;
- content items: `21`;
- content authors: `11`;
- content categories: `7`;
- article bodies: `10`;
- canonical content links: `11`;
- calendar days: `365`;
- feasts: `15`;
- saints: `7`;
- commemorations: `8`;
- fasting rules: `4`;
- readings: `48`;
- liturgical relations: `215`;
- liturgical legacy aliases: `31`;
- canonical events: `0`;
- event review queue: `4` demo-only.

Не менять M2–M5 stable IDs, provenance, aliases, map/search/catalog/routes/graph/content/calendar/event contracts без явной миграции.

## M5.5 Orthodox Food

Добавлен отдельный canonical culinary domain:
- stable `pm-recipe-*` IDs;
- source snapshot и provenance;
- recipe schema;
- dietary profile;
- fasting compatibility metadata;
- typed food relations;
- generated indexes;
- `PravmirFood` runtime layer;
- catalog and canonical recipe page;
- calendar/day integration.

Current M5.5 snapshot:
- recipes: `9` (6 post-friendly + 3 festive editorial recipes);
- typed food relations: `27`;
- fasting rules with recipe suggestions: `4`;
- canonical liturgical prescriptions created: `0`.

Все recipe ↔ fasting_rule и recipe ↔ feast связи имеют класс `editorial_guidance`. Они означают только редакционную кулинарную подборку и не превращаются в каноническое правило питания или литургический факт.

## Verification architecture — simplified in v1.17, hardened in v1.18

Старый накопившийся milestone test/check stack удалён.

Удалены:
- `tests/`;
- `tools/check_m*.py`;
- `tools/check_checksums.py`;
- старые standalone milestone/data-core/release-runner checkers;
- `release_contracts.py`;
- `release_pipeline.py`;
- proof/cache state files;
- `--cold` / `--deep` orchestration.

Текущий минимальный release contract:
1. `python tools/run_m2.py` — один canonical rebuild M2→M5.5 и затем compact verification;
2. `python tools/check_project.py` — structure, JSON, local refs, stable IDs, reference integrity, domain counts, runtime boundaries, checksum manifest, junk detection;
3. `node tools/check_runtime.js` — один browser-like runtime smoke для `PravmirData`, `PravmirContent`, `PravmirLiturgical`, `PravmirEvents`, `PravmirFood` и общих navigation contracts.

Чистая среда сначала выполняет `python -m pip install -r requirements.txt`. Runtime verification требует Node.js и теперь не считается пройденной при его отсутствии. `run_m2.py --verify-only` является строгим финальным gate и проверяет shipped checksum manifest.

`FILE_SHA256SUMS.txt` исключает только сам manifest и два transient timestamped diagnostic reports (`import_report.json`, `dedupe_report.json`); они не считаются deterministic release artifacts.

Для доказательства deterministic output при релизе допускается временное сравнение hashes до/после повторного build вне shipped verification stack. Такие одноразовые проверки не должны накапливаться в ZIP.

## После product-hardening

Pilgrim Infrastructure должен моделировать реальные сервисы паломника как отдельные entities/records, а не как произвольные поля place:
- трапезные;
- гостиницы/паломнические дома;
- лавки;
- транспорт;
- парковки;
- купели;
- accessibility;
- другие verified amenities.

Связь amenity → place/route создаётся только по explicit evidence/stable ID. `Place != Organisation` сохраняется.
