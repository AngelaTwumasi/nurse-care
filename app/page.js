'use client'

import { useEffect, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger,
} from '@/components/ui/dialog'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Separator } from '@/components/ui/separator'
import {
  Stethoscope, Plus, Trash2, Upload, FileText, Pill, Activity, HeartPulse,
  ClipboardList, Sparkles, ArrowLeft, GraduationCap, ShieldAlert, ListChecks,
  ClipboardCheck, Loader2, BookOpen, User, BedDouble, AlertTriangle, Lightbulb,
  CheckCircle2, FileUp, StickyNote, X, Download, Copy, Clock, TrendingUp,
  TrendingDown, Minus, Gauge, Siren,
} from 'lucide-react'

const HERO_IMG = 'https://images.pexels.com/photos/4021772/pexels-photo-4021772.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940'

const CATEGORIES = {
  careplan: { label: 'Care Plan', icon: ClipboardList, color: 'text-teal-600' },
  medication: { label: 'Medications', icon: Pill, color: 'text-fuchsia-600' },
  vitals: { label: 'Vital Signs', icon: Activity, color: 'text-rose-600' },
  allied_health: { label: 'Allied Health', icon: HeartPulse, color: 'text-indigo-600' },
  other: { label: 'Other Documents', icon: FileText, color: 'text-slate-600' },
}

const MAX_PATIENTS = 4

async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

/* ------------------------ Tutorial ------------------------ */
const TUTORIAL_STEPS = [
  {
    icon: GraduationCap,
    title: 'Welcome to NurseCare',
    body: 'Your AI clinical buddy for a busy shift. Built for new graduate nurses managing a real patient load. Let\u2019s take 30 seconds to see how it works.',
  },
  {
    icon: User,
    title: '1. Build your patient load',
    body: 'Add up to 4 patients \u2014 just like a typical shift. Give each a name, bed/room, age and their reason for admission.',
  },
  {
    icon: FileUp,
    title: '2. Feed in the documents',
    body: 'For each patient, upload the care plan, medication chart, vital signs and allied health notes (PDF or photo), or paste notes as text. NurseCare reads them all.',
  },
  {
    icon: Sparkles,
    title: '3. Generate nursing cares',
    body: 'Tap Generate. The AI reads every document and produces your care Priorities, Nursing Interventions, Medications summary and a ready-to-read ISBAR handover.',
  },
  {
    icon: ShieldAlert,
    title: 'Stay safe',
    body: 'NurseCare is a study & prep aid \u2014 always verify medications, doses and escalation with your senior/RN. You\u2019ve got this!',
  },
]

function TutorialDialog({ open, onOpenChange }) {
  const [step, setStep] = useState(0)
  const s = TUTORIAL_STEPS[step]
  const Icon = s.icon
  const last = step === TUTORIAL_STEPS.length - 1

  useEffect(() => { if (open) setStep(0) }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden gap-0">
        <div className="relative h-40 w-full">
          <img src={HERO_IMG} alt="Nurse" className="h-full w-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-primary/80 to-primary/20" />
          <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
            <Stethoscope className="h-5 w-5" />
            <span className="font-semibold tracking-tight">NurseCare</span>
          </div>
        </div>
        <div className="p-6">
          <div className="flex items-center gap-3 mb-3">
            <div className="rounded-xl bg-accent p-2.5">
              <Icon className="h-6 w-6 text-primary" />
            </div>
            <DialogHeader className="space-y-0 text-left">
              <DialogTitle className="text-lg">{s.title}</DialogTitle>
            </DialogHeader>
          </div>
          <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
            {s.body}
          </DialogDescription>

          <div className="mt-5 flex items-center justify-center gap-1.5">
            {TUTORIAL_STEPS.map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-primary' : 'w-1.5 bg-muted-foreground/30'}`} />
            ))}
          </div>

          <DialogFooter className="mt-5 flex-row justify-between sm:justify-between">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Skip</Button>
            <div className="flex gap-2">
              {step > 0 && <Button variant="outline" onClick={() => setStep(step - 1)}>Back</Button>}
              {last
                ? <Button onClick={() => onOpenChange(false)}>Get started</Button>
                : <Button onClick={() => setStep(step + 1)}>Next</Button>}
            </div>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------ Add Patient ------------------------ */
