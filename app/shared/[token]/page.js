'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Stethoscope, Loader2, ShieldAlert, ListChecks, ClipboardCheck, Siren,
  BedDouble, User, StickyNote, AlertTriangle, Gauge, TrendingUp, TrendingDown, Minus, CheckCircle2,
} from 'lucide-react'

function riskColor(level) {
  if (level === 'high') return 'bg-rose-100 text-rose-700 border-rose-200'
  if (level === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200'
  if (level === 'low') return 'bg-emerald-100 text-emerald-700 border-emerald-200'
  return 'bg-slate-100 text-slate-600 border-slate-200'
}
function urgencyColor(u) {
  if (u === 'urgent') return 'bg-rose-100 text-rose-700'
  if (u === 'soon') return 'bg-amber-100 text-amber-700'
  return 'bg-slate-100 text-slate-600'
}
function TrendIcon({ trend }) {
  if (trend === 'worsening') return <TrendingUp className="h-4 w-4 text-rose-600" />
  if (trend === 'improving') return <TrendingDown className="h-4 w-4 text-emerald-600" />
  return <Minus className="h-4 w-4 text-slate-500" />
}

export default function SharedHandoverPage() {
  const params = useParams()
  const token = params?.token
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const fetchData = async () => {
      try {
        const res = await fetch(`/api/shared/${token}`)
        const json = await res.json().catch(() => ({}))
        if (!res.ok) throw new Error(json.error || 'This handover link is invalid or has been revoked.')
        if (alive) setData(json)
      } catch (e) {
        if (alive) setError(e.message)
      } finally {
        if (alive) setLoading(false)
      }
    }
    if (token) fetchData()
    return () => { alive = false }
  }, [token])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30">
        <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /> Loading handover…</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/30 p-6">
        <Card className="max-w-md text-center">
          <CardContent className="space-y-3 py-10">
            <ShieldAlert className="mx-auto h-10 w-10 text-muted-foreground" />
            <h1 className="text-lg font-semibold">Handover unavailable</h1>
            <p className="text-sm text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const ao = data.aiOutput || {}
  const isbar = ao.isbar || {}
  const ew = ao.earlyWarning
  const header = ao.handoverHeader

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-primary text-primary-foreground">
        <div className="container flex items-center gap-3 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15"><Stethoscope className="h-5 w-5" /></div>
          <div>
            <p className="text-lg font-bold leading-tight">NurseCare · Shared handover</p>
            <p className="text-xs text-primary-foreground/80">Read-only · single patient{data.sharedBy ? ` · shared by ${data.sharedBy}` : ''}</p>
          </div>
        </div>
      </header>

      <main className="container max-w-3xl space-y-4 py-6">
        {/* Patient header */}
        <Card className="border-t-4 border-t-primary">
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{data.name}</h1>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  {data.bed && <span className="inline-flex items-center gap-1"><BedDouble className="h-4 w-4" /> {data.bed}</span>}
                  {data.age && <span className="inline-flex items-center gap-1"><User className="h-4 w-4" /> {data.age} years</span>}
                </div>
                {data.diagnosis && <p className="mt-2 max-w-2xl text-sm">{data.diagnosis}</p>}
              </div>
              {ew && (
                <div className={`rounded-lg border px-3 py-2 text-right ${riskColor(ew.riskLevel)}`}>
                  <div className="flex items-center justify-end gap-1 text-xs font-semibold uppercase tracking-wide"><Gauge className="h-3.5 w-3.5" /> {ew.riskLevel || 'unknown'} risk</div>
                  <div className="mt-0.5 flex items-center justify-end gap-1 text-xs"><TrendIcon trend={ew.trend} /> {ew.trend || 'stable'}{ew.score ? ` · EWS ${ew.score}` : ''}</div>
                </div>
              )}
            </div>
            {header?.alerts?.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {header.alerts.map((a, i) => (
                  <Badge key={i} variant="outline" className="border-rose-200 bg-rose-50 text-rose-700"><AlertTriangle className="mr-1 h-3 w-3" /> {a}</Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Deterioration */}
        {ew && (ew.rationale || ew.escalation) && (
          <Card className="border-l-4 border-l-rose-400">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Siren className="h-4 w-4 text-rose-600" /> Deterioration watch</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-sm">
              {ew.rationale && <p>{ew.rationale}</p>}
              {ew.escalation && <p className="font-medium text-rose-700">{ew.escalation}</p>}
            </CardContent>
          </Card>
        )}

        {/* Handover note */}
        {data.handoverNote && (
          <Card className="border-l-4 border-l-primary">
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><StickyNote className="h-4 w-4 text-primary" /> Nurse handover note</CardTitle></CardHeader>
            <CardContent><p className="whitespace-pre-wrap text-sm">{data.handoverNote}</p></CardContent>
          </Card>
        )}

        {/* Summary */}
        {ao.patientSummary && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Summary</CardTitle></CardHeader>
            <CardContent><p className="text-sm">{ao.patientSummary}</p></CardContent>
          </Card>
        )}

        {/* Critical actions */}
        {ao.criticalActions?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><Siren className="h-4 w-4 text-rose-600" /> Critical actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {ao.criticalActions.map((c, i) => (
                <div key={i} className="rounded-md border bg-rose-50/50 p-3 text-sm">
                  <p className="font-medium">{c.action}{c.window ? <span className="ml-2 text-xs text-rose-700">({c.window})</span> : null}</p>
                  {c.rationale && <p className="mt-0.5 text-xs text-muted-foreground">{c.rationale}</p>}
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Priorities */}
        {ao.priorities?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ListChecks className="h-4 w-4 text-primary" /> Care priorities</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {ao.priorities.map((p, i) => (
                <div key={i} className="flex items-start gap-2 rounded-md border p-3 text-sm">
                  <Badge className={`shrink-0 ${urgencyColor(p.urgency)}`}>{p.urgency || 'routine'}</Badge>
                  <div>
                    <p className="font-medium">{p.priority}</p>
                    {p.rationale && <p className="mt-0.5 text-xs text-muted-foreground">{p.rationale}</p>}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Care schedule */}
        {ao.careSchedule?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-primary" /> Care schedule</CardTitle></CardHeader>
            <CardContent className="space-y-1.5">
              {ao.careSchedule.map((c, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-14 shrink-0 font-mono text-xs text-muted-foreground">{c.time}</span>
                  <Badge variant="outline" className={`shrink-0 text-[10px] ${urgencyColor(c.priority)}`}>{c.priority || 'routine'}</Badge>
                  <span>{c.task}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* ISBAR */}
        {(isbar.identify || isbar.situation || isbar.background || isbar.assessment || isbar.recommendation) && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">ISBAR handover</CardTitle><CardDescription>Identify · Situation · Background · Assessment · Recommendation</CardDescription></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[['I', 'Identify', isbar.identify], ['S', 'Situation', isbar.situation], ['B', 'Background', isbar.background], ['A', 'Assessment', isbar.assessment], ['R', 'Recommendation', isbar.recommendation]].map(([k, label, val]) => val ? (
                <div key={k} className="flex gap-3">
                  <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">{k}</div>
                  <div><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-0.5 whitespace-pre-wrap">{val}</p></div>
                </div>
              ) : null)}
            </CardContent>
          </Card>
        )}

        {/* Outstanding tasks */}
        {ao.outstandingTasks?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><ClipboardCheck className="h-4 w-4 text-primary" /> Outstanding tasks</CardTitle></CardHeader>
            <CardContent>
              <ul className="space-y-1.5 text-sm">
                {ao.outstandingTasks.map((t, i) => (
                  <li key={i} className="flex items-start gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> <span>{typeof t === 'string' ? t : (t.task || JSON.stringify(t))}</span></li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        {/* Recommendations */}
        {ao.recommendations?.length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
            <CardContent>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {ao.recommendations.map((r, i) => (<li key={i}>{typeof r === 'string' ? r : JSON.stringify(r)}</li>))}
              </ul>
            </CardContent>
          </Card>
        )}

        <p className="pb-8 pt-2 text-center text-xs text-muted-foreground">Shared read-only via NurseCare. Always confirm against the patient&apos;s current chart.</p>
      </main>
    </div>
  )
}
