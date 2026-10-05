# MANIFEST — v1.45

Дата: 2026-10-05. Версия проекта: **1.45**.
Этап: **M6.2 — Backend / Accounts / Authentication / Profile Sync**.

## Baseline v1.45

Проверенный полный `Pravoslavnii-mir_v1.44.zip`: size **19 560 512 bytes**, SHA256 **c9198cd0c7bd2151b619591d8284702067eb0be3b7259a6ec10892afa7d2a8c2**. v1.45 продолжает сохранённое рабочее дерево, созданное от clean-extract v1.44; GitHub не использовался.

## v1.45 changes

- Новый `backend/` остаётся отдельным слоем: SQLite persistence/migration, account service, security primitives, HTTP/API v1 и read-only adapter к canonical generated snapshots. Canonical M2–M5 data не переносятся в private user database и stable IDs не меняются.
- Accounts: register/login/logout, profile (`display_name/city/timezone`), account export/delete, recovery token/reset foundation. Password = salted scrypt; session/recovery secrets хранятся hashed; session cookie HttpOnly/SameSite=Lax; authenticated mutations требуют same-origin + CSRF.
- My-PM sync: server stores normalized M6.1 schema-v1 snapshot by user with monotonic revision + SHA256. PUT requires `base_revision`; mismatch returns conflict instead of last-write-wins. State limit = 1 MiB.
- Browser adapter `PravmirAccount 1.45.0` never uploads automatically. Existing `PravmirMyPm` API version remains **1.37.0**; local state continues to work if backend is absent. Profile UI exposes explicit push/pull, server profile, recovery, export/delete. Pull requires confirmation and preserves destination `local_user_id`.
- Backend defaults to localhost and DB outside release tree. Recovery delivery channel is not faked: local dev may expose token only with `PRAVMIR_DEV_RECOVERY=1`; production transport/deployment remains future M8 work.
- Verification stays lean: existing project/runtime checkers are extended and one `tools/check_backend.py` performs real temporary-DB/API ownership/session/recovery/sync smoke.

## v1.45 verification

Pre-rebuild: project **0/0**, backend/API smoke **OK**, runtime **OK**; v1.44 inventory **363/363** preserved, +8 files / 0 deletions; stable generated data **98/98 byte-identical** and Library IDs preserved. Один canonical `run_m2.py` completed all M2→Library builders, project integrity **0/0** and backend/API smoke **OK**; external timeout occurred only at `START runtime smoke`, so no build stage was repeated. Runtime resumed separately → **OK**. Determinism after rebuild: **98/98 pre/post identical** and **98/98 v1.44→v1.45 stable generated identical**. Pre-package gates: project **0/0**, backend **OK**, runtime **OK**, JS **42/42**, Python **25/25**, HTTP **48/48**, inventory **371**, junk **0**. Final checksum manifest, strict verify-only and clean-extract gate follow after this manifest is frozen. Android/SPCK, visual Chromium and Lighthouse remain unperformed.

## Historical release — v1.44

## Baseline v1.44

Проверенный полный `Pravoslavnii-mir_v1.43.zip`: size **19 041 561 bytes**, SHA256 **9f0103980266c1dfa953fca796a985ca9c49b407535e9e0c81de475b6faa4da0**. Использована clean-extract копия после strict **0 errors / 0 warnings / runtime OK**. GitHub не использовался.

## v1.44 changes

- M5.10.7 — инженерный Library/Knowledge gate без расширения corpus: **11 authors / 39 works / 38 editions / 48 Scripture refs / 24 text / 2 media / 107 relations**.
- Frozen source исправляет один normalized alias duplicate у Игнатия Брянчанинова; stable ID/slug/display name и все author/work relations сохранены. `library_source_snapshot` = **1.8.0**.
- Existing `build_library.py` теперь отклоняет empty/search-equivalent author aliases. Existing `check_project.py` проверяет exact slug/canonical-path binding, normalized alias integrity, exact deterministic index contents, relation topology/endpoints и отсутствие Library↔place edge без approved evidence. Отдельные checker/test files не добавляются.
- Rights/provenance/local-text contracts не ослабляются: 9 local CC BY-SA texts сохраняют exact bytes/size/SHA256; 3 exact electronic publications остаются `external_link_only`; все historical audit evidence и stable relations сохранены.
- Discovery/author/work/Today integration v1.43 и device-local M6.1 входят в gate. `PravmirLibrary`/`PravmirToday` API versions не меняются, так как new product API не вводится.

## v1.44 verification

Baseline v1.43 повторно проверен strict `--verify-only` → **0/0 + runtime OK**. Pre-rebuild: project **0/0**, runtime **OK**, baseline inventory **363/363**, all Library stable IDs preserved, non-Library deterministic JSON **67/67 byte-identical**. Единственный canonical `run_m2.py` завершён полностью без timeout за **33.57s**: all M2→Library stages OK, project integrity **0/0**, runtime **OK**. Pre/post rebuild deterministic generated JSON **80/80 identical**; local TXT **9/9 byte-identical**; inventory **363/363**, no missing/added files, junk **0**. Post-build syntax JS **41/41**, Python **18/18**; HTTP HTML/TXT **48/48**. Final checksum manifest, strict verify-only and clean-extract strict gate выполняются после заморозки этого manifest. Android/SPCK, visual Chromium and Lighthouse remain unperformed.

## Historical release — v1.43

### Baseline v1.43

Проверенный полный `Pravoslavnii-mir_v1.42.zip`: size **19 549 435 bytes**, SHA256 **cf249935a2bf2e67c71893f8ad16348a4a33736ae36fe42429916f5b9223d78b**. Использована clean-extract копия после strict **0 errors / 0 warnings / runtime OK**. GitHub не использовался.

### v1.43 changes

- Generated Library facts не меняются: **11 authors / 39 works / 38 editions / 48 Scripture refs / 24 text / 2 media / 107 relations**; stable IDs/provenance/rights topology сохраняются.
- `PravmirLibrary 1.43.0`: filters/facets по типу, rights и доступности; author-aware query через explicit author attribution; `getAuthorBundle`, `getDiscoveryFacets`, `getReadingsForWork`, `getRelatedWorksForWork`.
- `library.html`: URL-state discovery, author-view, clear/reset states и product labels; `library/item.html`: work→calendar reading/day links, explicit saint links, same-author traversal и visible provenance.
- `PravmirToday 1.43.0`: calendar commemoration→saint traversal через `PravmirLiturgical.getRelations`, затем saint→life только через Library `life_of`; homepage показывает жития без текстового/name matching.
- No new place/feast/saint/organisation canonical relations, no new raw sources, no new media, no schema migration. Existing M6.1 unchanged.

### v1.43 verification

