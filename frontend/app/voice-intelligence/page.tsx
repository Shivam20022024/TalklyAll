'use client'

import { useRef, useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { Activity, Upload, Loader2, Play, FileText } from 'lucide-react'
import { fetchApi, getAuthToken, API_BASE_URL } from '@/lib/api'

export default function VoiceIntelligencePage() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [history, setHistory] = useState<any[]>([])
  const [loadingHistory, setLoadingHistory] = useState(true)

  const loadHistory = async () => {
    try {
      const data = await fetchApi('/api/v1/voice-intelligence/history')
      setHistory(data.data || [])
    } catch (e) {
      console.error('Failed to load history', e)
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
      formData.append('agent_name', 'Voice AI Agent')

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

  return (
    <AppLayout title="Voice Intelligence">
      <section className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div>
          <p className="eyebrow text-primary">Workspace / Voice Intelligence</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.06em] sm:text-[34px]">Voice Intelligence</h1>
          <p className="mt-2 text-sm text-muted-foreground">Monitor and analyze your AI agent's conversation quality.</p>
        </div>
        <div className="flex gap-2">
          <input
            type="file"
            accept="audio/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileChange}
          />
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 rounded-lg bg-primary px-3.5 py-2.5 text-xs font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
            {uploading ? 'Analyzing...' : 'Upload Voice'}
          </button>
        </div>
      </section>

      {result && (
        <section className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm relative">
          <button onClick={() => setResult(null)} className="absolute top-4 right-4 text-xs font-semibold text-muted-foreground hover:text-foreground">
            Close
          </button>
          <h2 className="text-xl font-bold mb-4">Analysis Result</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-4">
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Sentiment</p>
                <p className="capitalize font-medium">{result.sentiment}</p>
              </div>
              <div>
                <p className="text-sm font-semibold text-muted-foreground">Summary</p>
                <p className="text-sm mt-1">{result.summary}</p>
              </div>
            </div>
            <div>
              <p className="text-sm font-semibold text-muted-foreground">Transcript</p>
              <div className="mt-1 max-h-[200px] overflow-y-auto rounded-md bg-muted p-3 text-sm">
                {result.transcript}
              </div>
            </div>
          </div>
        </section>
      )}

      {!result && history.length === 0 && !loadingHistory && (
        <section className="mt-6 flex min-h-[300px] flex-col items-center justify-center rounded-xl border border-border bg-card p-5 text-center shadow-sm">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary mb-4">
            <Activity size={32} />
          </div>
          <h2 className="text-xl font-bold">Intelligence Engine Active</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">
            Upload an audio recording of a call to generate advanced analytics and voice intelligence insights.
          </p>
        </section>
      )}

      {!result && history.length > 0 && (
        <section className="mt-6 rounded-xl border border-border bg-card shadow-sm">
          <div className="border-b border-border p-5">
            <h2 className="text-lg font-bold">Recent Analyses</h2>
          </div>
          <div className="divide-y divide-border">
            {history.map((item: any, idx: number) => (
              <div key={item.call_id ? `${item.call_id}-${idx}` : idx} className="p-5 flex items-center justify-between hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setResult(item)}>
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <FileText size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">Audio Upload</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-muted-foreground">Sentiment</p>
                    <p className="text-sm capitalize font-medium">{item.sentiment || 'Neutral'}</p>
                  </div>
                  <button className="text-primary text-xs font-semibold hover:underline">
                    View Details
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </AppLayout>
  )
}
