-- Миграция: очистка vessel_name в vessel_dpr
-- Все шаги уже применены. Файл оставлен как документация.

-- ─── Шаг 1 (применён) ────────────────────────────────────────────────────────
-- Удаление типа судна (с пробелом/кавычкой после) и email-артефактов
-- UPDATE vessel_dpr SET vessel_name = trim(regexp_replace(
--   regexp_replace(vessel_name,
--     '^(мвс|ппб|сбс|рвк|б/с|с/б|ас|вс|асптр|мсс|мфасс|пкс|мтб|гс|кп)(\s+|[«"''])\s*', '', 'i'),
--   '\s*<[^>]+@[^>]+>.*$', '', 'i'))
-- WHERE vessel_name ~* '...' OR vessel_name ~* '...';

-- ─── Шаг 2 (применён) ────────────────────────────────────────────────────────
-- Склеенные префиксы без пробела (мфассспасатель → спасатель)
-- UPDATE vessel_dpr
-- SET vessel_name = trim(regexp_replace(vessel_name,
--   '^(мвс|ппб|сбс|рвк|б/с|с/б|ас|вс|асптр|мсс|мфасс|пкс|мтб|гс|кп)', '', 'i'))
-- WHERE vessel_name ~* '^(мвс|ппб|сбс|рвк|б/с|с/б|ас|вс|асптр|мсс|мфасс|пкс|мтб|гс|кп)[^\s]';

-- ─── Шаг 3: Точечные правки + латиница → кириллица ──────────────────────────
-- Запустить в Supabase SQL Editor

-- Латиница → кириллица
UPDATE vessel_dpr SET vessel_name = 'калас'          WHERE vessel_name = 'kalas';
UPDATE vessel_dpr SET vessel_name = 'ростов великий' WHERE vessel_name = 'rostov';
UPDATE vessel_dpr SET vessel_name = 'светломор-3'    WHERE vessel_name = 'svetlomor3';

-- Хвостовой мусор
UPDATE vessel_dpr SET vessel_name = 'капитан беклемишев' WHERE vessel_name LIKE 'капитан беклемишев .%';
UPDATE vessel_dpr SET vessel_name = 'светломор-3'        WHERE vessel_name = 'светломор-3.';

-- НИС Импульс — обрезанный префикс
UPDATE vessel_dpr SET vessel_name = 'импульс'            WHERE vessel_name = 'ис импульс';

-- Проверка: грязных записей не должно остаться
-- SELECT vessel_name FROM vessel_dpr
-- WHERE vessel_name ~* '[a-z]'       -- латиница
--    OR vessel_name LIKE '%.'        -- хвостовая точка
--    OR vessel_name LIKE '% .%';     -- пробел-точка
