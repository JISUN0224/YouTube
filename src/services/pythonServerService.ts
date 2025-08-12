import { useCallback, useEffect, useRef, useState } from 'react'

const BASE_URL = (import.meta as any)?.env?.VITE_API_URL ?? 
  (import.meta.env.DEV ? 'http://localhost:5173' : window.location.origin)

type ProcessingStatusResponse = {
  status: 'started' | 'completed' | 'error' | string
  progress: number
  step: string
  message: string
}

type StartProcessResponse = {
  session_id: string
  message?: string
  status?: string
}

export function useAzureProcessing() {
  // 디버깅을 위해 로그를 항상 활성화
  const DEBUG: boolean = true
  const log = (...args: any[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.log('[AzureSvc]', ...args)
    }
  }
  const warn = (...args: any[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.warn('[AzureSvc]', ...args)
    }
  }
  const err = (...args: any[]) => {
    if (DEBUG) {
      // eslint-disable-next-line no-console
      console.error('[AzureSvc]', ...args)
    }
  }
  const [isProcessing, setIsProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentStep, setCurrentStep] = useState('initializing')
  const [message, setMessage] = useState('')
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const sessionIdRef = useRef<string | null>(null)
  const lastUrlRef = useRef<string | null>(null)
  const intervalRef = useRef<number | null>(null)
  const restartTriedRef = useRef(false)
  const pollInFlightRef = useRef(false)
  const loggingDisabledRef = useRef(false)

  const clearPolling = () => {
    if (intervalRef.current) {
      window.clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }

  const pollStatus = useCallback(async () => {
    if (pollInFlightRef.current) return
    pollInFlightRef.current = true
    const sid = sessionIdRef.current
    if (!sid) {
      log('pollStatus: 세션 ID가 없음')
      return
    }

    try {
      log(`상태 폴링: ${BASE_URL}/api/youtube/status/${sid}`)
      const res = await fetch(`${BASE_URL}/api/youtube/status/${sid}`)
      if (!res.ok) {
        if (res.status === 404 && lastUrlRef.current && !restartTriedRef.current) {
          // 서버 재시작 등으로 세션 유실 → 1회 자동 재시작
          restartTriedRef.current = true
          clearPolling()
          intervalRef.current = null
          setIsProcessing(true)
          await startProcessing(lastUrlRef.current)
          return
        }
        if (!loggingDisabledRef.current) {
          let bodyText = ''
          try { bodyText = await res.text() } catch {}
          warn('pollStatus non-ok', { status: res.status, statusText: res.statusText, bodyText })
        }
        throw new Error('상태 조회 실패')
      }
      const data = (await res.json()) as ProcessingStatusResponse & Record<string, any>
      log('상태 응답:', data)

      setProgress(Math.max(0, Math.min(100, Math.floor(data.progress ?? 0))))
      setCurrentStep(data.step ?? 'initializing')
      setMessage(data.message ?? '')

      if (data.status === 'completed') {
        log('처리 완료됨, 폴링 중지')
        clearPolling()
        setIsProcessing(false)
        
        try {
          const r = await fetch(`${BASE_URL}/api/youtube/result/${sid}`)
          if (r.ok) {
            const json = await r.json()
            log('결과 가져오기 성공:', json)
            setResult(json)
          } else {
            if (!loggingDisabledRef.current) {
              let body = ''
              try { body = await r.text() } catch {}
              err('result non-ok', { status: r.status, statusText: r.statusText, body })
            }
            setError('결과 조회 실패')
          }
        } catch (e: any) {
          err('결과 가져오기 오류:', e)
          setError('결과 조회 중 오류 발생')
        }
        return // 여기서 함수 종료하여 추가 폴링 방지
        
      } else if (data.status === 'error') {
        log('오류 발생, 폴링 중지')
        clearPolling()
        if (!loggingDisabledRef.current) err('status error', data)
        loggingDisabledRef.current = true
        setError(data.message || '처리 중 오류가 발생했습니다')
        setIsProcessing(false)
        return // 여기서 함수 종료
      }
    } catch (e: any) {
      clearPolling()
      if (!loggingDisabledRef.current) err('pollStatus exception', e)
      loggingDisabledRef.current = true
      setError(e?.message ?? '네트워크 오류')
      setIsProcessing(false)
    } finally {
      pollInFlightRef.current = false
    }
  }, [])

  const startProcessing = useCallback(async (url: string) => {
    log('startProcessing 호출됨, URL:', url)
    if (!url) {
      err('URL이 없습니다')
      return
    }
    if (intervalRef.current) {
      log('이미 폴링 중이므로 중복 시작 방지')
      return
    }
    setError(null)
    setResult(null)
    setProgress(0)
    setCurrentStep('initializing')
    setMessage('처리를 시작합니다...')
    setIsProcessing(true)
    lastUrlRef.current = url
    restartTriedRef.current = false
    loggingDisabledRef.current = false

    try {
      log(`${BASE_URL}/api/youtube/process로 요청 전송`, { url })
      const res = await fetch(`${BASE_URL}/api/youtube/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      log('서버 응답 받음:', { status: res.status, statusText: res.statusText })
      
      if (!res.ok) {
        let body = ''
        try { body = await res.text() } catch {}
        err('startProcessing 서버 오류', { status: res.status, statusText: res.statusText, body })
        throw new Error(`서버 오류: ${res.status} ${res.statusText}`)
      }
      
      const data = (await res.json()) as StartProcessResponse
      log('처리 시작 응답:', data)
      sessionIdRef.current = data.session_id

      clearPolling()
      log('폴링 시작, 세션 ID:', data.session_id)
      // 약간의 지연 후 폴링 시작 (백엔드가 세션 등록할 시간 확보)
      window.setTimeout(() => {
        intervalRef.current = window.setInterval(() => {
          void pollStatus()
        }, 2000)
        void pollStatus()
      }, 500)
    } catch (e: any) {
      if (!loggingDisabledRef.current) err('startProcessing exception', e)
      loggingDisabledRef.current = true
      setError(e?.message ?? '네트워크 오류')
      setIsProcessing(false)
    }
  }, [pollStatus])

  useEffect(() => {
    return () => clearPolling()
  }, [])

  return { isProcessing, progress, currentStep, message, result, error, startProcessing }
}