Pre-rebuild project/runtime = **0 errors / 0 warnings / OK**; Library IDs and all 363 baseline files preserved, **98/98 deterministic generated JSON** byte-identical v1.42. Один canonical `run_m2.py` завершил все builders и project integrity **0/0**, после чего внешний timeout сработал на `START runtime smoke`; rebuild не повторялся, runtime выполнен отдельно → **OK**. Post-build determinism **98/98**, inventory **363/363**, junk **0**, JS **41/41**, Python **18/18**, HTTP HTML/TXT **48/48**. Final checksum manifest, strict verify-only and clean-extract strict gate are performed after release metadata is frozen. Android/SPCK, visual Chromium and Lighthouse remain unperformed.

## Historical release — v1.42

# MANIFEST — v1.42

Дата: 2026-10-05. Версия проекта: **1.42**.
Этап: **M5.10.5 — Проповеди, катехизация и история Церкви**.

## Baseline v1.42

Проверенный полный `Pravoslavnii-mir_v1.41.zip`: size **19 075 810 bytes**, SHA256 **8274e6ee4897f0d8628769c246cf67d82f8c06c629a2b15f4985a7841221f996**. Использована его clean-extract копия после strict **0 errors / 0 warnings / runtime OK**. GitHub не использовался.

## v1.42 changes

- +3 works / +3 editions / +3 external text assets / +6 explicit relations / +2 authors: Феофан Затворник — сборник проповедей 1863 (`sermon`); Филарет (Гумилевский) — назидательная Священная история 1850 (`catechesis`); К. П. Победоносцев — история Православной Церкви 1891 (`church_history`).
- Новые электронные публикации сохраняются как `external_url`; remote full-text bytes в релиз не копируются. Pinned revision, source/provenance, rights evidence, classification evidence и CC BY-SA attribution/license сохраняются в frozen source. Историческое произведение и электронная публикация учитываются раздельно.
- Existing `philaret-longer-catechism` исправлен без смены stable IDs: work = `public_domain_verified`, exact electronic asset = `external_link_only`; previous rights assessment сохранён в audit evidence из-за современного редакционного аппарата указанной электронной публикации.
- Totals: **11 authors / 39 works / 38 editions / 48 Scripture refs / 24 text / 2 media / 107 relations**; rights-cleared text = **21**, local text = **9**, external-link-only = **3**.
- Relation topology: **27 author_attribution / 48 scripture_citation_of / 24 full_text_of / 6 life_of / 1 recording_of / 1 depicts_feast**. Новых saint/feast/place/organisation relations нет. Audio/video unchanged.
- `PravmirLibrary 1.42.0`; schemas/data-layer remain backward-compatible. M6.1 preserved; M6.2 paused until M5.10 closes.

## v1.42 verification

Pre-rebuild: source-driven Library build + project checker + runtime smoke → **0 errors / 0 warnings / OK**; all existing Library stable IDs preserved; **85/85 non-Library generated JSON** byte-identical v1.41. Единственный canonical `run_m2.py` завершил M2→M5.6 и был прерван внешним timeout после `START M5 news`; завершённые стадии не повторялись. News был завершён отдельно, затем выполнены ещё не начавшиеся Library builder, project integrity и runtime smoke → **0/0 / OK**. Determinism pre/post rebuild: **80/80 generated JSON identical**. Pre-package: project **0/0**, runtime **OK**, checksum manifest **360/360**, JS syntax **41/41**, Python syntax **18/18**, HTTP HTML/TXT **48/48**, junk **0**, non-Library generated **85/85 byte-identical v1.41**. Final clean-extract strict gate выполняется перед handoff.

## Historical release — v1.41

Дата: 2026-10-05. Версия проекта: **1.41**.
Этап: **M5.10.4 — Молитвы, богослужебные и гимнографические тексты**.

## Baseline

Проверенный `Pravoslavnii-mir_v1.40.zip`: size **19 008 104 bytes**, SHA256 **e4590351d8dc762ac605627ab006cb5a089ce6dad8fa1fb57680718cbe0afa32**. Чистая распаковка и strict gate выполнены до изменений: **0 errors / 0 warnings / runtime OK**. GitHub и старые ZIP не использовались.

## v1.41 changes

- +4 textual works, +4 editions, +4 local text assets, +4 `full_text_of`; author count и `author_attribution` остаются прежними, поскольку новые тексты традиционные/анонимные.
- New works: «Отче наш» (`prayer`), «Царю Небесный» и «Достойно есть» (`hymnography`), Никео-Цареградский Символ веры (`liturgy`). Символ веры не классифицируется как молитва.
- Canonical Library totals: **9 authors / 36 works / 35 editions / 48 Scripture refs / 21 text / 2 media / 101 relations**; local text = **9**, rights-cleared text = **19**, external-link-only unresolved editions = **2**.
- Exact electronic transcriptions use pinned Wikisource revisions under CC BY-SA 4.0; historical work/edition status, electronic transcription license and classification evidence are stored separately.
- Anonymous/traditional authorship is represented explicitly as absent (`null`) instead of creating a synthetic author. Stable IDs of existing Library entities are preserved by unchanged source keys.
- Runtime short-text regression fixed: local reader validation depends on canonical bytes/size/SHA256/license, not arbitrary text length. Five v1.40 long local texts retain an explicit regression check.
- No new feast/saint/place/organisation canonical relations; no inference from names or liturgical mentions. Existing Scripture/life/media topology is preserved. Audio/video unchanged.
- Added files: 4 frozen text-source JSON + 4 generated local TXT. No new runner/test suite and no media binaries.

## v1.41 verification

Baseline strict gate passed before edits. In the single canonical `run_m2.py`, all 13 build stages completed and embedded project integrity printed **0 errors / 0 warnings**; the external execution wrapper timed out before `runtime smoke` started, so the rebuild was not repeated. The first not-started stage was resumed separately: project **0/0**, runtime **OK**. Pre/post deterministic generated payloads **80/80 identical**; baseline inventory **355/355 preserved**, +8 new files, no deletions, no Python bytecode. Final clean-extract strict gate remains mandatory after packaging. Exact outer ZIP size/SHA256 is reported outside the archive to avoid self-reference.

## v1.39 changes

### M5.10.2 Hagiography / Lives

- existing Library contracts reused; no parallel domain and no new runner;
- rights-cleared source now has **10 author text records + 5 life records + unchanged 2 media records**;
- generated Library totals: **4 sources / 7 rights / 9 authors / 30 works / 29 editions / 48 Scripture refs / 15 text / 2 media / 93 relations / 0 review / 0 rejected**;
- **5 life works** produce **6 explicit `life_of` relations** to exact existing saint stable IDs; Cyril and Methodius share one explicitly two-subject life record;
- source evidence covers Seraphim of Sarov, Nicholas the Wonderworker, Tatiana, Cyril, Methodius and Vladimir; Anna of Kashin is intentionally not canonicalized in this patch;
- `PravmirLibrary 1.39.0`: saint→life lookup + related saint refs in work bundle;
- Calendar day and Library item UI expose the traversal without reading raw/source files directly;
- `PravmirKnowledge 1.39.0`: `getSaintBundle()` composes Liturgical + Library APIs and provenance;
- no `life→place` canonical relation is created without explicit place evidence; name/dedication matching remains prohibited;
- audio/video unchanged, remote text bytes not copied, local assets=0, inferred relations=0, organisation entities=0.

