/**
 * nas-routes/geocode.ts — GPS 역지오코딩 API (NAS 전용)
 *
 * 포함 라우트:
 *   GET /api/geocode/config          — 카카오 JS API 키 반환
 *   GET /api/geocode/kakaomap-sdk    — 카카오맵 SDK 프록시
 *   GET /api/geocode/reverse         — 역지오코딩 (카카오 우선, Nominatim fallback)
 */

import { Hono } from 'hono'
import { getRawDb, getUser, getSetting } from '../nas-db'

const app = new Hono()

// GET /config — 카카오 JS API 키 반환
app.get('/config', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)
  const jsKey = getSetting('kakao_js_api_key') || ''
  return c.json({ kakao_js_api_key: jsKey })
})

// GET /kakaomap-sdk — 카카오맵 SDK 프록시 (인증 불필요 — script 태그로 로드)
app.get('/kakaomap-sdk', async (c) => {
  const jsKey = getSetting('kakao_js_api_key') || ''
  if (!jsKey) return c.text('JS API 키 미설정', 400)
  try {
    const sdkRes = await fetch(`https://dapi.kakao.com/v2/maps/sdk.js?appkey=${jsKey}&autoload=false`)
    if (!sdkRes.ok) return c.text(`카카오 SDK 응답 오류: ${sdkRes.status}`, 502)
    const sdkText = await sdkRes.text()
    return new Response(sdkText, {
      headers: {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'public, max-age=3600'
      }
    })
  } catch(e: any) {
    return c.text(`SDK 프록시 오류: ${e.message}`, 502)
  }
})

// GET /reverse — 역지오코딩 프록시 (카카오 우선, Nominatim fallback)
app.get('/reverse', async (c) => {
  const user = getUser(c)
  if (!user) return c.json({ error: '인증 필요' }, 401)

  const { lat, lon } = c.req.query()
  if (!lat || !lon) return c.json({ error: 'lat, lon 필요' }, 400)

  const kakaoKey = getSetting('kakao_rest_api_key') || ''

  // ── 카카오 역지오코딩 ─────────────────────────────────────────────────────
  if (kakaoKey) {
    try {
      const kakaoUrl = `https://dapi.kakao.com/v2/local/geo/coord2address.json?x=${lon}&y=${lat}&input_coord=WGS84`
      const kakaoRes = await fetch(kakaoUrl, {
        headers: { Authorization: `KakaoAK ${kakaoKey}` }
      })
      if (kakaoRes.ok) {
        const data: any = await kakaoRes.json()
        const doc = data?.documents?.[0]
        if (doc) {
          const road   = doc.road_address
          const jibun  = doc.address

          let roadAddr = ''
          if (road) {
            const parts = [
              road.region_1depth_name, road.region_2depth_name, road.road_name,
              road.main_building_no ? road.main_building_no + (road.sub_building_no ? `-${road.sub_building_no}` : '') : ''
            ].filter(Boolean)
            roadAddr = parts.join(' ')
          }

          let jibunAddr = ''
          if (jibun) {
            const parts = [
              jibun.region_1depth_name, jibun.region_2depth_name, jibun.region_3depth_name,
              jibun.main_address_no ? jibun.main_address_no + (jibun.sub_address_no && jibun.sub_address_no !== '0' ? `-${jibun.sub_address_no}` : '') : ''
            ].filter(Boolean)
            jibunAddr = parts.join(' ')
          }

          const address = jibunAddr || roadAddr || `${parseFloat(lat).toFixed(5)}, ${parseFloat(lon).toFixed(5)}`
          return c.json({ address, road_address: roadAddr, jibun_address: jibunAddr, source: 'kakao' })
        }
      }
    } catch (e) {
      console.warn('[역지오코딩] 카카오 실패, Nominatim fallback:', e)
    }
  }

  // ── Nominatim fallback ───────────────────────────────────────────────────
  try {
    const nomUrl = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=ko`
    const nomRes = await fetch(nomUrl, { headers: { 'User-Agent': 'SafetyNoteApp/1.0' } })
    if (nomRes.ok) {
      const data: any = await nomRes.json()
      const a = data.address || {}
      const parts = [
        a.city || a.province || a.state || '',
        a.borough || a.city_district || a.county || '',
        a.suburb || a.quarter || a.neighbourhood || '',
        a.road || '', a.house_number || ''
      ].filter(Boolean)
      const address = parts.join(' ') || data.display_name || `${parseFloat(lat).toFixed(5)}, ${parseFloat(lon).toFixed(5)}`
      return c.json({ address, road_address: address, jibun_address: '', source: 'nominatim' })
    }
  } catch (e) {
    console.warn('[역지오코딩] Nominatim 실패:', e)
  }

  // 최후 fallback
  return c.json({
    address: `${parseFloat(lat).toFixed(5)}, ${parseFloat(lon).toFixed(5)}`,
    road_address: '', jibun_address: '', source: 'coords'
  })
})

export default app
