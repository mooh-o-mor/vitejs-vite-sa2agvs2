-- Миграция: удаление типа судна из vessel_name в vessel_dpr
-- Запустить в Supabase SQL Editor однократно

-- Шаг 1: Просмотр затронутых записей (dry-run)
SELECT vessel_name,
       regexp_replace(vessel_name,
         '^(мвс|ппб|сбс|рвк|б/с|с/б|ас|вс|асптр|мсс|пкс|мтб|гс|кп)\s+', '', 'i'
       ) AS cleaned_name
FROM vessel_dpr
WHERE vessel_name ~* '^(мвс|ппб|сбс|рвк|б/с|с/б|ас|вс|асптр|мсс|пкс|мтб|гс|кп)\s+';

-- Шаг 2: Собственно UPDATE (раскомментировать после проверки)
-- UPDATE vessel_dpr
-- SET vessel_name = regexp_replace(vessel_name,
--   '^(мвс|ппб|сбс|рвк|б/с|с/б|ас|вс|асптр|мсс|пкс|мтб|гс|кп)\s+', '', 'i')
-- WHERE vessel_name ~* '^(мвс|ппб|сбс|рвк|б/с|с/б|ас|вс|асптр|мсс|пкс|мтб|гс|кп)\s+';
