/**
 * NAS PM2 설정 파일 (문서/참고용)
 *
 * ⚠️ 주의: NAS(Synology) 환경에서 `pm2 start ecosystem.config.cjs` 방식이
 *         응답 없이 hang 되는 현상이 있었음.
 *
 * ✅ [BUG-202 영구해결] 권장 시작 방법 — start-server.sh 래퍼 사용:
 *
 *   pm2 delete safetynote 2>/dev/null || true
 *   PORT=3443 pm2 start /volume1/safetynote/scripts/start-server.sh \
 *     --name safetynote \
 *     --interpreter /bin/bash \
 *     --cwd /volume1/safetynote
 *   pm2 save
 *
 * ✅ start-server.sh 래퍼 장점:
 *   - pm2 restart 시마다 tsx 존재 여부 자동 확인
 *   - tsx 소멸 시 자동 복구 (링크 생성 or npm install tsx) 후 서버 시작
 *   - npm install --ignore-scripts 실행해도 다음 pm2 restart에서 자동 복구
 *   - 503 반복 악순환 영구 차단
 *
 * ⚠️ 구버전 등록 방식 (tsx 직접 지정 — 사용 금지):
 *   PORT=3443 pm2 start /volume1/safetynote/node_modules/.bin/tsx ...
 *   → tsx 소멸 시 pm2 restart 즉시 실패 → 503 → 악순환
 *
 * 이유:
 *   - NAS에 npx 없음 → bash 래퍼 내부에서 tsx 절대경로 직접 처리
 *   - NAS에 NVM 없음 → interpreter /bin/bash 로 hang 방지
 *   - .env 파일이 PORT를 덮어씀 → start-server.sh 내부에서 .env 로드
 *
 * 이 파일은 설정 항목 참고 및 버전관리 목적으로 유지.
 */
module.exports = {
  apps: [
    {
      name: 'safetynote',
      // [BUG-202 영구해결] tsx 직접 지정 → start-server.sh 래퍼로 교체
      // start-server.sh: pm2 restart 시마다 tsx 자동 복구 후 서버 기동
      script: '/volume1/safetynote/scripts/start-server.sh',
      args: '',
      // bash 래퍼 → interpreter /bin/bash (NVM hang 완전 방지)
      interpreter: '/bin/bash',
      interpreter_args: '',
      cwd: '/volume1/safetynote',
      env: {
        NODE_ENV: 'production',
        // PORT: .env 파일이 있으면 .env가 우선 적용됨
        // NAS .env에 PORT=3443 설정 확인: cat /volume1/safetynote/.env | grep PORT
        PORT: 3443
      },
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      error_file: '/var/log/safetynote-error-0.log',
      out_file: '/var/log/safetynote-out-0.log'
    },

    // ─── 비상 복구 서버 (포트 3445) — 항상 상시 동작 ────────────────────────
    // - 메인 서버(3443) 상태와 무관하게 항상 접속 가능
    // - 접속: http://NAS_IP:3445
    // - 비밀번호: .env 파일의 RECOVERY_PASSWORD (기본: recovery1234)
    // - PM2가 crash 시 자동 재시작 (autorestart: true)
    //
    // ✅ NAS 등록 명령 (커맨드라인 직접):
    //   pm2 start /volume1/safetynote/scripts/recovery-server.py \
    //     --name safetynote-recovery \
    //     --interpreter /usr/bin/python3 \
    //     -- /volume1/safetynote 3445
    //   pm2 save
    //
    // ⚠️ python3 경로가 다른 경우:
    //   which python3  → 경로 확인 후 --interpreter 값 변경
    //
    // ⚠️ 이 파일(ecosystem.config.cjs)로 pm2 start 시 NAS에서 hang이 발생할 수 있음.
    //    반드시 위의 커맨드라인 직접 등록 방법을 사용할 것.
    {
      name: 'safetynote-recovery',
      // ✅ 변경: bash 래퍼 → Python3 독립 서버 직접 실행 (NAS hang 문제 해결)
      script: '/volume1/safetynote/scripts/recovery-server.py',
      args: '/volume1/safetynote 3445',
      interpreter: '/usr/bin/python3',
      cwd: '/volume1/safetynote',
      watch: false,
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      // crash 후 3초 대기 후 재시작
      restart_delay: 3000,
      // 연속 crash 무제한 재시작 (0 = 무제한)
      max_restarts: 0,
      error_file: '/var/log/safetynote-recovery-error.log',
      out_file: '/var/log/safetynote-recovery-out.log'
    }
  ]
}
