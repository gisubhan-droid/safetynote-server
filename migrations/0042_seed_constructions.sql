-- ─────────────────────────────────────────────────────────────────────────────
-- 공사 시드 데이터: 기존 작업과 연계된 공사 6건
-- ─────────────────────────────────────────────────────────────────────────────

-- 공사 1: 여주시 창동 강가정비공사 (작업 218, 219 연계 — assigned×2 → registered)
INSERT OR IGNORE INTO constructions
  (request_no, work_number, title, work_order_address,
   manager_id, manager_name, supervisor_name, description,
   status, created_by, created_at)
VALUES
  ('100158298100', 'WKS-260430-01782',
   '여주시 창동 257번지일원 위해개소 해소 강가정비공사(교리6SW14외)',
   '여주시 창동 257',
   13, '장준서', '김재원', '결선도조사 및 강가정비 공사',
   'registered', 1, '2026-05-19 08:00:00');

-- 공사 2: 이천시 대월면 도로확장 이설공사 (작업 220 연계 — tbm_done → in_progress)
INSERT OR IGNORE INTO constructions
  (request_no, work_number, title, work_order_address,
   manager_id, manager_name, supervisor_name, description,
   status, created_by, created_at)
VALUES
  ('100015747129', 'WKS-260410-00099',
   '도로계획도로 확장관련 이설공사(이천간139L22)',
   '경기도 이천시 대월면 대월로 354',
   13, '장준서', '김재원', '도로 확장에 따른 통신선로 이설 공사',
   'in_progress', 1, '2026-05-20 07:00:00');

-- 공사 3: 이천시 부발읍 링크맥스 지장이설 (작업 216, 221 연계 — unassigned+assigned → registered)
INSERT OR IGNORE INTO constructions
  (request_no, work_number, title, work_order_address,
   manager_id, manager_name, supervisor_name, description,
   status, created_by, created_at)
VALUES
  ('100000000001', 'WKS-260420-03124',
   '[2026]링크맥스 진입로 확포장 관련 지장이설',
   '경기도 이천시 부발읍 황무로 1860',
   13, '장준서', '김재원', '링크맥스 진입로 확포장에 따른 지장물 이설 공사',
   'registered', 1, '2026-05-19 09:00:00');

-- 공사 4: 이천 대월 전송장비 설치 (작업 8, 158 연계 — work_completed+assigned → in_progress)
INSERT OR IGNORE INTO constructions
  (request_no, work_number, title, work_order_address,
   manager_id, manager_name, supervisor_name, description,
   status, created_by, created_at)
VALUES
  ('202600923231', 'WKS-260315-00234',
   '이천 대월 전송장비 설치 및 케이블 성단 공사',
   '경기도 이천시 대월면 대월로 354',
   13, '장준서', '김재원', '전송장비 설치 및 케이블 접속·성단 작업',
   'in_progress', 1, '2026-05-16 09:00:00');

-- 공사 5: 여주 가남 맨홀 공사 (작업 29, 179 연계 — tbm_done+assigned → in_progress)
INSERT OR IGNORE INTO constructions
  (request_no, work_number, title, work_order_address,
   manager_id, manager_name, supervisor_name, description,
   status, created_by, created_at)
VALUES
  ('202600926741', 'WKS-260401-00421',
   '여주 가남 맨홀 청소 및 신설 공사',
   '경기도 여주시 가남읍 가남로 72',
   13, '장준서', '김재원', '맨홀 청소 및 신규 맨홀 설치 공사',
   'in_progress', 1, '2026-05-16 09:00:00');

-- 공사 6: 이천-여주 관로·선로 종합공사 (작업 18, 48, 60 연계 — completed×3 → completed)
INSERT OR IGNORE INTO constructions
  (request_no, work_number, title, work_order_address,
   manager_id, manager_name, supervisor_name, description,
   status, created_by, created_at)
VALUES
  ('202600784941', 'WKS-260301-00178',
   '이천-여주 관로 연장 및 선로 이설 종합공사',
   '경기도 이천시 관고동 관고로 30',
   13, '장준서', '김재원', '이천·여주 구간 관로 연장 및 지중화 선로 이설',
   'completed', 1, '2026-05-15 09:00:00');

-- ─────────────────────────────────────────────────────────────────────────────
-- tasks.construction_id + sub_task_number 연결 (위 INSERT 후 실행)
-- ─────────────────────────────────────────────────────────────────────────────

-- 공사 1 (여주 창동 강가정비공사)
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='100158298100'), sub_task_number='0001' WHERE id=218;
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='100158298100'), sub_task_number='0002' WHERE id=219;

-- 공사 2 (이천 대월 도로확장 이설공사)
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='100015747129'), sub_task_number='0001' WHERE id=220;

-- 공사 3 (링크맥스 지장이설)
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='100000000001'), sub_task_number='0001' WHERE id=216;
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='100000000001'), sub_task_number='0002' WHERE id=221;

-- 공사 4 (이천 대월 전송장비+케이블 성단)
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='202600923231'), sub_task_number='0001' WHERE id=158;
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='202600923231'), sub_task_number='0002' WHERE id=8;

-- 공사 5 (여주 가남 맨홀)
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='202600926741'), sub_task_number='0001' WHERE id=29;
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='202600926741'), sub_task_number='0002' WHERE id=179;

-- 공사 6 (이천-여주 관로·선로 종합)
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='202600784941'), sub_task_number='0001' WHERE id=18;
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='202600784941'), sub_task_number='0002' WHERE id=48;
UPDATE tasks SET construction_id=(SELECT id FROM constructions WHERE request_no='202600784941'), sub_task_number='0003' WHERE id=60;
