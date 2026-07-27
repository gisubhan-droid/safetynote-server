-- [FEAT-177] 광케이블 입고관리 테이블 신규 생성
CREATE TABLE IF NOT EXISTS cable_incoming (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  in_date     TEXT NOT NULL,              -- 입고일 (YYYY-MM-DD)
  lot_no      TEXT DEFAULT '',            -- LOT NO.
  spec        TEXT DEFAULT '',            -- 규격 (1C/12C/36C/72C/144C/288C/기타)
  maker       TEXT DEFAULT '',            -- 제조사 (LS/대한/일진/가온/기타)
  mfg_year    TEXT DEFAULT '',            -- 제작년도
  cable_kind  TEXT DEFAULT '',            -- 케이블종류 (가공/일반/지중/난연)
  cable_type  TEXT DEFAULT '',            -- 케이블타입 (예비 컬럼)
  asset_type  TEXT DEFAULT '',            -- 자산구분 (N-1/N-2)
  qty_m       REAL DEFAULT 0,             -- 입고량(M)
  remark      TEXT DEFAULT '',            -- 비고
  created_by  TEXT DEFAULT '',            -- 등록자
  created_at  TEXT DEFAULT (datetime('now','localtime'))  -- 등록일시
);

CREATE INDEX IF NOT EXISTS idx_cable_incoming_in_date ON cable_incoming(in_date);
CREATE INDEX IF NOT EXISTS idx_cable_incoming_spec    ON cable_incoming(spec, maker, cable_kind);