Next after successful v1.39 gate: **v1.40 / M5.10.3 — Святоотеческая и богословская текстовая библиотека**. M6.1 remains completed; M6.2 remains paused.

## v1.39 verification

Pre-rebuild: project **0/0**, runtime **OK**, JS **39/39**, deterministic snapshot **80 JSON**, non-Library vs v1.38 **67/67 byte-identical**. Один canonical `run_m2.py` завершён: `DONE total=28.91s`, `RUN_M2_STATUS=0`, embedded **0/0 + runtime OK**. Post-rebuild deterministic payloads **80/80 identical**, non-Library **67/67 identical**, inventory **343→343**, missing=0, added=0. Final checksum + strict verify-only + clean-extract gate remain mandatory before handoff.

## v1.38 changes

### M5.10.1 Text Library Expansion — Authors & Works

- no new domain or runner: existing `PravmirLibrary` / `tools/build_library.py` / schemas are reused;
- `rights_cleared_assets_2026-10-05.json` expands from 1 to **10 text records**, all external-only with rights evidence; media remains exactly **2**;
- Library totals after source-driven build: **4 sources / 7 rights / 9 authors / 25 works / 24 editions / 48 Scripture refs / 10 text / 2 media / 82 relations / 0 review / 0 rejected**;
- new source-verified textual authors: St Philaret of Moscow and St Ignatius Brianchaninov; St Theophan is reused via the existing stable author record;
- added textual coverage: theology **6 works total**, catechesis **2**, sermon **2**; 14 Scripture works and 1 hymnographic work remain intact;
- exact relation topology: author_attribution **22**, scripture_citation_of **48**, full_text_of **10**, recording_of **1**, depicts_feast **1**;
- remote text bytes are not copied into the release; local text/media assets remain **0**; unlicensed/protected/inferred/org facts remain **0**;
- `PravmirLibrary` version becomes **1.38.0**; Library page exposes textual work type and updated trust counts;
- audio/video data are intentionally unchanged by user direction.

Next after successful v1.38 gate: **v1.39 / M5.10.2 — Жития**. M6.1 remains completed; M6.2 is paused until the text-library expansion sequence is closed.

## v1.38 verification

Pre-rebuild: project **0/0**, runtime **OK**, JS **41/41**, deterministic snapshot **80 JSON**. Один полный `run_m2.py` завершён: `DONE total=27.84s`, `RUN_M2_STATUS=0`, embedded **0/0 + runtime OK**. Determinism: **80/80 pre/post**; against v1.37 all **67/67 non-Library generated JSON** byte-identical, exactly 13 Library payloads changed. Inventory **343→343**, missing=0, added=0, junk=0. Post-rebuild project/runtime **0/0 + OK**; HTTP **39/39 → 200**; My PM schema OK. Final checksum + strict verify-only + clean-extract gate remain mandatory before handoff.

## v1.37 changes

### M6.1 User & My PM Core

- `js/my-pm-layer.js` / `PravmirMyPm 1.37.0`;
- `schemas/my_pm_state.schema.json`: schema v1 + explicit device-local/local-only adapter contract;
- typed personal refs: favorites/place, read-later/content, saved-routes/route; canonical metadata is resolved from owning domain APIs, not copied into user state;
- legacy profile/collection keys preserved and re-imported idempotently; rows without stable IDs isolated as unresolved legacy data instead of title matching;
- profile/article/journal/place/route canonical surfaces consume `PravmirMyPm`;
- no new canonical/generated facts, no fake backend/auth/sync claims, no organisation entities/relations.

Next after successful v1.37 gate: **M6.2 — Backend / Accounts / Authentication / Profile Sync**.

## v1.37 verification

Pre-rebuild: project **0/0**, runtime **OK**, 98 deterministic generated JSON snapshot. Один полный `run_m2.py` завершён: `DONE total=27.76s`, `RUN_M2_STATUS=0`, embedded **0/0 + runtime OK**. Determinism: **98/98 pre/post** и **98/98 v1.36→v1.37** byte-identical, generated add/remove=0. Inventory **341→343**, missing=0, added only My PM layer + schema, compiled junk=0. JSON Schema: **OK**; JS syntax **39/39 OK**; HTTP surfaces **39/39 → 200**. Final checksum + clean-extract gate остаются обязательными перед выдачей.

## v1.36 changes

### M5.9 Content / Knowledge Integration Gate

- new `js/knowledge-layer.js` / `PravmirKnowledge 1.36.0`, consumer-only, no raw/generated direct fetch and no new fact domain;
- place/feast/route/reading bundles compose existing Data/Content/Liturgical/Events/Food/Pilgrim/News/Library APIs;
- provenance visibility is preserved by aggregating source records from resolved domain results;
- `PravmirToday 1.36.0` adds stable-ID Reading→Library bridges and homepage surfaces Library work titles beside readings;
- `PravmirLibrary 1.36.0` exposes stable work/author ID lookup needed by cross-domain traversal;
- final runtime gate checks concrete existing paths without inferring new links: Lavra→News/Pilgrim, Baptism feast→Library media, Reading→Scripture work, Daily→Library;
- no new canonical data records or generated payloads are intended in this release.

Next after successful gate: **M6 — Backend / Users / My PM**.

## v1.36 verification

Pre-rebuild: `check_project.py` → **0 errors / 0 warnings**, `check_runtime.js` → **OK**. Один полный M2→M5.9 rebuild завершён без timeout: `DONE total=27.71s`, `RUN_M2_STATUS=0`, embedded **0/0 + runtime OK**.

Determinism/regression: complete set **98/98 deterministic generated JSON** byte-identical финальному v1.35; saved pre-rebuild root snapshot **80/80** unchanged; generated add/remove = 0. Inventory: **340→341**, missing baseline files = 0, added only `js/knowledge-layer.js`. JS syntax **38/38 OK**, HTTP surfaces **39/39 → 200**, compiled junk 0. Никаких новых canonical/inferred/organisation facts не создано.

Final v1.36 clean-extract gate completed successfully; M5 CLOSED. Current M6 baseline passport is recorded at the top of this manifest.

## v1.35 changes

### M5.8.4 Library Domain Gate

