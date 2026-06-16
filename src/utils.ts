// UTF-8 안전한 토큰 디코딩 유틸리티
export function decodeToken(token: string): any {
  const binary = atob(token)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  const decoder = new TextDecoder()
  return JSON.parse(decoder.decode(bytes))
}

export function getUser(c: any): any {
  const auth = c.req.header('Authorization')
  if (!auth) return null
  try { return decodeToken(auth.replace('Bearer ', '')) } catch { return null }
}

// ─── 저장소 경로 생성 유틸리티 ────────────────────────────────────────────────
//
// 폴더 구조:
//   {uploadRoot}/
//     {공사요청번호}_{공사명}/          ← 공사 단위 루트
//       {서브번호}_{작업일}_{작업종류}/ ← 작업 단위
//         01_작업지시서/
//         02_TBM/
//         03_작업사진/
//         04_현장점검/
//         05_기타/
//
// 공사 미연결(construction_id = null) 작업의 경우:
//   {uploadRoot}/미분류/{작업번호}_{작업일}_{작업종류}/{단계폴더}/

export const STAGE_DIRS = {
  order:      '01_작업지시서',
  tbm:        '02_TBM',
  photo:      '03_작업사진',
  inspection: '04_현장점검',
  other:      '05_기타',
} as const

export type StageKey = keyof typeof STAGE_DIRS

/** photo_type → 작업사진 하위 폴더명 매핑 */
export const PHOTO_TYPE_DIRS: Record<string, string> = {
  before:   '01_작업 전',
  progress: '02_작업 중',
  after:    '03_작업 후',
}

/**
 * caption(설명) 값을 폴더명으로 변환
 * - 비어있으면 null 반환 (하위 폴더 생성 안 함)
 * - 파일시스템 금지 문자 제거, 최대 40자 제한
 */
export function captionToFolderName(caption: string | null | undefined): string | null {
  if (!caption || !caption.trim()) return null
  const cleaned = caption.trim()
    .replace(/[\\/:*?"<>|\r\n\t]/g, '_')  // 금지 문자 → _
    .replace(/\s+/g, ' ')                  // 연속 공백 → 단일 공백
    .slice(0, 40)                           // 최대 40자
    .trimEnd()
  return cleaned || null
}

/** 파일시스템에 사용할 수 없는 문자를 '_'로 치환 */
function safeName(s: string): string {
  return (s || '').replace(/[\\/:*?"<>|\r\n\t]/g, '_').replace(/\s+/g, ' ').trim()
}

/** YYYY-MM-DD 형태로 날짜 반환 (work_date 가 null 이면 오늘) */
function fmtDate(d: string | null | undefined): string {
  if (!d) return new Date().toISOString().slice(0, 10)
  return String(d).slice(0, 10)
}

export interface StoragePathInfo {
  /** 업로드 루트 (절대 or 상대) */
  uploadRoot: string
  /** 공사 폴더명 e.g. "REQ-2024-001_한전지중화공사" */
  conFolder:  string
  /** 작업 폴더명 e.g. "T-2024-0001_2024-07-01_청약개통" */
  taskFolder: string
  /** 단계 폴더명 e.g. "01_작업지시서" */
  stageDir:   string
  /** 최종 업로드 경로 (conFolder / taskFolder / stageDir[/ photoSubDir]) */
  uploadDir:  string
}

/**
 * 저장 경로를 조합해 반환.
 * @param opts.uploadRoot   시스템 설정 upload_root_path (default: './public/uploads')
 * @param opts.conRequestNo 공사 요청번호  (construction.request_no)
 * @param opts.conTitle     공사명         (construction.title)
 * @param opts.taskNumber   작업 번호      (task.task_number or sub_task_number)
 * @param opts.workDate     작업 예정일    (task.work_date or planned_date)
 * @param opts.workType     작업 종류      (task.construction_type)
 * @param opts.stage        파일 단계      ('order'|'tbm'|'photo'|'inspection'|'other')
 * @param opts.photoType    사진 유형      ('before'|'progress'|'after') — photo 단계일 때 하위 폴더 생성
 * @param opts.caption      사진 설명      — 입력값 있으면 photo_type 폴더 아래 추가 하위 폴더 생성
 */
export function buildStoragePath(opts: {
  uploadRoot?:   string
  conRequestNo?: string | null
  conTitle?:     string | null
  taskNumber?:   string | null
  workDate?:     string | null
  workType?:     string | null
  stage?:        StageKey
  photoType?:    string | null
  caption?:      string | null
}): StoragePathInfo {
  const root      = (opts.uploadRoot || './public/uploads').replace(/\/+$/, '')
  const stage     = opts.stage || 'other'
  const stageDir  = STAGE_DIRS[stage] || STAGE_DIRS.other

  // 공사 폴더: "{request_no}_{공사명}"  / 미연결 시 "미분류"
  const conFolder = (opts.conRequestNo && opts.conTitle)
    ? safeName(`${opts.conRequestNo}_${opts.conTitle}`)
    : '미분류'

  // 작업 폴더: "{task_number}_{YYYY-MM-DD}_{작업종류}"
  const taskNum  = safeName(opts.taskNumber  || 'UNKNOWN')
  const workDate = fmtDate(opts.workDate)
  const workType = safeName(opts.workType    || '작업')
  const taskFolder = `${taskNum}_${workDate}_${workType}`

  // photo 단계일 때 photo_type에 따라 하위 폴더 추가
  // before → 01_작업 전 / progress → 02_작업 중 / after → 03_작업 후
  let uploadDir = `${root}/${conFolder}/${taskFolder}/${stageDir}`
  if (stage === 'photo' && opts.photoType) {
    const subDir = PHOTO_TYPE_DIRS[opts.photoType]
    if (subDir) {
      uploadDir = `${uploadDir}/${subDir}`
      // caption(설명) 있으면 photo_type 폴더 아래 추가 하위 폴더 생성
      const captionFolder = captionToFolderName(opts.caption)
      if (captionFolder) uploadDir = `${uploadDir}/${captionFolder}`
    }
  }

  return { uploadRoot: root, conFolder, taskFolder, stageDir, uploadDir }
}

