# Канонический roadmap проекта «ХВ / Православный Мир» — v1.45

Зафиксировано: 2026-10-05.

## Учёт полноты продукта

`Завершено` для исторического M-domain ниже означает инженерный этап и пройденные release contracts. Полный product scope и незакрытое наполнение отдельно зафиксированы в **MASTER_BACKLOG.md** (все PM-01…PM-53). 0 events, 365 civil days, 2 routes и малый graph не считаются готовой афишей, полным литургическим календарём или наполненным паломническим продуктом. Незаполненные задачи сохраняются, даже когда domain API уже реализован.

## M1 — Core Stability
**Завершено.**

## M2 — Data Core
- M2.1 schema place;
- M2.2 regional import;
- M2.3 normalization;
- M2.4 aggregation / stable IDs / dedupe / provenance;
- M2.5 generated indexes;
- M2.6 `PravmirData` runtime boundary.

**Завершено.**

## M3 — Objects & Discovery
- M3.1 canonical object page;
- M3.2 discovery catalog;
- M3.3 map/region discovery;
- M3.4 search/discovery;
- M3.5 SPB canonical migration.

**Завершено.**

## M4 — Routes & Knowledge Graph
- M4.1 graph/route core;
- M4.2 route detail + map integration;
- M4.3 relation discovery;
- M4.4 graph traversal;
- M4.5 verified graph-source import.

**Завершено.**

## M5 — Content & Orthodox Knowledge
- **M5.1 — Content Core. Завершено в v1.13.**
- **M5.2 — Journal. Завершено в v1.14.**
- **M5.3 — Calendar / Liturgical Core. Завершено в v1.15.**
- **M5.4 — Events. Завершено в v1.16.**
- **M5.5 — Orthodox Food. Завершено в v1.17.** Постные и праздничные editorial recipes, dietary metadata, explicit editorial-guidance relations to fasting rules and feasts, `PravmirFood`, calendar/day integration. Food guidance не является canonical liturgical prescription.
- **M5.6 — Pilgrim Infrastructure. Завершено в v1.27.**
  - **M5.6.1 — Core (v1.24):** canonical amenity/service schemas, 12-type taxonomy, provenance/freshness/trust contract, `PravmirPilgrim`, 85 legacy rows isolated in review queue.
  - **M5.6.2 — Evidence / Verification / Binding (v1.25, завершено):** 2 amenities + 2 services + 4 explicit source-verified place relations; 2/85 legacy promotions только по official evidence; 1 unresolved source conflict сохранён без canonicalization.
  - **M5.6.3 — Discovery / Route integration (v1.26, завершено):** canonical filters, unified-search integration, place/route discovery traversal, availability/freshness UX без новых inferred facts.
  - **M5.6.4 — Domain Gate (v1.27, завершено):** integrity/trust/deep-link/snapshot/topology checks, runtime trust summary и финальная фиксация M5.6 без новых facts.
- **M5.7 — News. Завершено в v1.31.** Sources, provenance, temporal metadata, links to places/events/entities/organisations.
  - **M5.7.1 — News Core (v1.28, завершено):** isolated News domain, source/snapshot/schema/runtime/UI; 5 legacy Journal news rows preserved as review-only, 0 auto-promotions.
  - **M5.7.2 — Source Verification & Temporal Ingestion (v1.29, завершено):** 3 official-source verified canonical news with exact publication timestamps/freshness; legacy 5 remain review-only; relations stay 0.
  - **M5.7.3 — Relations & Daily Integration (v1.30, завершено):** 1 explicit News→Lavra relation, place reverse surface и canonical News в Today with same-day/latest fallback; legacy review excluded.
  - **M5.7.4 — Domain Gate (v1.31, завершено):** schema/stable-ID/deep-link/temporal/provenance/legacy-isolation/evidence/topology gate; Daily/place runtime integration verified; 0 inferred/organisation facts.