- новых canonical facts не добавляется; M5.8.3 data counts и stable IDs сохраняются;
- structural gate проверяет canonical paths, source provider isolation, HTTPS provenance/evidence, relation endpoint closure и rights/storage boundary;
- runtime gate проверяет counts, licensing, stable-ID Scripture bridge, rights-cleared bundles, exact topology и reverse feast relation;
- `PravmirLibrary 1.35.0` exposes reverse typed-relation lookup; Library page surfaces computed trust summary;
- no new runner/test directories: проверки расширяют существующие `check_project.py` и `check_runtime.js`.

Next after successful gate: **M5.9 — Content/Knowledge Integration Gate**.

## v1.35 verification

Pre-rebuild project/runtime: **0/0 + OK**. Один полный M2→M5.8.4 rebuild завершён (`DONE total=27.15s`, `RUN_M2_STATUS=0`, embedded 0/0 + runtime OK). **80/80 deterministic generated JSON** byte-identical pre/post и относительно v1.34; никаких новых/удалённых generated payloads. M5.8 data facts неизменны. Final checksum + clean-extract verify-only выполняются после упаковки полного ZIP.

## v1.34 changes

### M5.8.3 Rights-cleared Text / Audio / Video & Relations

- frozen source `rights_cleared_assets_2026-10-05.json` + closed schema/snapshot coverage;
- 1 public-domain external text asset (Феофан Затворник), без локального копирования текста;
- 1 CC0 external audio asset и 1 CC BY-SA 4.0 external video asset с creator/source hash/size/license evidence;
- Library totals: 4 sources / 7 rights / 7 authors / 16 works / 15 editions / 48 Scripture refs / 1 text / 2 media / 64 relations / 0 review / 0 rejected;
- новые typed relations: `work→author`, `text_asset→work`, `media_asset→work`, `media_asset→feast`; feast relation использует существующий stable ID, не title matching;
- existing M5.8.2 Scripture records остаются metadata-only; 0 inferred/org facts, 0 unlicensed local assets, 0 copied protected content;
- `PravmirLibrary 1.34.0` и Library UI умеют фильтровать/показывать rights-cleared assets и license/evidence links.

Next: **M5.8.4 — Library Domain Gate**.

## v1.34 verification

Pre-rebuild `check_project.py` → **0 errors / 0 warnings**, runtime → **OK**. Один полный rebuild M2→M5.8.3 завершён (`DONE total=28.45s`, internal `RUN_M2_STATUS=0`, embedded 0/0 + runtime OK); terminal cleanup message появился уже после завершения и rebuild не повторялся. Regression: **67/67** non-Library deterministic generated JSON byte-identical v1.33, missing baseline files = 0, new files = 2. Единственный найденный post-compare drift — wording summary у 14 Scripture works — исправлен в Library builder без изменения IDs/provenance/relations; M5.8.2 records после repair совпадают с v1.33. Final clean-extract gate остаётся обязательным после упаковки ZIP.

## v1.33 changes

### M5.8.2 Verified Bibliography & Scripture References
- 6 source-verified bibliographic authors;
- 14 Scripture works + 14 metadata-only editions;
- 48 stable Scripture-reference bridges + 60 explicit relations;
- no inferred relations, organisation facts, copied Scripture text or unlicensed local assets.

### v1.33 verification
Один rebuild M2→M5.8.2: 0/0 + runtime OK; 67/67 non-Library generated JSON byte-identical; clean-extract 335/335 checksum entries OK + strict verify-only 0/0/runtime OK.

## v1.32 changes

### M5.8.1 Library & Media Core
- new `data/library_sources`, frozen source snapshot and `tools/build_library.py`;
- schemas for work/author/edition/text/media/relation/review plus system rights policy;
- generated Library boundary + `PravmirLibrary 1.32.0`;
- seven rights-ingestion policies; no local protected bytes without per-asset evidence;
- canonical domain starts intentionally empty: 0 works/authors/editions/text/media/relations/review/rejected;
- `library.html` + reserved work detail surface, secondary navigation;
- no full protected text/audio/video/image copied; inferred relations and organisation entities remain 0.

Next: M5.8.2 Verified Bibliography & Scripture References.

## v1.32 verification

- exactly one canonical `tools/run_m2.py` completed every M2→M5.8.1 builder, project integrity **0 errors / 0 warnings**, runtime smoke **OK**, `DONE total=27.02s`, `RUN_M2_STATUS=0`; a later shell/terminal cleanup emitted `TERM environment variable not set` and wrapper status 1 only after completion, so the rebuild was not repeated;
- Library output: **1 system source / 7 rights policies / 0 authors / 0 works / 0 editions / 0 text assets / 0 media assets / 0 relations / 0 review / 0 rejected**; 0 protected full-content copies, 0 unlicensed local assets, 0 inferred relations, 0 organisation entities;
- generated regression: all **67/67** prior non-transient generated JSON are byte-identical v1.31; only excluded `import_report.json` and `dedupe_report.json` changed; exactly 12 Library generated payloads were added;
- inventory: **303 → 334 files**, missing baseline files = 0, added = 31, Python bytecode junk = 0;
- post-rebuild checker/runtime: **0/0 + OK**; JS syntax **37/37 OK**; HTTP smoke **39/39 current non-legacy HTML surfaces → 200**;
- this release record is frozen before packaging; checksum-manifest verification and a strict clean-extract `run_m2.py --verify-only` remain mandatory handoff gates and are not replaced by another rebuild.

## v1.31 changes

### M5.7.4 News Domain Gate
- canonical News facts unchanged: **2 sources / 4 canonical news / 1 explicit relation / 5 legacy review / 0 rejected**;
- fixed missing Daily Layer and place reverse-news integrations from supplied v1.30;
- `PravmirNews 1.31.0`: deterministic same-day/latest-before selection plus computed trust summary;
- `PravmirToday 1.31.0`: canonical News only, never future/legacy fallback;
- project gate now proves News schema/stable-ID/deep-link/temporal/freshness/provenance/snapshot/legacy-isolation/evidence/topology invariants;
- runtime gate validates reverse relation, Daily selection and trust summary; no standalone tests/checkers were added.

After successful verification M5.7 is CLOSED. Next: M5.8 Orthodox Library & Media.

## v1.31 verification

- выполнен ровно один полный `tools/run_m2.py`; все M2→M5.7 builders, project integrity и runtime smoke завершились успешно за `24.94s`;
- post-build: `check_project.py` → **0 errors / 0 warnings**; `check_runtime.js` → **OK**;
- **66 deterministic generated JSON** byte-identical supplied v1.30; changed generated payload outside transient diagnostics: only `news_report.json` (corrected gate notes);
- file inventory: **303 baseline files / 303 v1.31 files / 0 missing / 0 added**;
- JS syntax **34/34 OK**; HTTP smoke **18/18 → 200**; no `__pycache__`/`.pyc`;
- final checksum manifest and clean-extract verify-only gate are performed after release metadata is frozen and before ZIP handoff.

