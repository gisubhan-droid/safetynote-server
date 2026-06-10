-- 위험성평가 워크플로우 확장
-- status 체계:
--   draft        : 등록 완료, 평가전 위험도 선정 단계
--   in_review    : 평가위원 선정 완료, 감소대책 수립 진행 중
--   measures_done: 감소대책 수립 완료, 최종 위험도 선정 단계
--   completed    : 최종 위험도 확정 / 평가 완료
--   reviewed     : (정기) 검토 완료

-- ① risk_assessments 에 워크플로우 컬럼 추가
ALTER TABLE risk_assessments ADD COLUMN review_date      DATE;
ALTER TABLE risk_assessments ADD COLUMN review_notes     TEXT;
ALTER TABLE risk_assessments ADD COLUMN final_notes      TEXT;
ALTER TABLE risk_assessments ADD COLUMN source_adhoc_ids TEXT;  -- 정기평가: 참조한 수시평가 id 목록 (JSON 배열 문자열)
ALTER TABLE risk_assessments ADD COLUMN meeting_date     DATE;  -- 대책회의 일자
ALTER TABLE risk_assessments ADD COLUMN meeting_place    TEXT;  -- 대책회의 장소

-- ② risk_assessment_details 에 위원별 대책 입력 컬럼 추가
ALTER TABLE risk_assessment_details ADD COLUMN member_measures  TEXT;   -- 위원 입력 감소대책
ALTER TABLE risk_assessment_details ADD COLUMN final_frequency  INTEGER DEFAULT 1;
ALTER TABLE risk_assessment_details ADD COLUMN final_severity   INTEGER DEFAULT 1;
ALTER TABLE risk_assessment_details ADD COLUMN final_risk_level TEXT;
ALTER TABLE risk_assessment_details ADD COLUMN is_final         INTEGER DEFAULT 0; -- 최종확정 여부

-- ③ 위험성평가 참여위원 테이블 (신규)
CREATE TABLE IF NOT EXISTS risk_assessment_members (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  assessment_id INTEGER NOT NULL REFERENCES risk_assessments(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id),
  role          TEXT    DEFAULT 'member',  -- 'chair'(의장/안전관리자) | 'member'(위원)
  assigned_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(assessment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ra_members_assessment ON risk_assessment_members(assessment_id);
CREATE INDEX IF NOT EXISTS idx_ra_members_user       ON risk_assessment_members(user_id);