function AddPatientDialog({ onAdd, disabled, trigger }) {
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', bed: '', age: '', diagnosis: '' })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Please enter a patient name'); return }
    setSaving(true)
    try {
      await onAdd(form)
      setForm({ name: '', bed: '', age: '', diagnosis: '' })
      setOpen(false)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger || (
          <Button disabled={disabled} className="gap-2">
            <Plus className="h-4 w-4" /> Add patient
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add patient to your load</DialogTitle>
          <DialogDescription>Basic details help the AI tailor the care plan.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Patient name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. John Doe" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Bed / Room</Label>
              <Input value={form.bed} onChange={(e) => setForm({ ...form, bed: e.target.value })} placeholder="e.g. Bed 12" />
            </div>
            <div className="space-y-1.5">
              <Label>Age</Label>
              <Input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} placeholder="e.g. 72" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Diagnosis / reason for admission</Label>
            <Textarea value={form.diagnosis} onChange={(e) => setForm({ ...form, diagnosis: e.target.value })} placeholder="e.g. Congestive heart failure exacerbation" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} className="gap-2">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Add patient
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------ Patient Card ------------------------ */
function PatientCard({ patient, index, onOpen }) {
  const docCount = patient.documents?.length || 0
  const hasAI = !!patient.aiOutput
  return (
    <Card
      onClick={() => onOpen(patient.id)}
      className="cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 border-t-4 border-t-primary/70"
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-primary-foreground text-sm font-semibold">
              {index + 1}
            </div>
            <div>
              <CardTitle className="text-base leading-tight">{patient.name}</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {patient.bed || 'No bed'}{patient.age ? ` \u00b7 ${patient.age}y` : ''}
              </p>
            </div>
          </div>
          {hasAI
            ? <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3" /> Ready</Badge>
            : <Badge variant="secondary">New</Badge>}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {patient.diagnosis || 'No diagnosis recorded yet.'}
        </p>
        <Separator className="my-3" />
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5" /> {docCount} document{docCount !== 1 ? 's' : ''}</span>
          <span className="text-primary font-medium inline-flex items-center gap-1">Open <ArrowLeft className="h-3.5 w-3.5 rotate-180" /></span>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------ Upload Panel ------------------------ */
function UploadPanel({ onUploadFiles, onAddNote, busy }) {
  const [category, setCategory] = useState('careplan')
  const [note, setNote] = useState('')
  const [noteName, setNoteName] = useState('')

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    await onUploadFiles(files, category)
  }

  const submitNote = async () => {
    if (!note.trim()) { toast.error('Nothing to save'); return }
    await onAddNote(noteName.trim() || `${CATEGORIES[category].label} note`, category, note)
    setNote(''); setNoteName('')
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><Upload className="h-4 w-4 text-primary" /> Add documents</CardTitle>
        <CardDescription>Upload PDFs or photos, or paste notes. Tag each with a category so the AI knows what it is reading.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>Document category</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CATEGORIES).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-6 text-center transition-colors hover:bg-accent/50 ${busy ? 'pointer-events-none opacity-60' : 'cursor-pointer'}`}>
          <FileUp className="h-7 w-7 text-primary" />
          <span className="text-sm font-medium">Click to upload files</span>
          <span className="text-xs text-muted-foreground">PDF, JPG or PNG · multiple allowed</span>
          <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={handleFiles} disabled={busy} />
        </label>

        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or paste notes</span>
        </div>

        <div className="space-y-2">
          <Input value={noteName} onChange={(e) => setNoteName(e.target.value)} placeholder="Note title (optional)" />
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder={'Paste handover notes, vitals or observations here\u2026'} />
          <Button variant="outline" className="w-full gap-2" onClick={submitNote} disabled={busy}>
            <StickyNote className="h-4 w-4" /> Save note as {CATEGORIES[category].label}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------ Document List ------------------------ */
function DocumentList({ documents, onDelete }) {
  if (!documents?.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No documents yet. Add the care plan, meds, vitals & allied health notes above.
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {documents.map((d) => {
        const cat = CATEGORIES[d.category] || CATEGORIES.other
        const Icon = cat.icon
        return (
          <div key={d.id} className="flex items-center gap-3 rounded-lg border bg-card p-3">
            <div className="rounded-md bg-accent p-2"><Icon className={`h-4 w-4 ${cat.color}`} /></div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{d.name}</p>
              <p className="text-xs text-muted-foreground">{cat.label} · {d.kind === 'text' ? 'Note' : (d.mimeType === 'application/pdf' ? 'PDF' : 'Image')}</p>
            </div>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(d.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------ AI Results ------------------------ */
const URGENCY = {
  urgent: { label: 'Urgent', cls: 'bg-red-100 text-red-700 border-red-200' },
  soon: { label: 'Soon', cls: 'bg-amber-100 text-amber-700 border-amber-200' },
  routine: { label: 'Routine', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
}

const RISK = {
  low: { cls: 'from-emerald-500 to-teal-600', badge: 'bg-emerald-100 text-emerald-700', label: 'Low risk' },
  medium: { cls: 'from-amber-500 to-orange-600', badge: 'bg-amber-100 text-amber-700', label: 'Medium risk' },
  high: { cls: 'from-red-500 to-rose-600', badge: 'bg-red-100 text-red-700', label: 'High risk' },
}

function TrendIcon({ trend, className }) {
  if (trend === 'worsening') return <TrendingUp className={className} />
  if (trend === 'improving') return <TrendingDown className={className} />
  return <Minus className={className} />
}

function DeteriorationAlert({ ew }) {
  if (!ew) return null
  const r = RISK[ew.riskLevel] || RISK.medium
  const worsening = ew.trend === 'worsening'
  return (
    <Card className={`overflow-hidden border-0 bg-gradient-to-br ${r.cls} text-white`}>
      <CardContent className="py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-white/20 p-2.5">
              {worsening ? <Siren className="h-6 w-6" /> : <Gauge className="h-6 w-6" />}
            </div>
            <div>
              <p className="text-sm font-medium opacity-90">Deterioration watch · Early Warning</p>
              <div className="flex items-center gap-2">
                <span className="text-2xl font-bold leading-none">Score {ew.score ?? 'N/A'}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide">
                  <TrendIcon trend={ew.trend} className="h-3.5 w-3.5" /> {ew.trend || 'stable'}
                </span>
              </div>
            </div>
          </div>
          <span className="rounded-full bg-white/25 px-3 py-1 text-sm font-semibold">{r.label}</span>
        </div>
        {ew.rationale && <p className="mt-3 text-sm opacity-95">{ew.rationale}</p>}
        {ew.escalation && (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-black/15 p-2.5 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" /> <span><b>Action:</b> {ew.escalation}</span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function VitalsTimeline({ vitals = [], meds = [] }) {
  const hasVitals = vitals.length > 0
  const hasMeds = meds.length > 0
  if (!hasVitals && !hasMeds) {
    return <p className="text-sm text-muted-foreground">No time-stamped vitals or medication times were found in the documents.</p>
  }
  const vitalChip = (label, val) => val ? (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">
      <span className="font-medium text-muted-foreground mr-1">{label}</span>{val}
    </span>
  ) : null
  return (
    <div className="space-y-5">
      {hasVitals && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-rose-600" /> Vital signs over the shift</h4>
          <div className="relative space-y-3 pl-5">
            <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
            {vitals.map((v, i) => (
              <div key={i} className="relative">
                <span className="absolute -left-[15px] top-1.5 h-2.5 w-2.5 rounded-full bg-primary ring-4 ring-background" />
                <div className="rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-sm font-semibold">{v.time || '—'}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {vitalChip('HR', v.hr)}
                    {vitalChip('BP', v.bp)}
                    {vitalChip('RR', v.rr)}
                    {vitalChip('SpO₂', v.spo2)}
                    {vitalChip('Temp', v.temp)}
                  </div>
                  {v.notes && <p className="mt-2 text-xs text-muted-foreground">{v.notes}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {hasMeds && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold"><Pill className="h-4 w-4 text-fuchsia-600" /> Medication times</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {meds.map((m, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border bg-card p-2.5">
                <span className="inline-flex items-center gap-1 rounded-md bg-fuchsia-100 px-2 py-1 text-xs font-semibold text-fuchsia-700"><Clock className="h-3 w-3" /> {m.time || '—'}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{m.medication}</p>
                  {m.dose && <p className="text-xs text-muted-foreground">{m.dose}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function buildHandoverText(patient, ai) {
  const L = []
  L.push(`NURSECARE HANDOVER — ${patient.name || 'Patient'}`)
  L.push(`Bed/Room: ${patient.bed || 'N/A'}   Age: ${patient.age || 'N/A'}`)
  if (patient.diagnosis) L.push(`Diagnosis: ${patient.diagnosis}`)
  L.push('')
  if (ai.earlyWarning) L.push(`EARLY WARNING: Score ${ai.earlyWarning.score ?? 'N/A'} · ${ai.earlyWarning.riskLevel || ''} · trend ${ai.earlyWarning.trend || ''}`)
  L.push('')
  L.push('ISBAR')
  const s = ai.isbar || {}
  L.push(`I - Identify: ${s.identify || ''}`)
  L.push(`S - Situation: ${s.situation || ''}`)
  L.push(`B - Background: ${s.background || ''}`)
  L.push(`A - Assessment: ${s.assessment || ''}`)
  L.push(`R - Recommendation: ${s.recommendation || ''}`)
  L.push('')
  L.push('CARE PRIORITIES')
  ;(ai.priorities || []).forEach((p, i) => L.push(`${p.rank || i + 1}. [${(p.urgency || '').toUpperCase()}] ${p.priority} — ${p.rationale}`))
  L.push('')
  L.push('NURSING INTERVENTIONS')
  ;(ai.interventions || []).forEach((it) => L.push(`• ${it.intervention} (${it.frequency || ''}) — monitor: ${it.monitoring || ''}`))
  L.push('')
  if ((ai.medications || []).length) {
    L.push('MEDICATIONS')
    ;(ai.medications || []).forEach((m) => L.push(`• ${m.name} ${m.dose || ''} ${m.route || ''} ${m.notes ? '— ' + m.notes : ''}`))
    L.push('')
  }
  if ((ai.redFlags || []).length) {
    L.push('RED FLAGS — ESCALATE')
    ;(ai.redFlags || []).forEach((r) => L.push(`! ${r}`))
    L.push('')
  }
  if (ai.safetyNotice) L.push(ai.safetyNotice)
  return L.join('\n')
}

function esc(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function downloadHandoverPDF(patient, ai) {
  const s = ai.isbar || {}
  const row = (label, val) => `<tr><td class="lbl">${label}</td><td>${esc(val)}</td></tr>`
  const list = (arr, fn) => (arr || []).map(fn).join('')
  const ewHtml = ai.earlyWarning ? `<div class="ew ew-${esc(ai.earlyWarning.riskLevel)}">Early Warning Score ${esc(ai.earlyWarning.score)} · ${esc(ai.earlyWarning.riskLevel)} risk · trend ${esc(ai.earlyWarning.trend)}<br/><small>${esc(ai.earlyWarning.rationale || '')}</small></div>` : ''
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Handover — ${esc(patient.name)}</title>
  <style>
    *{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;box-sizing:border-box}
    body{margin:32px;color:#0f172a;line-height:1.5}
    h1{font-size:22px;margin:0}
    h2{font-size:14px;text-transform:uppercase;letter-spacing:.05em;color:#0d9488;border-bottom:2px solid #99f6e4;padding-bottom:4px;margin:22px 0 10px}
    .meta{color:#475569;font-size:13px;margin-top:4px}
    table{width:100%;border-collapse:collapse;font-size:13px}
    td{padding:6px 8px;vertical-align:top;border-bottom:1px solid #e2e8f0}
    td.lbl{width:130px;font-weight:600;color:#0f766e}
    ul{margin:6px 0;padding-left:20px;font-size:13px}
    li{margin:4px 0}
    .ew{margin-top:10px;padding:10px 12px;border-radius:8px;font-weight:600;font-size:14px}
    .ew-low{background:#d1fae5;color:#065f46}.ew-medium{background:#fef3c7;color:#92400e}.ew-high{background:#fee2e2;color:#991b1b}
    .foot{margin-top:24px;font-size:11px;color:#64748b;border-top:1px solid #e2e8f0;padding-top:8px}
    .badge{display:inline-block;background:#f1f5f9;border-radius:4px;padding:1px 6px;font-size:11px;margin-right:4px}
  </style></head><body>
  <h1>NurseCare Handover</h1>
  <div class="meta"><b>${esc(patient.name)}</b> · ${esc(patient.bed || 'No bed')} · ${esc(patient.age || 'N/A')} yrs${patient.diagnosis ? ' · ' + esc(patient.diagnosis) : ''}</div>
  ${ewHtml}
  <h2>ISBAR</h2>
  <table>${row('Identify', s.identify)}${row('Situation', s.situation)}${row('Background', s.background)}${row('Assessment', s.assessment)}${row('Recommendation', s.recommendation)}</table>
  <h2>Care Priorities</h2>
  <ul>${list(ai.priorities, (p, i) => `<li><span class="badge">${esc((p.urgency || '').toUpperCase())}</span><b>${esc(p.priority)}</b> — ${esc(p.rationale)}</li>`)}</ul>
  <h2>Nursing Interventions</h2>
  <ul>${list(ai.interventions, (it) => `<li><b>${esc(it.intervention)}</b> <i>(${esc(it.frequency || '')})</i> — monitor: ${esc(it.monitoring || '')}</li>`)}</ul>
  ${(ai.medications || []).length ? `<h2>Medications</h2><ul>${list(ai.medications, (m) => `<li><b>${esc(m.name)}</b> ${esc(m.dose || '')} ${esc(m.route || '')} ${m.notes ? '— ' + esc(m.notes) : ''}</li>`)}</ul>` : ''}
  ${(ai.redFlags || []).length ? `<h2>Red Flags — Escalate</h2><ul>${list(ai.redFlags, (r) => `<li>${esc(r)}</li>`)}</ul>` : ''}
  <div class="foot">${esc(ai.safetyNotice || 'Verify all medications, doses and escalation with your senior/RN.')} · Generated by NurseCare on ${new Date().toLocaleString()}</div>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) { toast.error('Please allow pop-ups to download the PDF'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 500)
}

function AIResults({ ai, patient, generatedAt }) {
  const copyHandover = async () => {
    try {
      await navigator.clipboard.writeText(buildHandoverText(patient, ai))
      toast.success('Handover copied to clipboard')
    } catch (e) { toast.error('Could not copy') }
  }
  return (
    <div className="space-y-4">
      <DeteriorationAlert ew={ai.earlyWarning} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{generatedAt ? `Generated ${new Date(generatedAt).toLocaleString()}` : ''}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2" onClick={copyHandover}><Copy className="h-4 w-4" /> Copy handover</Button>
          <Button size="sm" className="gap-2" onClick={() => downloadHandoverPDF(patient, ai)}><Download className="h-4 w-4" /> Download PDF</Button>
        </div>
      </div>

      {ai.patientSummary && (
        <Card className="bg-accent/40 border-primary/20">
          <CardContent className="pt-4">
            <p className="text-sm leading-relaxed">{ai.patientSummary}</p>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="priorities">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="priorities" className="gap-1.5"><ListChecks className="h-4 w-4" /><span className="hidden sm:inline">Priorities</span></TabsTrigger>
          <TabsTrigger value="interventions" className="gap-1.5"><ClipboardCheck className="h-4 w-4" /><span className="hidden sm:inline">Care</span></TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5"><Clock className="h-4 w-4" /><span className="hidden sm:inline">Timeline</span></TabsTrigger>
          <TabsTrigger value="meds" className="gap-1.5"><Pill className="h-4 w-4" /><span className="hidden sm:inline">Meds</span></TabsTrigger>
          <TabsTrigger value="isbar" className="gap-1.5"><ClipboardList className="h-4 w-4" /><span className="hidden sm:inline">ISBAR</span></TabsTrigger>
        </TabsList>

        {/* Priorities */}
        <TabsContent value="priorities" className="mt-4 space-y-3">
          {(ai.priorities || []).map((p, i) => {
            const u = URGENCY[p.urgency] || URGENCY.routine
            return (
              <Card key={i}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{p.rank || i + 1}</div>
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{p.priority}</span>
                        <Badge variant="outline" className={u.cls}>{u.label}</Badge>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{p.rationale}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </TabsContent>

        {/* Interventions */}
        <TabsContent value="interventions" className="mt-4 space-y-3">
          {(ai.interventions || []).map((it, i) => (
            <Card key={i}>
              <CardContent className="pt-4 space-y-2">
                <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> {it.intervention}</p>
                <div className="grid gap-2 sm:grid-cols-3 text-sm">
                  <div><span className="text-xs font-medium text-muted-foreground">Frequency</span><p>{it.frequency || '\u2014'}</p></div>
                  <div><span className="text-xs font-medium text-muted-foreground">Monitor</span><p>{it.monitoring || '\u2014'}</p></div>
                  <div><span className="text-xs font-medium text-muted-foreground">Rationale</span><p>{it.rationale || '\u2014'}</p></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline" className="mt-4">
          <Card><CardContent className="pt-4">
            <VitalsTimeline vitals={ai.vitalsTimeline} meds={ai.medicationTimes} />
          </CardContent></Card>
        </TabsContent>

        {/* Meds */}
        <TabsContent value="meds" className="mt-4 space-y-3">
          {(ai.medications || []).length === 0 && <p className="text-sm text-muted-foreground">No medications identified in the documents.</p>}
          {(ai.medications || []).map((m, i) => (
            <Card key={i}>
              <CardContent className="pt-4">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{m.name}</span>
                  {m.dose && <Badge variant="secondary">{m.dose}</Badge>}
                  {m.route && <Badge variant="outline">{m.route}</Badge>}
                </div>
                {m.notes && <p className="mt-1 text-sm text-muted-foreground">{m.notes}</p>}
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* ISBAR */}
        <TabsContent value="isbar" className="mt-4">
          <Card>
            <CardContent className="pt-4 space-y-3">
              {[
                ['I', 'Identify', ai.isbar?.identify],
                ['S', 'Situation', ai.isbar?.situation],
                ['B', 'Background', ai.isbar?.background],
                ['A', 'Assessment', ai.isbar?.assessment],
                ['R', 'Recommendation', ai.isbar?.recommendation],
              ].map(([letter, label, val]) => (
                <div key={letter} className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary font-bold text-primary-foreground">{letter}</div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                    <p className="text-sm">{val || '\u2014'}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {(ai.redFlags || []).length > 0 && (
        <Card className="border-red-200 bg-red-50/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-red-700"><AlertTriangle className="h-4 w-4" /> Red flags — escalate immediately</CardTitle></CardHeader>
          <CardContent><ul className="list-disc space-y-1 pl-5 text-sm text-red-800">{ai.redFlags.map((r, i) => <li key={i}>{r}</li>)}</ul></CardContent>
        </Card>
      )}

      {(ai.newGradTips || []).length > 0 && (
        <Card className="border-amber-200 bg-amber-50/60">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-amber-700"><Lightbulb className="h-4 w-4" /> New grad tips</CardTitle></CardHeader>
          <CardContent><ul className="list-disc space-y-1 pl-5 text-sm text-amber-900">{ai.newGradTips.map((t, i) => <li key={i}>{t}</li>)}</ul></CardContent>
        </Card>
      )}

      {ai.safetyNotice && (
        <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
          <ShieldAlert className="h-4 w-4 shrink-0" /> {ai.safetyNotice}
        </div>
      )}
    </div>
  )
}

/* ------------------------ Patient Detail ------------------------ */
function PatientDetail({ patient, onBack, refresh, onDelete }) {
  const [busy, setBusy] = useState(false)
  const [generating, setGenerating] = useState(false)

  const uploadFiles = async (files, category) => {
    setBusy(true)
    try {
      const documents = []
      for (const f of files) {
        if (f.size > 12 * 1024 * 1024) { toast.error(`${f.name} is too large (max 12MB)`); continue }
        const dataUrl = await fileToDataUrl(f)
        documents.push({ name: f.name, category, kind: 'file', mimeType: f.type, dataUrl })
      }
      if (!documents.length) return
      await api(`/patients/${patient.id}/documents`, { method: 'POST', body: JSON.stringify({ documents }) })
      toast.success(`${documents.length} document${documents.length > 1 ? 's' : ''} added`)
      await refresh()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const addNote = async (name, category, textContent) => {
    setBusy(true)
    try {
      await api(`/patients/${patient.id}/documents`, { method: 'POST', body: JSON.stringify({ documents: [{ name, category, kind: 'text', textContent }] }) })
      toast.success('Note saved')
      await refresh()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const deleteDoc = async (docId) => {
    try {
      await api(`/patients/${patient.id}/documents/${docId}`, { method: 'DELETE' })
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      await api(`/patients/${patient.id}/generate`, { method: 'POST' })
      toast.success('Nursing care plan generated')
      await refresh()
    } catch (e) { toast.error(e.message) } finally { setGenerating(false) }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2 -ml-2"><ArrowLeft className="h-4 w-4" /> Back to shift</Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="ghost" className="gap-2 text-muted-foreground hover:text-destructive"><Trash2 className="h-4 w-4" /> Discharge</Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Discharge {patient.name}?</AlertDialogTitle>
              <AlertDialogDescription>This removes the patient and all uploaded documents from your shift. This cannot be undone.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => onDelete(patient.id)}>Discharge</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Header */}
      <Card className="border-t-4 border-t-primary">
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold tracking-tight">{patient.name}</h2>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                {patient.bed && <span className="inline-flex items-center gap-1"><BedDouble className="h-4 w-4" /> {patient.bed}</span>}
                {patient.age && <span className="inline-flex items-center gap-1"><User className="h-4 w-4" /> {patient.age} years</span>}
              </div>
              {patient.diagnosis && <p className="mt-2 max-w-2xl text-sm">{patient.diagnosis}</p>}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Left: docs */}
        <div className="space-y-4 lg:col-span-2">
          <UploadPanel onUploadFiles={uploadFiles} onAddNote={addNote} busy={busy} />
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Uploaded documents ({patient.documents?.length || 0})</h3>
            <DocumentList documents={patient.documents} onDelete={deleteDoc} />
          </div>
        </div>

        {/* Right: AI */}
        <div className="space-y-4 lg:col-span-3">
          <Card className="bg-gradient-to-br from-primary to-teal-600 text-primary-foreground">
            <CardContent className="flex flex-wrap items-center justify-between gap-3 py-5">
              <div>
                <p className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5" /> AI Nursing Cares</p>
                <p className="text-sm text-primary-foreground/80">Reads every document and builds priorities, interventions & ISBAR.</p>
              </div>
              <Button size="lg" variant="secondary" onClick={generate} disabled={generating} className="gap-2">
                {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</> : <><Sparkles className="h-4 w-4" /> {patient.aiOutput ? 'Regenerate' : 'Generate'}</>}
              </Button>
            </CardContent>
          </Card>

          {generating && (
            <Card><CardContent className="py-10 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm font-medium">Reading documents & preparing your care plan…</p>
              <p className="text-xs text-muted-foreground">This can take 15–40 seconds for detailed notes.</p>
            </CardContent></Card>
          )}

          {!generating && patient.aiOutput && <AIResults ai={patient.aiOutput} patient={patient} generatedAt={patient.aiGeneratedAt} />}

          {!generating && !patient.aiOutput && (
            <Card><CardContent className="py-12 text-center">
              <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-accent"><Sparkles className="h-7 w-7 text-primary" /></div>
              <p className="font-medium">No care plan yet</p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">Add the patient’s documents on the left, then tap <b>Generate</b> to get your nursing cares, priorities and ISBAR handover.</p>
            </CardContent></Card>
          )}
        </div>
      </div>
    </div>
  )
}

/* ------------------------ Main App ------------------------ */
function App() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)

  const load = useCallback(async () => {
    try {
      const data = await api('/patients')
      setPatients(data)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (typeof window !== 'undefined' && !localStorage.getItem('nursecare_seen_tutorial')) {
      setTutorialOpen(true)
      localStorage.setItem('nursecare_seen_tutorial', '1')
    }
  }, [])

  const addPatient = async (form) => {
    const p = await api('/patients', { method: 'POST', body: JSON.stringify(form) })
    setPatients((prev) => [...prev, p])
    toast.success(`${p.name} added to your shift`)
  }

  const deletePatient = async (id) => {
    try {
      await api(`/patients/${id}`, { method: 'DELETE' })
      setPatients((prev) => prev.filter((p) => p.id !== id))
      setSelectedId(null)
      toast.success('Patient discharged')
    } catch (e) { toast.error(e.message) }
  }

  const selected = patients.find((p) => p.id === selectedId)

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent/30 to-background">
      <TutorialDialog open={tutorialOpen} onOpenChange={setTutorialOpen} />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight">NurseCare</h1>
              <p className="text-[11px] text-muted-foreground">AI care plans for new grads</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setTutorialOpen(true)}>
            <BookOpen className="h-4 w-4" /> Tutorial
          </Button>
        </div>
      </header>

      <main className="container py-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : selected ? (
          <PatientDetail
            patient={selected}
            onBack={() => setSelectedId(null)}
            refresh={load}
            onDelete={deletePatient}
          />
        ) : (
          <>
            {/* Shift banner */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold tracking-tight">Your shift</h2>
                <p className="text-sm text-muted-foreground">{patients.length} of {MAX_PATIENTS} patients · tap a patient to manage documents & generate cares</p>
              </div>
              <AddPatientDialog onAdd={addPatient} disabled={patients.length >= MAX_PATIENTS} />
            </div>

            {patients.length === 0 ? (
              <Card className="overflow-hidden">
                <div className="grid md:grid-cols-2">
                  <div className="flex flex-col justify-center p-8">
                    <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent"><GraduationCap className="h-6 w-6 text-primary" /></div>
                    <h3 className="text-xl font-bold">Start your shift</h3>
                    <p className="mt-2 text-sm text-muted-foreground">Add your first patient, upload their care plan, medications, vitals and allied health notes, and let NurseCare generate your nursing cares, priorities and ISBAR handover.</p>
                    <div className="mt-4"><AddPatientDialog onAdd={addPatient} disabled={false} /></div>
                  </div>
                  <div className="relative min-h-[220px]">
                    <img src={HERO_IMG} alt="Nurse" className="absolute inset-0 h-full w-full object-cover" />
                  </div>
                </div>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {patients.map((p, i) => (
                  <PatientCard key={p.id} patient={p} index={i} onOpen={setSelectedId} />
                ))}
                {Array.from({ length: MAX_PATIENTS - patients.length }).map((_, i) => (
                  <AddPatientDialog
                    key={`empty-${i}`}
                    onAdd={addPatient}
                    disabled={false}
                    trigger={
                      <button className="flex min-h-[168px] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                        <Plus className="h-6 w-6" />
                        <span className="text-sm font-medium">Add patient</span>
                      </button>
                    }
                  />
                ))}
              </div>
            )}

            <div className="mt-8 flex items-start gap-2 rounded-lg border bg-muted/40 p-4 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span><b>Clinical safety:</b> NurseCare is a study and shift-prep aid for new graduate nurses. It does not replace clinical judgement. Always verify medications, doses, allergies and any escalation with your senior nurse or the treating team.</span>
            </div>
          </>
        )}
      </main>
    </div>
  )
}

export default App