## v1.30 changes

### M5.7.3 Relations & Daily Integration
- canonical News now has 4 source-verified records and exactly 1 explicit source-verified `about_place` relation to the stable Lavra place ID;
- `PravmirNews 1.30.0` reverse relation lookup feeds place surfaces;
- canonical place page shows News only through explicit relation;
- `PravmirToday 1.30.0` composes canonical news with same-day/latest fallback and excludes legacy review;
- News relations are evidence-driven; no inferred relations or organisation entities are created.

Next: M5.7.4 Domain Gate.

## v1.30 verification

- baseline v1.29 exact size/SHA verified; initial verify-only → 0/0 + runtime OK;
- one rebuild executed; external timeout occurred after M5.6 and before News, so only the not-yet-run `build_news.py` was executed separately;
- post-build `check_project.py`: 0 errors / 0 warnings; `check_runtime.js`: OK;
- every deterministic generated output outside News is byte-identical v1.29; exactly 7 News payloads changed, none added/removed;
- News counts: 2 sources / 4 canonical / 1 explicit relation / 5 review / 0 rejected; inferred/org facts = 0.


## v1.29 changes

### M5.7.2 Source Verification & Temporal Ingestion
- new frozen source `verified_records_2026-10-05.json` with 3 manually verified official Patriarchia.ru records;
- canonical ingestion: 3 stable `pm-news-*` records, exact Moscow publication timestamps, source URLs and freshness observation/verification timestamp;
- canonical detail deep links via `news/item.html?slug=...`;
- legacy review remains 5/5 and is not merged with the canonical feed;
- no canonical News relations are created yet; inferred relation count remains zero.

Next: M5.7.3 Relations & Daily Integration.

## v1.29 verification

- baseline v1.28 exact size/SHA verified; initial verify-only → 0/0 + runtime OK;
- single rebuild executed; external command timeout occurred exactly at `START M5 news` after M2–M5.6 completed, so prior steps were not rerun; `build_news.py` completed separately as the missing step;
- post-build `check_project.py`: 0 errors / 0 warnings; `check_runtime.js`: OK;
- all deterministic generated outputs outside News are byte-identical v1.28; exactly 7 News payloads changed, none added/removed;
- News counts: 2 sources / 3 canonical / 0 relations / 5 review / 0 rejected.


## v1.28 changes

### M5.7.1 News Core
- `data/news_sources/source_manifest.json` + frozen `news_source_snapshot.json`; current provider is legacy/review-only and cannot publish canonical news;
- canonical schemas for future news records/relations plus `news_review_item.schema.json`;
- `tools/build_news.py` preserves the 5 historical Journal news rows as review input and bridges them to the exact existing legacy Content Core refs using source provenance;
- generated News layer: `news_sources`, `news_records`, `news_relations`, `news_review_queue`, `news_rejected`, `news_index`, `news_report`;
- counts: **1 / 0 / 0 / 5 / 0** (source / canonical news / relations / review / rejected); inferred relations and organisation entities: 0;
- `PravmirNews 1.28.0`, `news.html`, navigation/discovery integration and legacy Journal handoff;
- no legacy row is presented as current/verified news.

M5.7 is ACTIVE. Next: M5.7.2 Source Verification & Temporal Ingestion.

## v1.28 verification

- baseline v1.27 size/SHA сверены до чистой распаковки; initial `run_m2.py --verify-only` → 0/0 + runtime OK;
- выполнен один полный rebuild: все build steps M2–M5.7.1 завершились успешно; оболочка достигла timeout уже на финальном integrity step, поэтому rebuild **не повторялся**;
- после rebuild отдельно выполнены `check_project.py` → 0 errors / 0 warnings и `check_runtime.js` → OK;
- **60/60** deterministic generated outputs из v1.27 byte-identical; добавлены только 7 News payloads, старые generated files не удалялись;
- все **282/282** baseline-файла v1.27 сохранены; добавлено 18 M5.7/UI/docs files;
- News counts: 1 source / 0 canonical / 0 relations / 5 review / 0 rejected; auto-inference = 0.


## v1.27 changes

### M5.6.4 Domain Gate
- `PravmirPilgrim 1.27.0` exposes a computed trust summary derived only from existing generated payloads; no new canonical/source facts are added;
- infrastructure UI surfaces verified/pending/conflict/topology counts as a trust summary;
- project gate now validates unique canonical paths/slugs, HTTPS evidence, complete freshness, source snapshot consistency and exact relation topology;
- runtime gate validates canonical-vs-review isolation, no direct route relation, no organisation relation, deep links and trust-summary counts;
- existing v1.26 search/filter/place/route integrations remain required;
- M5.6 canonical facts remain 12 types / 2 amenities / 2 services / 4 explicit place relations / 85 review / 1 unresolved conflict / 0 rejected.

After successful release verification, M5.6 is CLOSED. Next: M5.7 News.

## v1.27 verification

- baseline v1.26 size/SHA сверены до чистой распаковки; initial `run_m2.py --verify-only` → 0/0 + runtime OK;
- выполнен ровно один полный `tools/run_m2.py`; все M2–M5.6 build steps OK;
- `check_project.py`: 0 errors / 0 warnings; `check_runtime.js`: OK;
- **60/60** deterministic generated outputs byte-identical v1.26; generated files не добавлялись и не удалялись;
- все **282/282** файла v1.26 сохранены; новых/удалённых файлов нет;
- canonical M5.6 counts неизменны: 12 / 2 / 2 / 4 / 85 / 1 / 0.


## v1.26 changes

### M5.6.3 Discovery / Route Integration
- `PravmirPilgrim 1.26.0`: canonical q/type/status filters while all runtime reads stay on generated payloads;
- `pilgrim/infrastructure.html`: verified discovery controls, URL query state, freshness messaging, separate legacy review controls;
- unified search includes canonical M5.6 records and direct deep links;
- route page composes infrastructure from canonical stop places via existing explicit place relations; no new route relation is persisted;
- canonical M5.6 counts remain 12 types / 2 amenities / 2 services / 4 relations / 85 review / 1 conflict / 0 rejected.

M5.6 remains ACTIVE. Next: M5.6.4 Domain Gate.

## v1.26 verification

- baseline v1.25 size/SHA сверены до чистой распаковки; initial `run_m2.py --verify-only` → 0/0 + runtime OK;
- выполнен ровно один полный `tools/run_m2.py`; M2–M5.6.3 build steps OK;
- M5.6 facts после rebuild неизменны: 12 types / 2 amenities / 2 services / 4 relations / 85 review / 2 promoted / 1 unresolved conflict / 0 rejected;
- `check_project.py`: 0 errors / 0 warnings; `check_runtime.js`: OK;
- **60/60** deterministic generated outputs byte-identical v1.25; generated files не добавлялись и не удалялись;
- все **282/282** файла v1.25 сохранены; новых/удалённых файлов нет;
- JS syntax: 33/33; HTTP smoke: 19/19 product surfaces → 200;
- отдельные milestone tests/checkers/runners не добавлялись.