- **M5.8 — Orthodox Library & Media. Завершено в v1.35.** Works, authors, texts, editions, audio/video, Scripture, жития, богословие, молитвы, проповеди, история Церкви; copyright/licensing.
  - **M5.8.1 — Core (v1.32, завершено после release-gate):** domain boundary, work/author/edition/text/media schemas, 7-status rights policy, generated/runtime/UI, 0 unverified promotions and 0 protected full-content copying.
  - **M5.8.2 — Verified Bibliography & Scripture References (v1.33, завершено после release-gate):** 6 source-verified authors, 14 Scripture works, 14 metadata-only editions, 48 stable reading bridges and explicit relations; no Scripture text copied.
  - **M5.8.3 — Rights-cleared Text / Audio / Video & Relations (v1.34, завершено после release-gate):** 1 public-domain external text, 1 CC0 audio, 1 CC BY-SA video; права/evidence фиксируются на уровне asset; remote bytes не копируются; explicit typed relations only.
  - **M5.8.4 — Library Domain Gate (v1.35, завершено после release-gate):** rights/provenance/deep-link/topology/determinism/reverse-integration closure без новых canonical facts; M5.8 закрыт.
- **M5.9 — Content/Knowledge Integration Gate (v1.36, завершено после release-gate).** Consumer-only `PravmirKnowledge`, cross-domain traversal existing explicit relations, Daily Reading→Library stable-ID integration, provenance aggregation and final M5 release gate.

**Структурный M5 gate был завершён в v1.36. После M6.1 продуктовая проверка выявила недостаточное текстовое покрытие Library; по решению пользователя выполняется post-gate M5.10 Text Library Expansion перед продолжением M6.2. Архитектура M5.8/M5.9 не переделывается.**

## Product hardening перед M5.6

- **v1.18 — Corrective Release & Runtime Boundaries. Завершено.** Воспроизводимость, навигация, локальные действия, главный календарь через `PravmirLiturgical`, паломнический legacy-каталог через `PravmirContent`.
- **v1.19 — UX / Design System 2.0. Завершено.** Общая визуальная система и типографика, five-section SVG navigation, responsive fixed shell, mobile safe-area, focus/keyboard/zoom basics, honest empty/error/future states. Browser/device визуальный QA не выполнен в среде и остаётся отдельной задачей перед production.
- **v1.20 — Performance & Discovery 2.0. Завершено.** Lazy map boot, разделение search/lookup runtime loads, routing-on-demand, улучшенный unified search/discovery, map-to-list flow, skeleton/error/retry states и render deferral без изменения canonical IDs/contracts.
- **v1.21 — Existing Domains Expansion I — Connected Objects & Content. Завершено.** 11 explicit editorial Content Core links с stable IDs/provenance; reverse place/entity/article navigation; никаких canonical links по совпадению названий.
- **v1.22 — Existing Domains Expansion II — Liturgical Readings & Source Quality. Завершено.** 48 библиографических reading records на 13 дат, отдельный editorial provider/snapshot/provenance, 215 liturgical relations; Scripture text не копируется, отсутствующие source facts не выводятся.
- **v1.23 — Existing Domains Expansion III — Today / Daily Layer 1.0. Завершено.** Cross-domain «Сегодня» через существующие Liturgical / Content / Events / Food APIs; explicit relations имеют приоритет, fallback контент честно отделён, demo/review events не протекают в пользовательский слой.
- **Серия Data & Existing Domains Expansion завершена. Следующий этап — M5.6 Pilgrim Infrastructure.** Начать canonical amenity/service domain, сохранив около 85 `legacy_unverified` pilgrim-service records как evidence/review input, а не автоматически повышая их до canonical facts.
- **v1.24 — M5.6.1 Pilgrim Infrastructure Core.** 12 amenity types, canonical amenity/service/freshness contracts, `PravmirPilgrim`, 85/85 legacy records → review queue, 0 auto-promotions / 0 inferred bindings.
- **v1.25 — M5.6.2 Evidence / Verification / Binding.** Первые 4 canonical infrastructure records и 4 explicit place relations созданы только из official-source evidence; 2 legacy rows promoted, 83 остаются pending; 1 официальный conflict сохранён unresolved.
- **v1.26 — M5.6.3 Discovery / Route Integration.** Filters + freshness UX + unified search + route-stop traversal к explicit place infrastructure. Data facts не меняются.
- **v1.27 — M5.6.4 Domain Gate.** M5.6 integrity/trust gate, exact relation topology, canonical-vs-review isolation, deep links/snapshot/freshness verification и trust summary. Новые facts не добавляются; M5.6 закрывается. Следующий этап — M5.7 News.
- **v1.28 — M5.7.1 News Core.** Отдельный trust-safe News domain; 5 legacy news → review queue, 0 canonical promotions; temporal/provenance contracts и отдельный UI. Следующий подпункт — M5.7.2.
- **v1.29 — M5.7.2 Source Verification & Temporal Ingestion.** 3 canonical news from official Patriarchia.ru snapshot, exact temporal/provenance metadata, 0 relations; 5 legacy news remain review-only. Следующий подпункт — M5.7.3.
- **v1.30 — M5.7.3 Relations & Daily Integration.** 4 canonical news / 1 explicit News→Lavra relation; intended place/Today integration; no inferred/org facts.
- **v1.31 — M5.7.4 News Domain Gate.** Закрывает фактические runtime gaps v1.30 и фиксирует schema/stable-ID/temporal/provenance/evidence/topology gate. M5.7 CLOSED.
- **v1.32 — M5.8.1 Library & Media Core.** Rights-first Library domain, schemas/runtime/UI, 7 ingestion rights statuses, 0 unverified canonical promotions / 0 protected full-content copying.
- **v1.33 — M5.8.2 Verified Bibliography & Scripture References.** 6 authors / 14 Scripture works / 14 metadata-only editions / 48 reading bridges / 60 explicit relations; no copied Scripture text.
- **v1.34 — M5.8.3 Rights-cleared Assets & Relations.** External-only rights-cleared text/audio/video, per-asset evidence/license metadata and explicit relations; no copied remote bytes.
- **v1.35 — M5.8.4 Library Domain Gate.** No new facts; closes rights/provenance/deep-link/topology/reverse-integration contracts.
- **v1.36 — M5.9 Content/Knowledge Integration Gate.** `PravmirKnowledge`, Daily Reading→Library stable bridges, cross-domain traversal/provenance final gate; no new facts.

