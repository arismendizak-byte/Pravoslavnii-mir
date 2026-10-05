# Recovery audit — историческая справка

Дата исходного recovery: 2026-10-02.

Первичный `Pravoslavnii-mir_M2.2-3.zip` содержал только 12 Data Core файлов и не был полным проектом. Это состояние **больше не является текущим baseline**.

## Что было восстановлено

Полный legacy/frontend baseline и все 17 региональных CSV восстановлены из GitHub commit `166e0ed5967b80c2b36a91efe7a79cfef30e96ed` в read-only режиме. Сверху интегрирован Data Core recovery.

После восстановления `tools/check_project.py` был доведён до `RESULT: OK` без удаления основных страниц/функций.

## Что дополнительно исправлено в v1.0

Production-run выявил архитектурные дефекты recovery: file-scoped stable ID, повторные source identities, region conflicts, unknown types, отсутствие полного rejected-row output, медленный candidate generation dedupe и устаревший checksum manifest.

Все перечисленные проблемы исправлены в версии 1.0 и покрыты regression-тестами.

Этот файл сохраняется только как история происхождения версии 1.0.