## v1.25 changes

### M5.6.2 Evidence / Verification / Binding
- новый frozen source bundle: `data/pilgrim_sources/verified_records_2026-10-04.json`;
- generated counts: **12 amenity types / 2 canonical amenities / 2 canonical services / 4 relations / 85 review / 1 unresolved conflict / 0 rejected**;
- legacy review split: **2 promoted with explicit official evidence / 83 needs_evidence**;
- canonical targets: Троице-Сергиева лавра и Николо-Берлюковская пустынь — только по явно указанным stable place IDs;
- unresolved conflict «Вознесенская гостиница: дом 1 vs дом 3» сохранён отдельно и не публикуется как canonical amenity;
- `PravmirPilgrim 1.25.0`, verified cards/detail pages и place → pilgrim reverse surface;
- organisation entities/relations: 0; inferred place/route/organisation links: 0.

M5.6 остаётся ACTIVE. Следующий подпункт — M5.6.3 Discovery / Route Integration.

## v1.25 verification

- baseline v1.24 size/SHA сверены до чистой распаковки; initial `run_m2.py --verify-only` → 0/0 + runtime OK;
- выполнен ровно один полный `tools/run_m2.py`; M2–M5.6.2 build steps OK;
- M5.6.2 result: 12 types / 2 amenities / 2 services / 4 relations / 85 review / 2 promoted / 1 unresolved conflict / 0 rejected;
- `check_project.py`: 0 errors / 0 warnings; `check_runtime.js`: OK;
- **51/51** common deterministic generated outputs вне M5.6 byte-identical v1.24; M5.6 изменил только свой generated domain;
- все **280** файлов v1.24 сохранены; добавлены ровно 2 новых source/generated files; ничего не удалено;
- JS syntax: 33/33; HTTP smoke: 19/19 product surfaces → 200;
- отдельные milestone tests/checkers/runners не добавлялись.


## v1.24 changes

### Pilgrim Infrastructure Core
- добавлены `data/pilgrim_sources/source_manifest.json` и system taxonomy `amenity_types.json`; snapshot фиксирует taxonomy/manifest и исходный `data/pilgrim-centers.json`;
- generated domain: `amenity_types.json`, `amenity_records.json`, `pilgrim_service_records.json`, `pilgrim_relations.json`, `pilgrim_review_queue.json`, `pilgrim_rejected.json`, `pilgrim_index.json`, `pilgrim_report.json`;
- counts M5.6.1: **12 amenity types / 0 canonical amenities / 0 canonical services / 0 relations / 85 review / 0 rejected**;
- legacy rows сохраняют прежние `pm-pilgrim-*` compatibility IDs, но получают отдельные `pm-pilgrim-review-*` IDs; candidate refs и evidence пусты до реальной проверки;
- canonical amenity/service schema запрещает `legacy_unverified` как canonical verification status и требует full freshness contract;
- relation schema готов к place/route/organisation, но current checker запрещает organisation binding до M7; text matching не используется;
- `PravmirPilgrim` работает только через generated payloads; `pilgrim/infrastructure.html` визуально разделяет verified layer и legacy review;
- прежний `routes/routes.html?tab=services` сохранён как legacy catalog, но теперь читает review queue через `PravmirPilgrim`; он также ведёт в новый authoritative infrastructure surface.

### M5.6 status
M5.6 начат, но не завершён. v1.24 — только trust-safe core. Первые canonical infrastructure facts разрешены в M5.6.2 исключительно после evidence/verification.

## v1.24 verification

- baseline v1.23 size/SHA сверены до распаковки; initial `run_m2.py --verify-only` → 0/0 + runtime OK;
- выполнен ровно один полный `tools/run_m2.py`; M2–M5.6.1 build steps OK;
- rebuild result M5.6.1: 12 amenity types / 0 canonical amenities / 0 canonical services / 0 relations / 85 review / 0 rejected;
- `check_project.py`: 0 errors / 0 warnings; `check_runtime.js`: OK;
- **69/69** deterministic generated outputs, существовавших в v1.23, byte-identical; новые generated outputs принадлежат только M5.6;
- все **256** файлов v1.23 сохранены, добавлено 24 новых M5.6 files; ничего не удалено;
- отдельные milestone tests/checkers/runners не добавлялись: M5.6 встроен в существующие `run_m2.py`, `check_project.py`, `check_runtime.js`;
- JS syntax: 33/33 OK; HTTP smoke: 19/19 product surfaces → 200; final checksum coverage и clean-extract verification выполняются перед выдачей ZIP.

## v1.23 changes

### Today / Daily orchestration
- добавлен `js/today-layer.js` / `PravmirToday 1.23.0`; layer не имеет собственного source/generated dataset и не fetch'ит JSON напрямую;
- snapshot дня композирует `PravmirLiturgical`, `PravmirContent`, `PravmirEvents`, `PravmirFood`;
- explicit feast/saint/commemoration → content relations имеют приоритет; latest journal fallback маркируется как несвязанный с календарным днём;
- food отображается только из existing date→fasting/feast→recipe `editorial_guidance` relations;
- canonical event layer — единственный источник Today events, поэтому 4 demo/review records не показываются;
- при отсутствии reading на выбранную дату Today не выводит inferred citation и может показать ближайшую дату текущего explicit editorial coverage.

### Homepage UX
- после hero добавлен responsive Daily grid: церковный день / чтения / трапеза / журнал / события;
- homepage подключает `event-layer.js`, `food-layer.js`, `today-layer.js` вместе с уже существующими content/liturgical layers;
- loading/error/empty states и trust note различают legacy calendar, editorial readings/food, explicit content relations и canonical events;
- raw/source/generated files UI напрямую не читает.

### Contract policy
- canonical schemas, source snapshots, stable IDs и generated domain records не меняются;
- новый слой является consumer/orchestrator, а не новым fact domain;
- Data & Existing Domains Expansion считается завершённой после v1.23; M5.6 внутри этого релиза не начат.

## v1.23 verification