## M5.10 — Text Library Expansion — CLOSED by v1.44

Post-gate расширение фактического текстового покрытия поверх уже стабильных M5.8 contracts. Audio/video expansion отложен; существующие media assets сохраняются без расширения. Canonical facts по-прежнему требуют stable IDs + typed relations + provenance/evidence.

- **M5.10.1 — Authors & Textual Works (v1.38, завершено):** 9 authors / 25 works / 24 editions / 10 rights-verified external text assets / 82 explicit relations; theology/catechesis/sermon coverage; existing 2 media assets unchanged.
- **M5.10.2 — Жития (v1.39, завершено):** 5 source-verified life works / 6 explicit `life_of` relations to existing saint stable IDs; Calendar/Library/Knowledge traversal; Anna of Kashin remains unlinked pending verified evidence; no name matching and no inferred life→place link.
- **M5.10.3 — Святоотеческая и богословская библиотека (v1.40, завершено):** 2 новых theological works, 5 local CC BY-SA transcriptions с pinned source/evidence/SHA256, lazy reader; 2 спорные редакции переведены в external-link-only без потери IDs.
- **M5.10.4 — Молитвенные, богослужебные и гимнографические тексты (v1.41, завершено):** 4 pinned local CC BY-SA textual publications (`prayer`, `liturgy`, `hymnography`), explicit anonymous/traditional authorship contract, classification evidence, exact size/SHA256; 36 works / 35 editions / 21 text assets / 101 relations. Без inferred feast/saint/place links.
- **M5.10.5 — Проповеди, катехизация и история Церкви (v1.42, завершено):** 3 pinned external source-verified publications (`sermon`, `catechesis`, `church_history`), +2 authors, conservative exact-publication rights correction for the existing Filaret catechism; 39 works / 38 editions / 24 text assets / 107 relations; no copied remote bytes or inferred saint/feast/place links.
- **M5.10.6 — Интеграция расширенной библиотеки (v1.43, завершено):** Library Discovery с URL-state filters/facets, author/work UX, work→calendar traversal, explicit same-author/saint-life navigation и Daily saint→life integration; place links не создавались без evidence.
- **M5.10.7 — Library / Knowledge Expansion Gate (v1.44, завершено):** schemas, IDs/aliases, provenance/rights/local bodies/checksums/topology, search/discovery/Daily и regressions M2–M6.1; исправлен normalized alias duplicate без смены stable ID; статус наполнения отдельно от инженерного gate.
- **M5.10.8 — условный corrective release:** отдельный Library ZIP не требуется — реальные findings закрыты внутри v1.44. Не выпускать пустой релиз ради номера.

