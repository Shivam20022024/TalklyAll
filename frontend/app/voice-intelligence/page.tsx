'use client'

import { useRef, useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Upload, UploadCloud, Loader2, ArrowLeft, CheckCircle2, FileAudio, AudioLines, ChevronRight, Clock, Sparkles, MessageSquareText } from 'lucide-react'
import { fetchApi, getAuthToken, API_BASE_URL } from '@/lib/api'
import { Alert } from '@/components/ui/Alert'
import { ErrorState, LoadingState, Skeleton } from '@/components/ui/States'
import { Transcript } from '@/components/ui/Transcript'
import { formatDateTime } from '@/lib/format'
export default function VoiceIntelligencePage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)
  // Presentation-only: a failed history load must not read as "No analyses yet".
  const [historyFailed, setHistoryFailed] = useState(false)

  const loadHistory = async () => {
    try {
      const data = await fetchApi('/api/v1/voice-intelligence/history')
      setHistory(data.data || [])
      setHistoryFailed(false)
    } catch (e) {
      console.error('Failed to load history', e)
      setHistoryFailed(true)
    } finally {
      setLoadingHistory(false)
    }
  }

  useEffect(() => {
    loadHistory()
  }, [])

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setResult(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('agent_name', 'TalklyAI Agent')

      const token = getAuthToken()
      
      const response = await fetch(`${API_BASE_URL}/api/v1/process-audio`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        throw new Error('Upload failed')
      }

      const data = await response.json()
      setResult(data)
      loadHistory() // Refresh history after upload
    } catch (error) {
      console.error('Error uploading voice:', error)
      alert('Failed to analyze audio')
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // Presentation helpers: read only what the API returned; nothing is inferred or defaulted.
  const asText = (v: any): string =>
    v === null || v === undefined ? '' : typeof v === 'object' ? (v.content || v.text || v.action || v.recommendation || v.title || Object.values(v).filter((x) => typeof x === 'string').join(' - ')) : String(v)
  const filled = (v: any) => v !== null && v !== undefined && String(v).trim() !== '' && String(v).trim().toUpperCase() !== 'N/A'

  // Drag-and-drop only hands the dropped file to the same file input and change handler the Browse button uses.
  const [dragOver, setDragOver] = useState(false)
  const [dropNote, setDropNote] = useState('')
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    if (uploading) return
    const file = e.dataTransfer.files?.[0]
    if (!file) return
    if (!file.type.startsWith('audio/')) {
      setDropNote('That file is not an audio recording. Drop an audio file to analyze it.')
      return
    }
    setDropNote('')
    const input = fileInputRef.current
    if (!input) return
    const dt = new DataTransfer()
    dt.items.add(file)
    input.files = dt.files
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }

  const SENTIMENT_TONE: Record<string, string> = {
    positive: 'bg-emerald-50 text-emerald-700',
    negative: 'bg-rose-50 text-rose-700',
    neutral: 'bg-slate-100 text-slate-700',
  }
  const sentimentBadge = (s?: string) =>
    s ? (
      <span className={`inline-flex items-center rounded-full px-3 py-1 text-[14px] font-semibold capitalize ${SENTIMENT_TONE[String(s).toLowerCase()] || 'bg-slate-100 text-slate-700'}`}>{String(s)}</span>
    ) : (
      <span className="text-ds-ink-3">—</span>
    )
  const TEMP_TONE: Record<string, string> = { hot: 'bg-rose-50 text-rose-700', warm: 'bg-violet-50 text-violet-700', cold: 'bg-slate-100 text-slate-700' }
  const SEVERITY_TONE = (s: string) => (s === 'high' ? 'bg-rose-50 text-rose-700' : s === 'medium' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700')
  const pill = 'inline-flex items-center rounded-full px-2.5 py-0.5 text-[13px] font-semibold'

  const headBtn =
    'inline-flex h-11 items-center gap-2 rounded-xl bg-ds-primary px-5 text-[15px] font-semibold text-white shadow-md shadow-blue-600/20 transition-colors hover:bg-ds-primary-hover active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60'
  const card = 'rounded-2xl border border-ds-line bg-ds-bg p-5 shadow-sm sm:p-6'
  const cardHead = (title: React.ReactNode, description?: React.ReactNode, right?: React.ReactNode) => (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[19px] font-semibold leading-tight text-ds-ink">{title}</h2>
        {description && <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">{description}</p>}
      </div>
      {right}
    </div>
  )

  const ResultView = (item: any) => {
    const a = item.analysis || {}
    const score = typeof a.lead_score === 'number' ? a.lead_score : (typeof a.intent_score === 'number' ? a.intent_score : null)
    const reqs = { ...(a.property_requirements || {}), ...(a.requirements || {}) }
    const extracted = Object.entries(reqs).filter(([, v]) => filled(v) && typeof v !== 'object')
    const intents: string[] = Array.isArray(a.intents) ? a.intents.filter(Boolean) : []
    const objections: any[] = Array.isArray(a.key_objections) ? a.key_objections : []
    const actions: string[] = Array.isArray(a.action_items) ? a.action_items.map(asText).filter(Boolean) : []
    const followUps: any[] = Array.isArray(a.follow_up_recommendations) ? a.follow_up_recommendations : []
    const language = a.detected_language || item.detected_language || item.language
    const row = 'flex items-center justify-between gap-3 py-3'
    return (
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-5">
          <section className={card} aria-label="Summary">
            {cardHead(<span className="flex items-center gap-2.5"><Sparkles size={20} strokeWidth={1.75} className="text-ds-accent" aria-hidden="true" />AI Summary</span>, formatDateTime(item.created_at))}
            <p className="mt-4 text-[16px] leading-relaxed text-ds-ink">{item.summary || a.summary || 'No summary was returned for this recording.'}</p>
          </section>
          <section className={card} aria-label="Transcript">
            {cardHead(<span className="flex items-center gap-2.5"><MessageSquareText size={20} strokeWidth={1.75} className="text-ds-primary" aria-hidden="true" />Transcript</span>, 'Speaker labels come from the transcript itself. Timestamps are not available for uploaded recordings.')}
            <div className="mt-4">
              {item.transcript ? <Transcript text={item.transcript} /> : <p className="rounded-xl border border-dashed border-ds-line-strong px-4 py-8 text-center text-[15px] text-ds-ink-2">No transcript was returned for this recording.</p>}
            </div>
          </section>
        </div>

        <div className="min-w-0 space-y-5">
          <section className={card} aria-label="Signals">
            {cardHead('Signals')}
            <dl className="mt-2 divide-y divide-ds-line text-[15px]">
              <div className={row}><dt className="text-ds-ink-2">Sentiment</dt><dd>{sentimentBadge(item.sentiment || a.sentiment)}</dd></div>
              {score !== null && (
                <div className="flex items-start justify-between gap-3 py-3">
                  <dt className="pt-0.5 text-ds-ink-2">Lead score</dt>
                  <dd className="flex flex-col items-end gap-2">
                    <span className="flex items-center gap-2">
                      {a.lead_temperature && <span className={`${pill} ${TEMP_TONE[String(a.lead_temperature).toLowerCase()] || 'bg-slate-100 text-slate-700'}`}>{a.lead_temperature}</span>}
                      <span className="text-[18px] font-semibold tabular-nums text-ds-ink">{score}<span className="text-[14px] font-normal text-ds-ink-2"> / 100</span></span>
                    </span>
                    <span className="block h-2 w-40 overflow-hidden rounded-full bg-ds-surface" aria-hidden="true"><span className="block h-full rounded-full bg-ds-primary" style={{ width: `${Math.min(Math.max(score, 0), 100)}%` }} /></span>
                  </dd>
                </div>
              )}
              {typeof a.conversion_probability === 'number' && (
                <div className={row}><dt className="text-ds-ink-2">Conversion probability</dt><dd className="font-semibold tabular-nums text-ds-ink">{a.conversion_probability}%</dd></div>
              )}
              {a.intent_label && <div className={row}><dt className="text-ds-ink-2">Intent</dt><dd className="text-right font-semibold text-ds-ink">{a.intent_label}</dd></div>}
              {language && <div className={row}><dt className="text-ds-ink-2">Language</dt><dd className="font-semibold text-ds-ink">{language}</dd></div>}
            </dl>
            {a.sentiment_reason && <p className="mt-2 rounded-xl bg-ds-surface px-3.5 py-3 text-[15px] leading-relaxed text-ds-ink-2">{a.sentiment_reason}</p>}
          </section>

          {intents.length > 0 && (
            <section className={card} aria-label="Intents detected">
              {cardHead('Intents detected')}
              <div className="mt-3 flex flex-wrap gap-2">{intents.map((t, i) => <span key={`${t}-${i}`} className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-[14px] font-semibold text-blue-700">{t}</span>)}</div>
            </section>
          )}

          {extracted.length > 0 && (
            <section className={card} aria-label="Extracted details">
              {cardHead('Extracted details')}
              <dl className="mt-2 divide-y divide-ds-line text-[15px]">
                {extracted.map(([k, v]) => (
                  <div key={k} className="flex items-start justify-between gap-3 py-3">
                    <dt className="capitalize text-ds-ink-2">{k.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()}</dt>
                    <dd className="text-right font-semibold text-ds-ink">{String(v)}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          {objections.length > 0 && (
            <section className={card} aria-label="Objections raised">
              {cardHead('Objections raised')}
              <ul className="mt-3 space-y-3">
                {objections.map((o, i) => (
                  <li key={i} className="rounded-xl border border-ds-line px-4 py-3 text-[15px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-ds-ink">{typeof o === 'object' ? (o.type || 'Objection') : 'Objection'}</span>
                      {typeof o === 'object' && o.severity && <span className={`${pill} ${SEVERITY_TONE(String(o.severity).toLowerCase())}`}>{o.severity}</span>}
                    </div>
                    {asText(typeof o === 'object' ? o.content : o) && <p className="mt-1 text-ds-ink-2">{asText(typeof o === 'object' ? o.content : o)}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(actions.length > 0 || followUps.length > 0) && (
            <section className={card} aria-label="Next steps">
              {cardHead('Next steps')}
              <ul className="mt-3 space-y-3 text-[15px]">
                {actions.map((t, i) => (
                  <li key={`a-${i}`} className="flex items-start gap-2.5 text-ds-ink"><CheckCircle2 size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-ds-primary" aria-hidden="true" />{t}</li>
                ))}
                {followUps.map((f, i) => (
                  <li key={`f-${i}`} className="rounded-xl border border-ds-line px-4 py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {f?.type && <span className={`${pill} bg-slate-100 text-slate-700`}>{f.type}</span>}
                      {f?.priority && <span className={`${pill} ${String(f.priority).toLowerCase() === 'high' ? 'bg-amber-50 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>{f.priority} priority</span>}
                    </div>
                    {asText(f?.content ?? f) && <p className="mt-2 text-ds-ink-2">{asText(f?.content ?? f)}</p>}
                    {f?.draft && <p className="mt-2 rounded-lg bg-ds-surface px-3 py-2.5 text-[14px] text-ds-ink-2">{f.draft}</p>}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    )
  }

  const openPicker = () => fileInputRef.current?.click()

  return (
    <AppLayout title="Voice Intelligence">
      {/* Page header */}
      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <h1 className="text-[30px] font-bold leading-tight tracking-tight text-ds-ink sm:text-[32px]">Voice Intelligence</h1>
          <p className="mt-1.5 text-[16px] text-ds-ink-2 sm:text-[17px]">Turn call recordings into actionable customer insights.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 lg:shrink-0">
          <input type="file" accept="audio/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
          <button onClick={openPicker} disabled={uploading} className={headBtn}>
            {uploading ? <Loader2 size={17} className="animate-spin" /> : <Upload size={17} strokeWidth={1.75} />}
            {uploading ? 'Analyzing…' : 'Upload recording'}
          </button>
        </div>
      </header>

      {uploading && (
        <Alert tone="info" title="Analyzing your recording">
          Transcribing and analyzing the audio. This can take a minute for longer calls.
        </Alert>
      )}

      {result ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <button onClick={() => setResult(null)} className="inline-flex h-11 items-center gap-2 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm hover:bg-ds-surface">
              <ArrowLeft size={17} strokeWidth={1.75} />Back to recent analyses
            </button>
            <span className="text-[14px] text-ds-ink-2">{result.agent_name ? `Agent: ${result.agent_name}` : ''}</span>
          </div>
          {ResultView(result)}
        </>
      ) : (
        <>
          {/* Upload area */}
          <section
            aria-labelledby="upload-title"
            onDragOver={(e) => { e.preventDefault(); if (!uploading) setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed px-5 py-7 text-center transition-colors sm:px-8 ${dragOver ? 'border-ds-primary bg-blue-50' : 'border-blue-200 bg-gradient-to-br from-blue-50/70 via-white to-violet-50/60'}`}
          >
            <div className="mx-auto flex max-w-2xl flex-col items-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ds-bg text-ds-primary shadow-sm ring-1 ring-blue-100" aria-hidden="true">
                {uploading ? <Loader2 size={26} className="animate-spin" /> : <UploadCloud size={28} strokeWidth={1.75} />}
              </span>
              <h2 id="upload-title" className="mt-3 text-[19px] font-semibold text-ds-ink">Upload call recording</h2>
              <p className="mt-1 text-[15px] leading-snug text-ds-ink-2">Upload a recording to generate its transcript, summary and AI analysis.</p>
              <p className="mt-0.5 text-[15px] text-ds-ink-2">Drag and drop an audio file here, or browse your files.</p>
              <button onClick={openPicker} disabled={uploading} className={`${headBtn} mt-4`}>
                <Upload size={17} strokeWidth={1.75} />{uploading ? 'Analyzing…' : 'Browse files'}
              </button>
              <p className="mt-3 flex items-center gap-1.5 text-[14px] text-ds-ink-2"><FileAudio size={15} strokeWidth={1.75} aria-hidden="true" />Audio files only</p>
              {dropNote && <p role="alert" className="mt-2 text-[14px] font-medium text-ds-error-ink">{dropNote}</p>}
            </div>
          </section>

          {loadingHistory ? (
            <LoadingState label="Loading recent analyses…"><Skeleton className="h-64 w-full rounded-2xl" /></LoadingState>
          ) : historyFailed && history.length === 0 ? (
            <div className={card}>
              <ErrorState title="Your analyses couldn’t be loaded" description="The request failed, so no list is shown rather than a misleading empty one. Reload the page to try again." />
            </div>
          ) : history.length === 0 ? (
            <section className={card} aria-labelledby="recent-title">
              <h2 id="recent-title" className="sr-only">Recent analyses</h2>
              <div className="flex flex-col items-center px-4 py-8 text-center">
                <span className="flex h-14 w-14 items-center justify-center rounded-full bg-blue-50 text-ds-primary" aria-hidden="true"><AudioLines size={26} strokeWidth={1.75} /></span>
                <h3 className="mt-4 text-[19px] font-semibold text-ds-ink">No recordings analyzed yet</h3>
                <p className="mt-1.5 max-w-md text-[15px] text-ds-ink-2">Recordings you upload will appear here after they have been analyzed, with their summary, sentiment and lead score.</p>
                <button onClick={openPicker} disabled={uploading} className={`${headBtn} mt-5`}><Upload size={17} strokeWidth={1.75} />Upload recording</button>
              </div>
            </section>
          ) : (
            <section className={card} aria-labelledby="recent-title">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3.5">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700" aria-hidden="true"><AudioLines size={22} strokeWidth={1.75} /></span>
                  <div>
                    <h2 id="recent-title" className="text-[19px] font-semibold leading-tight text-ds-ink">Recent Analyses</h2>
                    <p className="mt-1 text-[15px] text-ds-ink-2">Your previously analyzed recordings</p>
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-ds-surface px-3 py-1 text-[14px] font-semibold tabular-nums text-ds-ink-2">{history.length} {history.length === 1 ? 'recording' : 'recordings'}</span>
              </div>

              <ul className="mt-5 divide-y divide-ds-line overflow-hidden rounded-xl border border-ds-line" aria-label="Voice intelligence history">
                {history.map((item: any, idx: number) => {
                  const score = typeof item.analysis?.lead_score === 'number' ? item.analysis.lead_score : null
                  const summary = item.summary || item.analysis?.summary
                  const name = item.customer_name && item.customer_name !== 'Phone Lead' ? item.customer_name : 'Audio upload'
                  return (
                    <li key={item.call_id ? `${item.call_id}-${idx}` : idx} onClick={() => setResult(item)} className="cursor-pointer px-4 py-4 transition-colors hover:bg-ds-surface/70 sm:px-5">
                      <div className="grid items-center gap-x-5 gap-y-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
                        <div className="flex min-w-0 items-start gap-3.5">
                          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-ds-primary" aria-hidden="true"><AudioLines size={20} strokeWidth={1.75} /></span>
                          <div className="min-w-0">
                            <p className="truncate text-[17px] font-semibold text-ds-ink">{name}</p>
                            {summary && <p className="mt-0.5 line-clamp-2 text-[15px] leading-snug text-ds-ink-2">{summary}</p>}
                            <p className="mt-1 flex items-center gap-1.5 text-[14px] text-ds-ink-2"><Clock size={14} strokeWidth={1.75} aria-hidden="true" />{formatDateTime(item.created_at)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-5 lg:gap-6">
                          <div className="min-w-[96px]">
                            <p className="text-[13px] font-medium text-ds-ink-2">Sentiment</p>
                            <div className="mt-1">{sentimentBadge(item.sentiment)}</div>
                          </div>
                          <div className="min-w-[84px]">
                            <p className="text-[13px] font-medium text-ds-ink-2">Lead score</p>
                            <p className="mt-1 text-[18px] font-semibold tabular-nums text-ds-ink">{score !== null ? score : <span className="text-ds-ink-3">—</span>}</p>
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); setResult(item) }}
                          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border border-ds-line bg-ds-bg px-4 text-[15px] font-semibold text-ds-ink shadow-sm hover:border-ds-primary/40 hover:bg-blue-50 hover:text-ds-primary lg:justify-self-end"
                          aria-label={`View analysis from ${formatDateTime(item.created_at)}`}
                        >
                          View Analysis<ChevronRight size={16} strokeWidth={1.75} aria-hidden="true" />
                        </button>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </AppLayout>
  )
}