- baseline v1.22 size/SHA сверены до распаковки;
- выполнен ровно один полный `tools/run_m2.py`: все build steps OK;
- rebuild result сохранён: 12 963 imported / 12 957 canonical places / 7 graph entities / 7 graph relations / 2 routes / 21 content items / 11 content links / 365 calendar days / 48 readings / 215 liturgical relations / 9 recipes / 0 canonical events;
- `check_project.py`: 0 errors / 0 warnings;
- `check_runtime.js`: OK, включая `PravmirToday` composition/fallback/review-queue boundaries;
- **69/69 deterministic generated outputs byte-identical v1.22**; canonical/generated facts не изменились;
- все 255 файлов v1.22 сохранены; добавлен ровно один file `js/today-layer.js`;
- новых milestone tests/checkers/runners не добавлено;
- `node --check`: 30/30 JavaScript files OK;
- HTTP smoke: 17/17 ключевых product surfaces → 200;
- `__pycache__` / `.pyc`: 0;
- render/Lighthouse/real-device QA не заявляется: ненадёжный Chromium headless test не используется как release evidence.

## v1.22 changes

### Editorial bibliographic reading source
- добавлен `data/liturgical_sources/readings_2026_editorial.json`: 48 explicit reading references для 13 дат existing feast calendar coverage;
- источник хранит только service/citation/lection metadata и exact provenance URL; Scripture text не копируется, `text_ref` у всех records равен `null`;
- `data/liturgical_sources/source_manifest.json` теперь описывает второй provider `azbyka-calendar-2026-editorial` с trust layer `editorial`, `verification_status: editorial_verified`, explicit temporal scope и `jurisdiction: unspecified`;
- `data/schema/liturgical_source_snapshot.json` фиксирует новый source + manifest hashes; silent drift остаётся fatal;
- даты 2026-11-04 и 2026-12-04 намеренно остаются без reading records, потому что source page не дал явного библиографического списка.

### Generated/domain changes
- `tools/build_liturgical.py` создаёт stable `pm-reading-*` только из explicit source rows;
- readings: **0 → 48**; liturgical relations: **167 → 215** через 48 explicit `has_reading` day relations;
- старые feast/saint/commemoration/fasting families и legacy aliases сохраняются;
- `PravmirLiturgical 1.22.0` сохраняет прежний API и отдаёт reading records через существующие `getDayBundle/getRecords/getById`;
- calendar day UI отделяет чтения от других записей; source details показывают provenance link; calendar overview показывает compact reading counts.

### Trust / licensing policy
- библиографическая ссылка на место Писания не считается копированием текста; никакого Scripture body в generated payloads нет;
- новый provider не объявляется official jurisdiction source; `editorial_verified` означает проверку редакционного источника, а не повышение статуса legacy calendar facts;
- отсутствующие чтения не выводятся по названию праздника, text matching или аналогии;
- M5.6 не начат.

## v1.22 verification

- baseline v1.21 size/SHA сверены до распаковки;
- выполнен ровно один полный `tools/run_m2.py`: все build steps OK;
- rebuild result: 12 963 imported / 12 957 canonical places / 7 graph entities / 7 graph relations / 2 routes / 21 content items / 11 content links / 365 calendar days / 48 readings / 215 liturgical relations / 9 recipes / 0 canonical events;
- `check_project.py`: 0 errors / 0 warnings;
- `check_runtime.js`: OK;
- из 69 deterministic generated outputs **59** остались byte-identical v1.21; изменились ровно 10 liturgical payloads;
- все 167 старых liturgical relation records идентичны v1.21; добавились ровно 48 новых reading relations; feast/saint/commemoration/fasting records не изменились, а 13 calendar-day records получили только explicit reading references;
- все 254 файла v1.21 сохранены; добавлен ровно один source file `data/liturgical_sources/readings_2026_editorial.json`;
- новых milestone tests/checkers/runners не добавлено;
- `node --check`: 29/29 JavaScript files OK;
- HTTP smoke: 17/17 ключевых product surfaces → 200;
- `__pycache__` / `.pyc`: 0;
- browser screenshot/Lighthouse/device QA не заявляется: текущая среда ранее не давала надёжного Chromium render и повторно этот ненадёжный тест не использовался как release evidence.

## v1.21 changes

### Explicit cross-domain content links
- добавлен `data/content_sources/editorial_links.json` — отдельный editorial source с provider/trust/verification metadata и 11 explicit links;
- `tools/build_content.py` валидирует source content IDs и детерминированно создаёт stable `pm-clink-*` IDs;
- generated `content_links.json` содержит 11 relations к существующим place/entity/route/feast IDs; title/text matching не создаёт canonical link;
- provenance каждой связи ведёт к source file / source row / source ID; M4 graph source-verified relations остаются отдельным trust layer;
- `check_project.py` проверяет counts, from/to registries и dangling targets после сборки всех доменов; новых отдельный milestone checkers/runners не создано.

### Connected object/content surfaces
- `PravmirContent 1.21.0` сохраняет M5 API и делегирует liturgical reference resolution в `PravmirLiturgical`;
- canonical place page получает reverse related-content cards только через `PravmirContent.getRelated()`;
- canonical article page разрешает typed place/entity/route/liturgical targets и показывает понятные relation labels;
- holiness entity page показывает материалы, связанные explicit entity relations;
- runtime UI не читает editorial source напрямую и не создаёт связи по совпадению строк.

### Trust / data policy
- readings остаются `0`: схема/runtime готовы, но v1.21 не импортирует Scripture text без подходящего source/licensing/jurisdiction contract;
- canonical place IDs, graph entities/relations, routes, liturgical/event/food facts и 85 `legacy_unverified` pilgrim-service records не изменяются ради link expansion;
- M5.6 не начат.

## v1.21 verification

- baseline v1.20 size/SHA сверены до распаковки;
- выполнен один полный `tools/run_m2.py`: все build steps OK;
- rebuild result: 12 963 imported / 12 957 canonical places / 7 graph entities / 7 graph relations / 2 routes / 21 content items / 11 content links / 365 calendar days / 0 readings / 9 recipes / 0 canonical events;
- `check_project.py`: 0 errors / 0 warnings;
- `check_runtime.js`: OK;
- из 69 deterministic generated outputs **59** остались byte-identical v1.20; изменились только 10 Content Core/compatibility payloads, которые закономерно несут новый Content source snapshot и 11 links;
- новых generated families не появилось, M2/M3/M4/liturgical/event/food canonical outputs вне Content compatibility payloads не изменились;
- все 253 файла v1.20 сохранены; добавлен ровно один source file `data/content_sources/editorial_links.json`;
- новых milestone tests/checkers/runners не добавлено;
- `node --check`: 29/29 JavaScript files OK;
- HTTP smoke: 17/17 ключевых product surfaces → 200;
- `__pycache__` / `.pyc`: 0;
- Chromium screenshot attempt снова не завершился надёжно и не создал screenshot artifacts, поэтому render/Lighthouse/real-device QA не засчитывается как выполненный.

## v1.20 changes