M5.10 закрыт. **M6.2 завершён в v1.45** поверх сохранённого M6.1. Следующий этап — M6.3.

## M6 — Backend / Users / My PM
Пользовательский слой хранится отдельно от canonical/system facts. Личные связи не повышают trust canonical data и не создают organisation facts.

- **M6.1 — Ядро пользователя и «Мой ПМ» (v1.37, завершено):** `PravmirMyPm`, versioned device-local state, typed stable refs, legacy migration/isolation, рабочие favorites/read-later/saved-routes. Backend/auth/sync ещё не заявляются.
- **M6.2 — Backend / Accounts / Authentication / Profile Sync (v1.45, завершено как local-first backend foundation):** SQLite migrations, public read-only API adapters, accounts, scrypt passwords, server-side sessions + CSRF, recovery foundation, profile persistence, account export/delete и explicit versioned My-PM push/pull без автоматической загрузки localStorage. Production deployment/mail delivery относятся к M8.
- **M6.3 — Избранное, списки, посещения и прогресс:** named lists, visits/history, saved content/library progress с explicit user ownership.
- **M6.4 — Подписки и уведомления:** explicit opt-in, preferences, subscriptions на entities/places/events/content и delivery state.
- **M6.5 — Отзывы, фотографии и личные маршруты:** community trust layer, moderation hooks и ownership; user content не перезаписывает canonical.
- **M6.6 — «Мой приход» и достижения:** parish preference/subscription без premature organisation fact; достижения только за путешествия/обучение/вклад, без геймификации молитвы/таинств.
- **M6.7 — User Domain Gate:** privacy/export/deletion, migration, ownership, auth/sync/conflict и M2–M5 regression closure перед M7.

## M7 — Organisations / Admin / Trust
Parish, organisation, deanery, diocese, clergy, representatives, claim place, roles, verification, moderation, contributions, audit trail.

Критическое правило: `Place != Organisation`.

## M8 — Production
PWA/offline, security/privacy, accessibility, monitoring, backups, performance, API, scale, deployment/mobile readiness.

## После M8
Parish OS, Community, donations/services, pilgrimage marketplace, native apps, public/partner API.

## Current development rules
1. Canonical source — последний проверенный полный ZIP.
2. GitHub — только по прямой команде пользователя.
3. Не удалять работающие product functions/data без явного решения; verification artifacts не считаются product functions и должны оставаться минимальными.
4. Frontend читает canonical domain data только через `PravmirData`, `PravmirContent`, `PravmirLiturgical`, `PravmirEvents`, `PravmirFood`, `PravmirPilgrim`, `PravmirNews`, `PravmirLibrary`; cross-domain traversal выполняет `PravmirKnowledge`, personal user/device state — `PravmirMyPm`. Homepage/secondary pages входят в это правило.
5. Raw/legacy/source bundles — provenance/build inputs, не runtime database.
6. Canonical links создаются только через stable IDs + typed relation + provenance/evidence; text matching не создаёт canonical facts.
7. Release verification не накапливается по milestone: один build runner, один project checker, один runtime smoke. Одноразовые глубокие сравнения выполняются вне ZIP.
8. PM-01…PM-53 — master backlog/work packages, а не 53 обязательных ZIP. Выпускать крупные связанные релизы; M1–M5.5 расширять и укреплять, а не пересоздавать.