### Performance / runtime loading
- `js/data-layer.js`: search-core (`search_index.json`) и lookup-index (`index.json`) загружаются раздельно; public `PravmirData` API сохранён;
- `js/home.js`: карта запускается только near-viewport / direct map intent / interaction, а не при первом DOMContentLoaded;
- `js/map-runtime.js`: clustering остаётся optional enhancement, routing plugin загружается только по запросу маршрута;
- нижние homepage sections используют browser render deferral через `content-visibility:auto`;
- source/generated contracts не изменены, новый duplicate generated index не создавался.

### Discovery / visual flow
- unified home discovery hub для places / holiness / routes / calendar / journal / food;
- home suggestions объединяют canonical places, routes и Content Core search, имеют debounce/loading/error/keyboard states;
- map-to-list cards синхронизируются с текущим viewport карты; map engine error state получил явный retry;
- catalog получил skeleton/retry/aria-busy и SVG location states;
- map/place discovery surface очищен от ключевых emoji-маркеров в пользу общей SVG-системы.

M5.6 не начат. Canonical schemas, stable IDs, aliases, provenance и deterministic generated domain payloads сохранены.

## v1.20 verification

- baseline size/SHA сверены до распаковки;
- выполнен один полный `tools/run_m2.py`: все build steps OK;
- `check_project.py`: 0 errors / 0 warnings;
- `check_runtime.js`: OK;
- 69 deterministic generated outputs после rebuild побайтово совпадают с v1.19;
- число проектных файлов до упаковки сохранено: 253; новых milestone tests/checkers/runners не добавлено;
- Chromium binary в среде найден, но headless render зависал и не дал надёжный screenshot output; screenshot/Lighthouse/real Android QA поэтому не засчитываются как выполненные.

## v1.19 changes

- `style.css`: общие дизайн-токены, fixed shell, responsive grids, типографика, focus/contrast/touch states, safe-area и CSS hero;
- `js/config.js` / `js/components.js`: пять основных направлений, вторичное меню, SVG icons, hash-aware active states, skip link, keyboard disclosure и image fallbacks;
- текущие product HTML (не snapshotted article sources): одинаковый font query и viewport без ограничения zoom;
- `index.html` / `home-content.js`: новое оформление и быстрые разделы; generated route preview с canonical links и честным legacy status;
- `home.js`: optional motion без скрытия контента при сбое browser capability;
- food catalog/detail: подписанные filters, calendar-guidance subset, user-readable dietary metadata, error/empty/reset/retry states и expandable source details;
- events catalog/detail: честная пустая афиша, даты/статусы на пользовательском языке, registration links и provenance;
- calendar/detail: доступные подписи дат, понятные scope/status notes без повышения trust;
- journal/article/profile/graph UI: понятный copy, read-later без nested interactive controls и ложного успеха, локальный характер профиля;
- существующие `check_project.py` / `check_runtime.js`: минимальные UI contracts включены в текущий gate; дополнительные verification-файлы не добавлены.

Canonical generated output, source snapshots, stable IDs/aliases/provenance и 10 article HTML source bodies сохраняются. Логотип/символика и старые assets не удалены. `hero-bg.jpg` больше не подключается как фон из-за видимого watermark.

Для v1.19 browser screenshots/Lighthouse/real-device QA не выполнялись: в том release environment полноценный render browser был недоступен. Это не production accessibility certification.

## v1.18 changes — preserved

### Reproducible release

- `requirements.txt` фиксирует прямые build dependencies;
- `run_m2.py` выполняет preflight и требует Node.js для runtime gate;
- дочерние Python-процессы запускаются без bytecode, cleanup выполняется и после ошибки;
- final `--verify-only` проверяет checksum manifest;
- `check_project.py` проверяет полноту checksum coverage и current VERSION в project docs.

### Navigation and local actions

- исправлен root path для страниц в `food/`;
- active state работает для landing и вложенных страниц catalog/routes/articles;
- доступные ссылки общей навигации ведут на реальные surfaces, будущие действия имеют честное disabled state;
- read-later карточки профиля открывают сохранённый URL;
- старые read-later записи без URL разрешаются по canonical content metadata через `PravmirContent`;
- настройки локального профиля сохраняются в `pravmirLocalProfile` и не изображают backend account.

### Runtime boundaries

- `index.html` подключает `PravmirLiturgical`, а `home.js` строит ближайшие календарные записи из canonical generated layer;
- `routes/routes.html` подключает `PravmirContent` и получает все 85 записей через `getPilgrimServices()`;
- raw `data/pilgrim-centers.json` остался provenance/build input и больше не fetch'ится product page;
- удалён встроенный fallback-каталог, который мог скрывать ошибку загрузки;
- legacy pilgrim services обозначены как `legacy_unverified`; никаких новых factual связей не создано.

## M5.5 preserved

### Food source/domain

- `data/food_sources/source_manifest.json`;
- `data/food_sources/recipes_editorial.json`;
- `data/schema/food_source_snapshot.json`;
- `food_source_manifest.schema.json`;
- `food_source_bundle.schema.json`;
- `recipe.schema.json`;
- `food_relation.schema.json`;
- `tools/build_food.py`.

Generated:
- `recipe_records.json`;
- `food_relations.json`;
- `food_index.json`;
- `food_report.json`.

Current snapshot:
- recipes: **9** (6 post-friendly + 3 festive editorial recipes);
- food relations: **27**;
- linked fasting rules: **4**;
- linked feasts: **2**;
- canonical liturgical prescriptions created: **0**.

Все связи recipe → fasting_rule и recipe → feast имеют `relation_class: editorial_guidance`. Это кулинарная подборка, а не церковное предписание конкретной меры поста и не canonical liturgical fact.

### Runtime/UI

- `PravmirFood 1.17.0`;
- `food.html`;
- `food/recipe.html`;
- `js/food-layer.js`;
- `js/food.js`;
- `js/food-page.js`;
- `css/food.css`;
- интеграция Calendar → Food по выбранной дате;
- подборки по активному fasting_rule и explicit feast relation;
- интеграция canonical calendar-day → Food.

Runtime читает только generated food payloads. Raw `data/food_sources/*` используется только build pipeline.

## Verification contour

Удалено накопившееся дублирование:
- весь старый `tests/`;
- все milestone `tools/check_m*.py`;
- `check_checksums.py`;
- `check_data_core.py`;
- `check_release_runner.py`;
- `release_contracts.py`;
- `release_pipeline.py`;
- generated `release_pipeline_state.json` / `release_run_report.json`;
- режимы `--cold` / `--deep`.

Остался минимальный контур:
- `tools/run_m2.py` — один последовательный canonical rebuild;
- `tools/check_project.py` — один structural/data/reference/checksum checker;
- `tools/check_runtime.js` — один runtime smoke для основных domain layers.

Одно и то же доказательство больше не размножается по milestone-файлам.

## Roadmap

**M1–M5.5 contracts сохранены. v1.21–v1.23 завершили Data & Existing Domains Expansion; следующий этап — M5.6 Pilgrim Infrastructure.**
