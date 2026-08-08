'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
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
  TrendingDown, Minus, Gauge, Siren, Volume2, Square, LayoutGrid,
  Dumbbell, Apple, UserRound, CalendarClock, GripVertical, Users, ArrowDownWideNarrow, Printer, Search, Camera,
} from 'lucide-react'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Progress } from '@/components/ui/progress'
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator } from '@/components/ui/dropdown-menu'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip, ResponsiveContainer, Legend,
} from 'recharts'

const HERO_IMG = 'https://images.pexels.com/photos/4021772/pexels-photo-4021772.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940'

const CATEGORIES = {
  careplan: { label: 'Care Plan', icon: ClipboardList, color: 'text-teal-600' },
  medication: { label: 'Medications', icon: Pill, color: 'text-fuchsia-600' },
  vitals: { label: 'Vital Signs', icon: Activity, color: 'text-rose-600' },
  doctor: { label: 'Doctor Notes', icon: UserRound, color: 'text-blue-600' },
  physiotherapist: { label: 'Physiotherapist', icon: Dumbbell, color: 'text-orange-600' },
  nutritionist: { label: 'Nutritionist / Dietitian', icon: Apple, color: 'text-green-600' },
  allied_health: { label: 'Allied Health (other)', icon: HeartPulse, color: 'text-indigo-600' },
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

// Upload a single document with real upload-progress reporting (XHR — fetch has no upload progress)
function uploadDocument(patientId, doc, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api/patients/${patientId}/documents`)
    xhr.setRequestHeader('Content-Type', 'application/json')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let data = {}
      try { data = JSON.parse(xhr.responseText) } catch {}
      if (xhr.status >= 200 && xhr.status < 300) resolve(data)
      else reject(new Error(data.error || 'Upload failed'))
    }
    xhr.onerror = () => reject(new Error('Network error during upload'))
    xhr.send(JSON.stringify({ documents: [doc] }))
  })
}

function timeAgo(dateStr) {
  if (!dateStr) return null
  const s = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000)
  if (s < 60) return 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ${m % 60}m ago`
  return `${Math.floor(h / 24)}d ago`
}
function isStale(dateStr, hours = 4) {
  if (!dateStr) return false
  return Date.now() - new Date(dateStr).getTime() > hours * 3600 * 1000
}
function parseClock(str) {
  if (!str) return null
  const m = String(str).match(/\b(\d{1,2}):?(\d{2})\b/)
  if (!m) return null
  const h = parseInt(m[1], 10), mn = parseInt(m[2], 10)
  if (h > 23 || mn > 59) return null
  return h * 60 + mn
}
function dueStatus(timeStr) {
  const t = parseClock(timeStr)
  if (t == null) return null
  const now = new Date()
  const cur = now.getHours() * 60 + now.getMinutes()
  const delta = t - cur
  if (delta < 0 && delta >= -120) return 'overdue'
  if (delta >= 0 && delta <= 60) return 'soon'
  return null
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
function PatientForm({ onAdd, reload, onSuccess, submitLabel = 'Add patient' }) {
  const [form, setForm] = useState({ name: '', bed: '', age: '', diagnosis: '' })
  const [saving, setSaving] = useState(false)
  const [category, setCategory] = useState('careplan')
  const [files, setFiles] = useState([])

  const submit = async () => {
    if (!form.name.trim()) { toast.error('Please enter a patient name'); return }
    setSaving(true)
    try {
      const p = await onAdd(form)
      if (files.length && p?.id) {
        let uploaded = 0
        for (const f of files) {
          if (f.size > 25 * 1024 * 1024) { toast.error(`${f.name} is too large (max 25MB)`); continue }
          const dataUrl = await fileToDataUrl(f)
          await api(`/patients/${p.id}/documents`, { method: 'POST', body: JSON.stringify({ documents: [{ name: f.name, category, kind: 'file', mimeType: f.type, dataUrl }] }) })
          uploaded++
        }
        if (uploaded) {
          toast.success(`${uploaded} document${uploaded > 1 ? 's' : ''} attached`)
          if (reload) await reload()
        }
      }
      setForm({ name: '', bed: '', age: '', diagnosis: '' })
      setFiles([])
      setCategory('careplan')
      if (onSuccess) onSuccess(p)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }

  return (
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
      <div className="space-y-1.5 rounded-lg border bg-muted/30 p-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Attach a document (optional)</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORIES).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <label className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-2.5 text-sm transition-colors hover:bg-accent/50">
          <FileUp className="h-4 w-4 shrink-0 text-primary" />
          <span className="truncate">{files.length ? `${files.length} file${files.length > 1 ? 's' : ''} selected` : 'Choose PDF or image to upload'}</span>
          <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        </label>
      </div>
      <div className="flex justify-end pt-1">
        <Button onClick={submit} disabled={saving} className="gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin" />} {submitLabel}
        </Button>
      </div>
    </div>
  )
}

function CameraCapture({ onCapture, category }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  const videoRef = useRef(null)
  const streamRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    const start = async () => {
      setError('')
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera')
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) { videoRef.current.srcObject = stream; try { await videoRef.current.play() } catch {} }
      } catch (e) {
        setError('Camera not available on this device. Please use “Choose files” to upload a photo instead.')
      }
    }
    const stop = () => { if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null } }
    if (open) start(); else stop()
    return () => { cancelled = true; stop() }
  }, [open])

  const capture = () => {
    const v = videoRef.current
    if (!v || !v.videoWidth) { toast.error('Camera not ready yet'); return }
    const canvas = document.createElement('canvas')
    canvas.width = v.videoWidth
    canvas.height = v.videoHeight
    canvas.getContext('2d').drawImage(v, 0, 0, canvas.width, canvas.height)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
    const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    onCapture({ name: `Photo ${stamp}.jpg`, category, kind: 'file', mimeType: 'image/jpeg', dataUrl })
    toast.success('Photo captured')
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2"><Camera className="h-4 w-4 text-primary" /> Take a picture</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-primary" /> Take a picture</DialogTitle>
          <DialogDescription>Point the camera at the document, chart or wound and capture a clear photo.</DialogDescription>
        </DialogHeader>
        {error ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{error}</div>
        ) : (
          <video ref={videoRef} playsInline muted className="max-h-[55vh] w-full rounded-lg border bg-black" />
        )}
        <DialogFooter>
          <Button onClick={capture} disabled={!!error} className="gap-2"><Camera className="h-4 w-4" /> Capture photo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function LandingUpload({ onSubmit }) {
  const [category, setCategory] = useState('careplan')
  const [docs, setDocs] = useState([])
  const [submitting, setSubmitting] = useState(false)

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || [])
    const next = []
    for (const f of files) {
      if (f.size > 25 * 1024 * 1024) { toast.error(`${f.name} is too large (max 25MB)`); continue }
      const dataUrl = await fileToDataUrl(f)
      next.push({ name: f.name, category, kind: 'file', mimeType: f.type, dataUrl })
    }
    if (next.length) setDocs((prev) => [...prev, ...next])
  }

  const submit = async () => {
    if (!docs.length) { toast.error('Add at least one document or photo first'); return }
    setSubmitting(true)
    try { await onSubmit(docs) } finally { setSubmitting(false) }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Document category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(CATEGORIES).map(([k, v]) => (<SelectItem key={k} value={k}>{v.label}</SelectItem>))}
          </SelectContent>
        </Select>
      </div>

      <label className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-border p-5 text-center transition-colors hover:bg-accent/50">
        <FileUp className="h-6 w-6 text-primary" />
        <span className="text-sm font-medium">Choose files to upload</span>
        <span className="text-xs text-muted-foreground">PDF, JPG or PNG · multiple allowed</span>
        <input type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
      </label>

      <CameraCapture category={category} onCapture={(doc) => setDocs((prev) => [...prev, doc])} />

      {docs.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{docs.length} document{docs.length > 1 ? 's' : ''} ready</p>
          {docs.map((d, i) => {
            const cat = CATEGORIES[d.category] || CATEGORIES.other
            const Icon = cat.icon
            return (
              <div key={i} className="flex items-center gap-2 rounded-md border bg-card p-2 text-sm">
                <Icon className={`h-4 w-4 shrink-0 ${cat.color}`} />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="text-[11px] text-muted-foreground">{cat.label}</span>
                <button onClick={() => setDocs((prev) => prev.filter((_, x) => x !== i))} className="text-muted-foreground hover:text-destructive" aria-label="Remove"><X className="h-4 w-4" /></button>
              </div>
            )
          })}
        </div>
      )}

      <Button className="w-full gap-2" onClick={submit} disabled={submitting || !docs.length}>
        {submitting ? <><Loader2 className="h-4 w-4 animate-spin" /> Uploading…</> : <><Sparkles className="h-4 w-4" /> Upload & continue</>}
      </Button>
    </div>
  )
}

function WelcomeLanding({ onSubmit, onSample, onContinue, count }) {
  return (
    <Card className="mx-auto max-w-lg overflow-hidden">
      <div className="relative h-28 w-full">
        <img src={HERO_IMG} alt="Nurse" className="h-full w-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-primary/85 to-primary/25" />
        <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
          <FileUp className="h-5 w-5" />
          <span className="text-lg font-bold tracking-tight">Upload documents</span>
        </div>
      </div>
      <CardContent className="pt-5">
        {count > 0 && (
          <button onClick={onContinue} className="mb-3 inline-flex items-center gap-1 text-sm text-primary hover:underline"><ArrowLeft className="h-4 w-4" /> Back to my shift ({count})</button>
        )}
        <p className="mb-4 text-sm text-muted-foreground">Upload a patient’s documents — snap a photo or choose a PDF/image. NurseCare creates the patient and takes you straight to <b>Populate</b>.</p>
        <LandingUpload onSubmit={onSubmit} />
        <div className="relative my-4"><Separator /><span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or</span></div>
        <Button variant="outline" className="w-full gap-2" onClick={() => onSample()}><Sparkles className="h-4 w-4 text-primary" /> Try a sample patient (ready-made care plan)</Button>
        {count > 0 && <Button className="mt-3 w-full gap-2" onClick={onContinue}>Continue to my shift ({count})</Button>}
      </CardContent>
    </Card>
  )
}

function AddPatientDialog({ onAdd, disabled, trigger, reload }) {
  const [open, setOpen] = useState(false)
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
        <PatientForm onAdd={onAdd} reload={reload} onSuccess={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------ Patient Card ------------------------ */
function PatientCard({ patient, index, onOpen, onPopulate, onWorsen, onImprove, generating, worsening, improving, onDragStart, onDragOver, onDrop, dragging }) {
  const docCount = patient.documents?.length || 0
  const hasAI = !!patient.aiOutput
  const ew = patient.aiOutput?.earlyWarning
  const riskBorder = ew
    ? (ew.riskLevel === 'high' ? 'border-t-red-500' : ew.riskLevel === 'medium' ? 'border-t-amber-500' : 'border-t-emerald-500')
    : 'border-t-primary/70'
  return (
    <Card
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => { e.preventDefault(); onDragOver(index) }}
      onDrop={() => onDrop(index)}
      onClick={() => onOpen(patient.id)}
      className={`cursor-pointer transition-all hover:shadow-lg hover:-translate-y-0.5 border-t-4 ${riskBorder} ${dragging ? 'opacity-50 ring-2 ring-primary' : ''}`}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <GripVertical className="h-4 w-4 shrink-0 cursor-grab text-muted-foreground/50" onClick={(e) => e.stopPropagation()} />
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
          {ew ? (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${riskBadgeCls(ew.riskLevel)}`}>
              <TrendIcon trend={ew.trend} className="h-3 w-3" /> {ew.riskLevel} risk
            </span>
          ) : hasAI
            ? <Badge className="gap-1 bg-emerald-100 text-emerald-700 hover:bg-emerald-100"><CheckCircle2 className="h-3 w-3" /> Ready</Badge>
            : <Badge variant="secondary">New</Badge>}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-sm text-muted-foreground line-clamp-2 min-h-[2.5rem]">
          {patient.diagnosis || 'No diagnosis recorded yet.'}
        </p>
        {ew && (ew.priorities || patient.aiOutput?.priorities?.length) ? (
          <p className="mt-1 truncate text-xs text-primary">Top: {patient.aiOutput.priorities?.[0]?.priority}</p>
        ) : null}
        <Separator className="my-3" />
        <div className="flex items-center justify-between gap-2">
          <div className="flex flex-col gap-0.5">
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3.5 w-3.5" /> {docCount} doc{docCount !== 1 ? 's' : ''}</span>
            {patient.aiGeneratedAt && (
              <span className={`inline-flex items-center gap-1 text-[11px] ${isStale(patient.aiGeneratedAt) ? 'font-medium text-amber-600' : 'text-muted-foreground'}`}>
                <Clock className="h-3 w-3" /> {isStale(patient.aiGeneratedAt) ? 'stale · ' : ''}{timeAgo(patient.aiGeneratedAt)}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {patient.isSample && hasAI && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-emerald-600 hover:text-emerald-700" title="Simulate recovery (demo)" disabled={improving} onClick={(e) => { e.stopPropagation(); onImprove && onImprove(patient.id) }}>
                {improving ? <Loader2 className="h-4 w-4 animate-spin" /> : <TrendingDown className="h-4 w-4" />}
              </Button>
            )}
            {patient.isSample && hasAI && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600 hover:text-red-600" title="Simulate deterioration (demo)" disabled={worsening} onClick={(e) => { e.stopPropagation(); onWorsen && onWorsen(patient.id) }}>
                {worsening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Siren className="h-4 w-4" />}
              </Button>
            )}
            {hasAI && (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground" title="Print / PDF this care plan" onClick={(e) => { e.stopPropagation(); downloadHandoverPDF(patient, patient.aiOutput) }}>
                <Printer className="h-4 w-4" />
              </Button>
            )}
            <Button
              size="sm"
              variant={hasAI ? 'outline' : 'default'}
              className="h-8 gap-1.5"
              disabled={generating}
              onClick={(e) => { e.stopPropagation(); onPopulate(patient.id) }}
            >
              {generating ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Populating…</> : <><Sparkles className="h-3.5 w-3.5" /> {hasAI ? 'Update' : 'Populate'}</>}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

/* ------------------------ Upload Panel ------------------------ */
function UploadPanel({ onUploadFiles, onAddNote, busy, progress }) {
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

        {progress && (
          <div className="space-y-1.5 rounded-lg border bg-accent/40 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 truncate font-medium"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Uploading {progress.name}</span>
              <span className="tabular-nums text-muted-foreground">{progress.pct}%</span>
            </div>
            <Progress value={progress.pct} className="h-2" />
            {progress.index && progress.total > 1 && (
              <p className="text-[11px] text-muted-foreground">File {progress.index} of {progress.total}</p>
            )}
          </div>
        )}

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
function DocumentList({ documents, onDelete, onOpen }) {
  if (!documents?.length) {
    return (
      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        No documents yet. Add the care plan, meds, vitals, doctor & allied health notes above.
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
            <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(d)}>
              <div className="rounded-md bg-accent p-2"><Icon className={`h-4 w-4 ${cat.color}`} /></div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium hover:text-primary">{d.name}</p>
                <p className="text-xs text-muted-foreground">{cat.label} · {d.kind === 'text' ? 'Note' : (d.mimeType === 'application/pdf' ? 'PDF' : 'Image')} · tap to open</p>
              </div>
            </button>
            <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={() => onDelete(d.id)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )
      })}
    </div>
  )
}

function DocViewer({ open, onOpenChange, documents, currentIndex, setCurrentIndex, patientId }) {
  const d = documents[currentIndex]
  if (!d) return null
  const cat = CATEGORIES[d.category] || CATEGORIES.other
  const Icon = cat.icon
  const contentUrl = d.dataUrl || (patientId ? `/api/patients/${patientId}/documents/${d.id}/content` : null)
  let preview
  if (d.kind === 'text') {
    preview = <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg border bg-muted/40 p-4 text-sm leading-relaxed">{d.textContent || '(empty note)'}</pre>
  } else if (d.mimeType && d.mimeType.startsWith('image/')) {
    preview = <div className="flex max-h-[60vh] items-center justify-center overflow-auto rounded-lg border bg-muted/30 p-2"><img src={contentUrl} alt={d.name} className="max-h-[58vh] w-auto rounded" /></div>
  } else if (d.mimeType === 'application/pdf') {
    preview = (
      <div className="space-y-2">
        <iframe src={contentUrl} title={d.name} className="h-[60vh] w-full rounded-lg border" />
        <a href={contentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline"><Download className="h-3 w-3" /> Open PDF in new tab</a>
      </div>
    )
  } else {
    preview = <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">Preview not available for this file type.</div>
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Icon className={`h-5 w-5 ${cat.color}`} /> {d.name}</DialogTitle>
          <DialogDescription>{cat.label} · document {currentIndex + 1} of {documents.length}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-3">{preview}</div>
          <div className="max-h-[60vh] space-y-1.5 overflow-auto md:col-span-1">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">All documents</p>
            {documents.map((doc, i) => {
              const c = CATEGORIES[doc.category] || CATEGORIES.other
              const DIcon = c.icon
              return (
                <button key={doc.id} onClick={() => setCurrentIndex(i)} className={`flex w-full items-center gap-2 rounded-md border p-2 text-left text-xs transition-colors ${i === currentIndex ? 'border-primary bg-accent' : 'hover:bg-muted'}`}>
                  <DIcon className={`h-3.5 w-3.5 shrink-0 ${c.color}`} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{doc.name}</span>
                    <span className="block text-muted-foreground">{c.label}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
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

function vnum(v) {
  if (v == null) return null
  const m = String(v).match(/-?\d+(\.\d+)?/)
  return m ? parseFloat(m[0]) : null
}
function parseVitalsSeries(vitals) {
  return (vitals || []).map((v) => {
    const bp = v.bp ? String(v.bp).split('/') : []
    return {
      time: v.time || '',
      HR: vnum(v.hr),
      RR: vnum(v.rr),
      SpO2: vnum(v.spo2),
      Temp: vnum(v.temp),
      SysBP: bp.length ? vnum(bp[0]) : null,
    }
  })
}
function VitalsTrendChart({ vitals }) {
  const data = parseVitalsSeries(vitals)
  const hasData = data.length >= 2 && data.some((d) => d.HR || d.RR || d.SpO2 || d.SysBP)
  if (!hasData) return null
  return (
    <div className="mb-4">
      <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><TrendingUp className="h-4 w-4 text-primary" /> Vitals trend</h4>
      <div className="rounded-lg border bg-card p-3" style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 12, left: -12, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="time" fontSize={11} tickLine={false} />
            <YAxis fontSize={11} tickLine={false} width={34} />
            <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Line type="monotone" dataKey="HR" stroke="hsl(var(--chart-1))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="SysBP" name="Sys BP" stroke="hsl(var(--chart-3))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="RR" stroke="hsl(var(--chart-4))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
            <Line type="monotone" dataKey="SpO2" name="SpO2" stroke="hsl(var(--chart-2))" strokeWidth={2} dot={{ r: 3 }} connectNulls />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function EWTrendChart({ history }) {
  if (!history || history.length < 2) return null
  const data = history.map((h) => ({
    name: new Date(h.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    Risk: h.riskValue ?? 0,
    Score: h.score,
  }))
  const riskLabel = { 1: 'Low', 2: 'Med', 3: 'High' }
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Warning score trend this shift</CardTitle></CardHeader>
      <CardContent style={{ height: 190 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 5, right: 14, left: -18, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="name" fontSize={11} tickLine={false} />
            <YAxis domain={[0, 3]} ticks={[1, 2, 3]} tickFormatter={(v) => riskLabel[v] || ''} width={42} fontSize={11} tickLine={false} />
            <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={(val, name) => name === 'Risk' ? (riskLabel[val] || val) : val} />
            <Line type="stepAfter" name="Risk" dataKey="Risk" stroke="hsl(var(--chart-1))" strokeWidth={2.5} dot={{ r: 3 }} />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}

function VitalsTimeline({ vitals = [], meds = [], care = [], careDone = {}, onToggleCare }) {
  const hasVitals = vitals.length > 0
  const hasMeds = meds.length > 0
  const hasCare = care.length > 0
  const doneCount = care.filter((_, i) => careDone?.[i]).length
  if (!hasVitals && !hasMeds && !hasCare) {
    return <p className="text-sm text-muted-foreground">No time-stamped vitals, care tasks or medication times were found in the documents.</p>
  }
  const vitalChip = (label, val) => val ? (
    <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs">
      <span className="font-medium text-muted-foreground mr-1">{label}</span>{val}
    </span>
  ) : null
  return (
    <div className="space-y-5">
      {hasCare && (
        <div>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4 text-primary" /> Care schedule — when to complete each care
            <span className="ml-auto rounded-full bg-accent px-2 py-0.5 text-xs font-medium text-primary">{doneCount}/{care.length} done</span>
          </h4>
          <div className="relative space-y-2 pl-5">
            <span className="absolute left-1.5 top-1 bottom-1 w-px bg-border" />
            {care.map((c, i) => {
              const u = URGENCY[c.priority] || URGENCY.routine
              const done = !!careDone?.[i]
              const ds = done ? null : dueStatus(c.time)
              return (
                <div key={i} className="relative">
                  <span className={`absolute -left-[15px] top-2 h-2.5 w-2.5 rounded-full ring-4 ring-background ${done ? 'bg-emerald-500' : ds === 'overdue' ? 'bg-red-500' : ds === 'soon' ? 'bg-amber-500' : 'bg-primary'}`} />
                  <div className={`flex items-start gap-2 rounded-lg border bg-card p-2.5 transition-opacity ${done ? 'opacity-60' : ''} ${ds === 'overdue' ? 'border-red-300 bg-red-50/50' : ds === 'soon' ? 'border-amber-300 bg-amber-50/50' : ''}`}>
                    {onToggleCare && <Checkbox checked={done} onCheckedChange={() => onToggleCare(i)} className="mt-0.5" />}
                    <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-0.5 text-xs font-semibold text-primary"><Clock className="h-3 w-3" /> {c.time || '—'}</span>
                    <span className={`flex-1 text-sm ${done ? 'line-through' : ''}`}>{c.task}</span>
                    {ds === 'soon' && <Badge variant="outline" className="shrink-0 border-amber-200 bg-amber-100 text-amber-700">Due soon</Badge>}
                    {ds === 'overdue' && <Badge variant="outline" className="shrink-0 border-red-200 bg-red-100 text-red-700">Overdue</Badge>}
                    <Badge variant="outline" className={`shrink-0 ${u.cls}`}>{u.label}</Badge>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {hasVitals && <VitalsTrendChart vitals={vitals} />}
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
  const hh = ai.handoverHeader || {}
  if ((hh.alerts || []).length) L.push(`ALERTS: ${hh.alerts.join(' · ')}`)
  if (hh.attendingDoctor && hh.attendingDoctor !== 'Not documented') L.push(`Attending: ${hh.attendingDoctor}`)
  if (hh.background) L.push(`Background: ${hh.background}`)
  L.push('')
  if (ai.earlyWarning) L.push(`EARLY WARNING: Score ${ai.earlyWarning.score ?? 'N/A'} · ${ai.earlyWarning.riskLevel || ''} · trend ${ai.earlyWarning.trend || ''}`)
  if ((ai.criticalActions || []).length) {
    L.push('')
    L.push('CRITICAL NURSING ACTIONS')
    ;(ai.criticalActions || []).forEach((a) => L.push(`[${a.window || 'now'}] ${a.action}${a.rationale ? ' — ' + a.rationale : ''}`))
  }
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
    ;(ai.medications || []).forEach((m) => L.push(`• ${m.name} ${m.dose || ''} ${m.route || ''}${(m.times || []).length ? ' @ ' + m.times.join(', ') : ''} ${m.notes ? '— ' + m.notes : ''}`))
    L.push('')
  }
  if ((ai.careSchedule || []).length) {
    L.push('CARE SCHEDULE')
    ;(ai.careSchedule || []).forEach((c) => L.push(`[${c.time || ''}] ${c.task}`))
    L.push('')
  }
  if ((ai.redFlags || []).length) {
    L.push('RED FLAGS — ESCALATE')
    ;(ai.redFlags || []).forEach((r) => L.push(`! ${r}`))
    L.push('')
  }
  if ((ai.recommendations || []).length) {
    L.push('RECOMMENDATIONS')
    ;(ai.recommendations || []).forEach((r) => L.push(`• ${r}`))
    L.push('')
  }
  if ((ai.outstandingTasks || []).length) {
    L.push('YET TO COMPLETE')
    ;(ai.outstandingTasks || []).forEach((t) => L.push(`[ ] ${t}`))
    L.push('')
  }
  if (ai.safetyNotice) L.push(ai.safetyNotice)
  if (patient.handoverNote && patient.handoverNote.trim()) {
    L.push('')
    L.push('NURSE HANDOVER NOTE')
    L.push(patient.handoverNote.trim())
  }
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
  const hh = ai.handoverHeader || {}
  const alertsHtml = (hh.alerts || []).length ? `<div class="alerts"><b>Alerts:</b> ${(hh.alerts || []).map((a) => `<span class="abadge">${esc(a)}</span>`).join(' ')}</div>` : ''
  const attendHtml = (hh.attendingDoctor && hh.attendingDoctor !== 'Not documented') ? ` · Dr: ${esc(hh.attendingDoctor)}` : ''
  const critHtml = (ai.criticalActions || []).length ? `<h2>Critical Nursing Actions</h2><ul>${list(ai.criticalActions, (a) => `<li><span class="badge">${esc(a.window || 'now')}</span><b>${esc(a.action)}</b>${a.rationale ? ' — ' + esc(a.rationale) : ''}</li>`)}</ul>` : ''
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
    .alerts{margin-top:8px;font-size:12.5px}
    .abadge{display:inline-block;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;border-radius:4px;padding:1px 6px;font-size:11px;margin:2px 2px 0 0}
  </style></head><body>
  <h1>NurseCare Handover</h1>
  <div class="meta"><b>${esc(patient.name)}</b> · ${esc(patient.bed || 'No bed')} · ${esc(patient.age || 'N/A')} yrs${patient.diagnosis ? ' · ' + esc(patient.diagnosis) : ''}${attendHtml}</div>
  ${alertsHtml}
  ${ewHtml}
  ${critHtml}
  <h2>ISBAR</h2>
  <table>${row('Identify', s.identify)}${row('Situation', s.situation)}${row('Background', s.background)}${row('Assessment', s.assessment)}${row('Recommendation', s.recommendation)}</table>
  <h2>Care Priorities</h2>
  <ul>${list(ai.priorities, (p, i) => `<li><span class="badge">${esc((p.urgency || '').toUpperCase())}</span><b>${esc(p.priority)}</b> — ${esc(p.rationale)}</li>`)}</ul>
  <h2>Nursing Interventions</h2>
  <ul>${list(ai.interventions, (it) => `<li><b>${esc(it.intervention)}</b> <i>(${esc(it.frequency || '')})</i> — monitor: ${esc(it.monitoring || '')}</li>`)}</ul>
  ${(ai.medications || []).length ? `<h2>Medications</h2><ul>${list(ai.medications, (m) => `<li><b>${esc(m.name)}</b> ${esc(m.dose || '')} ${esc(m.route || '')} ${(m.times || []).length ? '<i>@ ' + esc((m.times || []).join(', ')) + '</i>' : ''} ${m.notes ? '— ' + esc(m.notes) : ''}</li>`)}</ul>` : ''}
  ${(ai.careSchedule || []).length ? `<h2>Care Schedule</h2><ul>${list(ai.careSchedule, (c) => `<li><span class="badge">${esc(c.time || '')}</span>${esc(c.task)}</li>`)}</ul>` : ''}
  ${(ai.redFlags || []).length ? `<h2>Red Flags — Escalate</h2><ul>${list(ai.redFlags, (r) => `<li>${esc(r)}</li>`)}</ul>` : ''}
  ${(ai.recommendations || []).length ? `<h2>Recommendations</h2><ul>${list(ai.recommendations, (r) => `<li>${esc(r)}</li>`)}</ul>` : ''}
  ${(ai.outstandingTasks || []).length ? `<h2>Yet to Complete</h2><ul>${list(ai.outstandingTasks, (t) => `<li>&#9744; ${esc(t)}</li>`)}</ul>` : ''}
  ${patient.handoverNote && patient.handoverNote.trim() ? `<h2>Nurse Handover Note</h2><div style="white-space:pre-wrap;font-size:13px">${esc(patient.handoverNote)}</div>` : ''}
  <div class="foot">${esc(ai.safetyNotice || 'Verify all medications, doses and escalation with your senior/RN.')} · Generated by NurseCare on ${new Date().toLocaleString()}</div>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) { toast.error('Please allow pop-ups to download the PDF'); return }
  w.document.open()
  w.document.write(html)
  w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 500)
}

function HandoverHeader({ header, patient }) {
  if (!header) return null
  const alerts = header.alerts || []
  const na = (v) => (v && String(v).trim() && String(v).toLowerCase() !== 'not documented') ? v : 'Not documented'
  const rows = [
    ['Age', na(header.age || patient?.age)],
    ['Diagnosis', na(header.diagnosis || patient?.diagnosis)],
    ['Background', na(header.background)],
    ['Attending doctor', na(header.attendingDoctor)],
  ]
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ClipboardList className="h-4 w-4 text-primary" /> Handover sheet</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {alerts.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-semibold text-red-700"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />Alerts:</span>
            {alerts.map((a, i) => (
              <span key={i} className="inline-flex items-center rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{a}</span>
            ))}
          </div>
        )}
        <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
          {rows.map(([label, val]) => (
            <div key={label} className="text-sm">
              <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</span>
              <p>{val}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

function CriticalActions({ actions }) {
  if (!actions || !actions.length) return null
  return (
    <Card className="border-amber-300 bg-amber-50/70">
      <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-amber-800"><Siren className="h-4 w-4" /> Critical nursing actions</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {actions.map((a, i) => (
          <div key={i} className="rounded-lg border border-amber-200 bg-white/70 p-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2 py-0.5 text-xs font-semibold text-white"><Clock className="h-3 w-3" /> {a.window || 'now'}</span>
              <span className="text-sm font-semibold text-amber-900">{a.action}</span>
            </div>
            {a.rationale && <p className="mt-1 text-xs text-amber-800/90">{a.rationale}</p>}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

const DRSABCD_LABELS = [
  ['danger', 'D', 'Danger'],
  ['response', 'R', 'Response'],
  ['sendForHelp', 'S', 'Send for help'],
  ['airway', 'A', 'Airway'],
  ['breathing', 'B', 'Breathing'],
  ['circulation', 'C', 'Circulation'],
  ['disability', 'D', 'Disability'],
  ['exposure', 'E', 'Exposure'],
]

function AssessmentPanel({ ai }) {
  const d = ai.drsabcd
  const dm = ai.dietMobility
  const asmt = ai.assessments
  const lines = ai.linesDevices || []
  const hasAny = d || dm || asmt || lines.length || ai.edd
  if (!hasAny) return <p className="text-sm text-muted-foreground">No assessment details were found in the documents.</p>
  return (
    <div className="space-y-5">
      {d && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><ShieldAlert className="h-4 w-4 text-primary" /> DRSABCD — rapid primary assessment</h4>
          <div className="grid gap-2 sm:grid-cols-2">
            {DRSABCD_LABELS.filter(([k]) => d[k]).map(([k, letter, label]) => (
              <div key={label} className="flex gap-2 rounded-lg border bg-card p-2.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">{letter}</div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
                  <p className="text-sm">{d[k]}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {dm && (dm.diet || dm.mobility || dm.aids) && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Apple className="h-4 w-4 text-green-600" /> Diet & mobility</h4>
          <div className="grid gap-2 sm:grid-cols-3">
            {[['Diet', dm.diet, Apple], ['Mobility', dm.mobility, Dumbbell], ['Aids / assistance', dm.aids, UserRound]].filter(([, v]) => v).map(([label, val, Icon]) => (
              <div key={label} className="rounded-lg border bg-card p-2.5 text-sm">
                <p className="flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground"><Icon className="h-3.5 w-3.5" /> {label}</p>
                <p className="mt-0.5">{val}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {asmt && ((asmt.done || []).length || (asmt.todo || []).length) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Assessments done</h4>
            <ul className="space-y-1.5">
              {(asmt.done || []).length ? asmt.done.map((x, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50/60 p-2 text-sm"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {x}</li>
              )) : <li className="text-xs text-muted-foreground">None recorded.</li>}
            </ul>
          </div>
          <div>
            <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-amber-700"><ListChecks className="h-4 w-4" /> Assessments to do</h4>
            <ul className="space-y-1.5">
              {(asmt.todo || []).length ? asmt.todo.map((x, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50/60 p-2 text-sm"><Clock className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /> {x}</li>
              )) : <li className="text-xs text-muted-foreground">None outstanding.</li>}
            </ul>
          </div>
        </div>
      ) : null}

      {(lines.length > 0 || ai.edd) && (
        <div>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold"><Activity className="h-4 w-4 text-rose-600" /> Infusions, devices & tubes</h4>
          <div className="space-y-2">
            {lines.map((l, i) => (
              <div key={i} className="rounded-lg border bg-card p-2.5">
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="font-semibold">{l.type}</span>
                  {l.site && <Badge variant="outline">{l.site}</Badge>}
                  {l.detail && <span className="text-muted-foreground">{l.detail}</span>}
                </div>
                {l.notes && <p className="mt-1 text-xs text-muted-foreground">{l.notes}</p>}
              </div>
            ))}
            {!lines.length && <p className="text-xs text-muted-foreground">No lines/devices documented.</p>}
          </div>
          {ai.edd && (
            <div className="mt-2 inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm">
              <CalendarClock className="h-4 w-4 text-primary" /> <span className="font-medium">EDD (est. discharge):</span> {ai.edd}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function AIResults({ ai, patient, generatedAt, careDone, onToggleCare }) {
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => () => {
    if (typeof window !== 'undefined' && window.speechSynthesis) window.speechSynthesis.cancel()
  }, [])

  const copyHandover = async () => {
    try {
      await navigator.clipboard.writeText(buildHandoverText(patient, ai))
      toast.success('Handover copied to clipboard')
    } catch (e) { toast.error('Could not copy') }
  }

  const speakISBAR = () => {
    if (typeof window === 'undefined' || !window.speechSynthesis) { toast.error('Voice not supported in this browser'); return }
    if (speaking) { window.speechSynthesis.cancel(); setSpeaking(false); return }
    const s = ai.isbar || {}
    const text = `Handover for ${patient.name || 'the patient'}, ${patient.bed || ''}. Identify. ${s.identify || ''}. Situation. ${s.situation || ''}. Background. ${s.background || ''}. Assessment. ${s.assessment || ''}. Recommendation. ${s.recommendation || ''}.`
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.98
    u.onend = () => setSpeaking(false)
    u.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(u)
    setSpeaking(true)
    toast.success('Reading ISBAR aloud')
  }

  return (
    <div className="space-y-4">
      <DeteriorationAlert ew={ai.earlyWarning} />
      <EWTrendChart history={patient?.ewHistory} />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">{generatedAt ? `Generated ${new Date(generatedAt).toLocaleString()}` : ''}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant={speaking ? 'default' : 'outline'} size="sm" className="gap-2" onClick={speakISBAR}>
            {speaking ? <><Square className="h-4 w-4" /> Stop</> : <><Volume2 className="h-4 w-4" /> Read ISBAR</>}
          </Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={copyHandover}><Copy className="h-4 w-4" /> Copy</Button>
          <Button size="sm" className="gap-2" onClick={() => downloadHandoverPDF(patient, ai)}><Download className="h-4 w-4" /> PDF</Button>
        </div>
      </div>

      {ai.patientSummary && (
        <Card className="bg-accent/40 border-primary/20">
          <CardContent className="pt-4">
            <p className="text-sm leading-relaxed">{ai.patientSummary}</p>
          </CardContent>
        </Card>
      )}

      <HandoverHeader header={ai.handoverHeader} patient={patient} />
      <CriticalActions actions={ai.criticalActions} />

      <Tabs defaultValue="priorities">
        <TabsList className="grid w-full grid-cols-6">
          <TabsTrigger value="priorities" className="gap-1.5"><ListChecks className="h-4 w-4" /><span className="hidden sm:inline">Priorities</span></TabsTrigger>
          <TabsTrigger value="interventions" className="gap-1.5"><ClipboardCheck className="h-4 w-4" /><span className="hidden sm:inline">Care</span></TabsTrigger>
          <TabsTrigger value="assess" className="gap-1.5"><ShieldAlert className="h-4 w-4" /><span className="hidden sm:inline">Assess</span></TabsTrigger>
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
              <CardContent className="pt-4 space-y-3">
                <p className="font-semibold flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> {it.intervention}</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-md bg-muted/40 p-2.5 text-sm">
                    <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Clock className="h-3.5 w-3.5" /> Frequency</span>
                    <p className="mt-0.5">{it.frequency || '\u2014'}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2.5 text-sm">
                    <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Activity className="h-3.5 w-3.5" /> What to monitor</span>
                    <p className="mt-0.5">{it.monitoring || '\u2014'}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2.5 text-sm">
                    <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Gauge className="h-3.5 w-3.5" /> How to monitor</span>
                    <p className="mt-0.5">{it.howToMonitor || '\u2014'}</p>
                  </div>
                  <div className="rounded-md bg-muted/40 p-2.5 text-sm">
                    <span className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><Lightbulb className="h-3.5 w-3.5" /> Why it matters</span>
                    <p className="mt-0.5">{it.rationale || '\u2014'}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        {/* Assess */}
        <TabsContent value="assess" className="mt-4">
          <Card><CardContent className="pt-4">
            <AssessmentPanel ai={ai} />
          </CardContent></Card>
        </TabsContent>

        {/* Timeline */}
        <TabsContent value="timeline" className="mt-4">
          <Card><CardContent className="pt-4">
            <VitalsTimeline vitals={ai.vitalsTimeline} meds={ai.medicationTimes} care={ai.careSchedule} careDone={careDone} onToggleCare={onToggleCare} />
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
                {(m.times || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">Due:</span>
                    {m.times.map((t, ti) => {
                      const ds = dueStatus(t)
                      const cls = ds === 'overdue' ? 'bg-red-100 text-red-700' : ds === 'soon' ? 'bg-amber-100 text-amber-700' : 'bg-fuchsia-100 text-fuchsia-700'
                      return (
                        <span key={ti} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${cls}`}>
                          <Clock className="h-3 w-3" /> {t}{ds === 'soon' ? ' · soon' : ds === 'overdue' ? ' · overdue' : ''}
                        </span>
                      )
                    })}
                  </div>
                )}
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

      {(ai.recommendations || []).length > 0 && (
        <Card className="border-primary/20 bg-accent/30">
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2 text-primary"><ClipboardCheck className="h-4 w-4" /> Recommendations</CardTitle></CardHeader>
          <CardContent><ul className="list-disc space-y-1 pl-5 text-sm">{ai.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul></CardContent>
        </Card>
      )}

      {(ai.outstandingTasks || []).length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><ListChecks className="h-4 w-4 text-primary" /> Yet to complete this shift</CardTitle></CardHeader>
          <CardContent>
            <ul className="space-y-1.5">
              {ai.outstandingTasks.map((t, i) => (
                <li key={i} className="flex items-start gap-2 rounded-md border p-2 text-sm"><Square className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> {t}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

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
function NewObsDialog({ onSubmit }) {
  const [open, setOpen] = useState(false)
  const [v, setV] = useState({ time: '', hr: '', bp: '', rr: '', spo2: '', temp: '' })
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    const now = v.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    const parts = []
    if (v.hr) parts.push(`HR ${v.hr}`)
    if (v.bp) parts.push(`BP ${v.bp}`)
    if (v.rr) parts.push(`RR ${v.rr}`)
    if (v.spo2) parts.push(`SpO2 ${v.spo2}%`)
    if (v.temp) parts.push(`Temp ${v.temp}`)
    if (!parts.length) { toast.error('Enter at least one vital'); return }
    setSaving(true)
    try {
      await onSubmit(`Obs ${now}`, `Obs ${now} ${parts.join(' ')}`)
      setV({ time: '', hr: '', bp: '', rr: '', spo2: '', temp: '' })
      setOpen(false)
    } catch (e) { toast.error(e.message) } finally { setSaving(false) }
  }
  const field = (key, label, ph) => (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input value={v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value })} placeholder={ph} />
    </div>
  )
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2"><Activity className="h-4 w-4" /> New obs</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Record new observations</DialogTitle>
          <DialogDescription>Enter fresh vitals — NurseCare re-reads them and updates the early-warning score.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {field('time', 'Time', 'now')}
          {field('hr', 'Heart rate', 'e.g. 96')}
          {field('bp', 'Blood pressure', 'e.g. 110/70')}
          {field('rr', 'Resp rate', 'e.g. 20')}
          {field('spo2', 'SpO2 %', 'e.g. 94')}
          {field('temp', 'Temp', 'e.g. 37.8')}
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={saving} className="gap-2">{saving && <Loader2 className="h-4 w-4 animate-spin" />} Save & refresh</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HandoverNote({ value, savedAt, onSave }) {
  const [text, setText] = useState(value || '')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setText(value || '') }, [value])
  const dirty = (text || '') !== (value || '')
  const save = async () => { setSaving(true); try { await onSave(text) } finally { setSaving(false) } }
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><StickyNote className="h-4 w-4 text-primary" /> Shift handover note</CardTitle>
        <CardDescription>Your own quick notes for handover. Included in the Handover PDF & pack.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder={'e.g. Family updated. Awaiting bloods at 1600. Prefers to mobilise after lunch\u2026'} />
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-muted-foreground">
            {dirty ? 'Unsaved changes' : (savedAt ? `Last updated ${timeAgo(savedAt)}` : 'Not saved yet')}
          </span>
          <Button size="sm" className="gap-2" onClick={save} disabled={saving || !dirty}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} {dirty ? 'Save note' : 'Saved'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function PatientDetail({ patient, onBack, refresh, onDelete }) {
  const [busy, setBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)
  const autoRef = useRef(true)
  const [viewerOpen, setViewerOpen] = useState(false)
  const [viewIndex, setViewIndex] = useState(0)

  const openDoc = (doc) => {
    const idx = (patient.documents || []).findIndex((x) => x.id === doc.id)
    setViewIndex(idx < 0 ? 0 : idx)
    setViewerOpen(true)
  }

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const v = localStorage.getItem('nursecare_autorefresh')
      const on = v === null ? true : v === '1'
      setAutoRefresh(on); autoRef.current = on
    }
  }, [])

  const toggleAuto = (on) => {
    setAutoRefresh(on); autoRef.current = on
    if (typeof window !== 'undefined') localStorage.setItem('nursecare_autorefresh', on ? '1' : '0')
  }

  const generate = async (silent) => {
    setGenerating(true)
    try {
      await api(`/patients/${patient.id}/generate`, { method: 'POST' })
      toast.success(silent ? 'Cares auto-updated with new document' : 'Nursing care plan generated')
      await refresh()
    } catch (e) { toast.error(e.message) } finally { setGenerating(false) }
  }

  const afterDocChange = async () => {
    await refresh()
    if (autoRef.current) await generate(true)
  }

  const uploadFiles = async (files, category) => {
    setBusy(true)
    try {
      let uploaded = 0
      const valid = files.filter((f) => { if (f.size > 25 * 1024 * 1024) { toast.error(`${f.name} is too large (max 25MB)`); return false } return true })
      for (let i = 0; i < valid.length; i++) {
        const f = valid[i]
        const dataUrl = await fileToDataUrl(f)
        setUploadProgress({ name: f.name, pct: 0, index: i + 1, total: valid.length })
        await uploadDocument(
          patient.id,
          { name: f.name, category, kind: 'file', mimeType: f.type, dataUrl },
          (pct) => setUploadProgress({ name: f.name, pct, index: i + 1, total: valid.length })
        )
        uploaded++
      }
      if (!uploaded) return
      toast.success(`${uploaded} document${uploaded > 1 ? 's' : ''} added`)
      await afterDocChange()
    } catch (e) { toast.error(e.message) } finally { setBusy(false); setUploadProgress(null) }
  }

  const addNote = async (name, category, textContent) => {
    setBusy(true)
    try {
      await api(`/patients/${patient.id}/documents`, { method: 'POST', body: JSON.stringify({ documents: [{ name, category, kind: 'text', textContent }] }) })
      toast.success('Note saved')
      await afterDocChange()
    } catch (e) { toast.error(e.message) } finally { setBusy(false) }
  }

  const deleteDoc = async (docId) => {
    try {
      await api(`/patients/${patient.id}/documents/${docId}`, { method: 'DELETE' })
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const toggleCare = async (idx) => {
    const done = { ...(patient.careDone || {}) }
    done[idx] = !done[idx]
    try {
      await api(`/patients/${patient.id}`, { method: 'PUT', body: JSON.stringify({ careDone: done }) })
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  const addObs = async (name, text) => {
    await api(`/patients/${patient.id}/documents`, { method: 'POST', body: JSON.stringify({ documents: [{ name, category: 'vitals', kind: 'text', textContent: text }] }) })
    toast.success('Obs added — refreshing warning score')
    await refresh()
    generate(true)
  }

  const saveHandoverNote = async (text) => {
    try {
      await api(`/patients/${patient.id}`, { method: 'PUT', body: JSON.stringify({ handoverNote: text }) })
      toast.success('Handover note saved')
      await refresh()
    } catch (e) { toast.error(e.message) }
  }

  return (
    <div className="space-y-5">
      <DocViewer open={viewerOpen} onOpenChange={setViewerOpen} documents={patient.documents || []} currentIndex={viewIndex} setCurrentIndex={setViewIndex} patientId={patient.id} />
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onBack} className="gap-2 -ml-2"><ArrowLeft className="h-4 w-4" /> Back to shift</Button>
        <div className="flex items-center gap-2">
          <NewObsDialog onSubmit={addObs} />
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
          <UploadPanel onUploadFiles={uploadFiles} onAddNote={addNote} busy={busy} progress={uploadProgress} />
          <div>
            <h3 className="mb-2 text-sm font-semibold text-muted-foreground">Uploaded documents ({patient.documents?.length || 0})</h3>
            <DocumentList documents={patient.documents} onDelete={deleteDoc} onOpen={openDoc} />
          </div>
          <HandoverNote value={patient.handoverNote} savedAt={patient.handoverNoteAt} onSave={saveHandoverNote} />
        </div>

        {/* Right: AI */}
        <div className="space-y-4 lg:col-span-3">
          <Card className="bg-gradient-to-br from-primary to-teal-600 text-primary-foreground">
            <CardContent className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-2 text-lg font-semibold"><Sparkles className="h-5 w-5" /> AI Nursing Cares</p>
                  <p className="text-sm text-primary-foreground/80">Reads every document and builds priorities, interventions & ISBAR.</p>
                </div>
                <Button size="lg" variant="secondary" onClick={() => generate(false)} disabled={generating} className="gap-2">
                  {generating ? <><Loader2 className="h-4 w-4 animate-spin" /> Analysing…</> : <><Sparkles className="h-4 w-4" /> {patient.aiOutput ? 'Regenerate' : 'Generate'}</>}
                </Button>
              </div>
              <div className="mt-4 flex items-center gap-2 border-t border-white/20 pt-3">
                <Switch checked={autoRefresh} onCheckedChange={toggleAuto} id="auto-refresh" className="data-[state=checked]:bg-white/90 data-[state=unchecked]:bg-white/30" />
                <label htmlFor="auto-refresh" className="cursor-pointer text-sm text-primary-foreground/90">
                  Auto-refresh cares when I add a document
                </label>
              </div>
            </CardContent>
          </Card>

          {generating && (
            <Card><CardContent className="py-10 text-center">
              <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
              <p className="mt-3 text-sm font-medium">Reading documents & preparing your care plan…</p>
              <p className="text-xs text-muted-foreground">This can take 15–40 seconds for detailed notes.</p>
            </CardContent></Card>
          )}

          {!generating && patient.aiOutput && <AIResults ai={patient.aiOutput} patient={patient} generatedAt={patient.aiGeneratedAt} careDone={patient.careDone} onToggleCare={toggleCare} />}

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

function riskBadgeCls(level) {
  return level === 'high' ? 'bg-red-100 text-red-700'
    : level === 'medium' ? 'bg-amber-100 text-amber-700'
    : level === 'low' ? 'bg-emerald-100 text-emerald-700'
    : 'bg-muted text-muted-foreground'
}

function downloadHandoverPack(patients) {
  const withAI = patients.filter((p) => p.aiOutput)
  if (!withAI.length) { toast.error('No populated patients yet — tap Populate first'); return }
  const section = (p, idx) => {
    const ai = p.aiOutput || {}
    const s = ai.isbar || {}
    const ew = ai.earlyWarning
    const ewHtml = ew ? `<span class="ew ew-${esc(ew.riskLevel)}">EWS ${esc(ew.score)} · ${esc(ew.riskLevel)} · ${esc(ew.trend)}</span>` : ''
    const pri = (ai.priorities || []).slice(0, 4).map((x) => `<li>${esc(x.priority)}</li>`).join('')
    return `<div class="pt">
      <div class="ph"><span class="num">${idx + 1}</span><b>${esc(p.name)}</b> <span class="bed">${esc(p.bed || '')}${p.age ? ' · ' + esc(p.age) + 'y' : ''}</span> ${ewHtml}</div>
      <table>
        <tr><td class="lbl">I</td><td>${esc(s.identify)}</td></tr>
        <tr><td class="lbl">S</td><td>${esc(s.situation)}</td></tr>
        <tr><td class="lbl">B</td><td>${esc(s.background)}</td></tr>
        <tr><td class="lbl">A</td><td>${esc(s.assessment)}</td></tr>
        <tr><td class="lbl">R</td><td>${esc(s.recommendation)}</td></tr>
      </table>
      ${pri ? `<div class="pri"><b>Top priorities:</b><ul>${pri}</ul></div>` : ''}
      ${p.handoverNote && p.handoverNote.trim() ? `<div class="pri"><b>Nurse note:</b><div style="white-space:pre-wrap">${esc(p.handoverNote)}</div></div>` : ''}
    </div>`
  }
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Shift Handover Pack</title>
  <style>
    *{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;box-sizing:border-box}
    body{margin:28px;color:#0f172a}
    h1{font-size:22px;margin:0 0 2px}
    .sub{color:#475569;font-size:13px;margin-bottom:14px}
    .pt{border:1px solid #e2e8f0;border-radius:10px;padding:12px 14px;margin-bottom:12px;page-break-inside:avoid}
    .ph{display:flex;align-items:center;gap:8px;font-size:15px;margin-bottom:8px}
    .num{display:inline-flex;width:22px;height:22px;align-items:center;justify-content:center;border-radius:50%;background:#0d9488;color:#fff;font-size:12px;font-weight:700}
    .bed{color:#64748b;font-size:12px;font-weight:400}
    table{width:100%;border-collapse:collapse;font-size:12.5px}
    td{padding:4px 8px;vertical-align:top;border-bottom:1px solid #eef2f6}
    td.lbl{width:26px;font-weight:700;color:#0f766e}
    .pri{margin-top:8px;font-size:12.5px}
    .pri ul{margin:4px 0;padding-left:18px}
    .ew{margin-left:auto;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
    .ew-low{background:#d1fae5;color:#065f46}.ew-medium{background:#fef3c7;color:#92400e}.ew-high{background:#fee2e2;color:#991b1b}
    .foot{margin-top:16px;font-size:11px;color:#64748b}
  </style></head><body>
  <h1>Shift Handover Pack</h1>
  <div class="sub">${withAI.length} patient${withAI.length > 1 ? 's' : ''} · generated ${new Date().toLocaleString()}</div>
  ${withAI.map(section).join('')}
  <div class="foot">NurseCare — decision support only. Verify medications, doses and escalation with the treating team/RN.</div>
  </body></html>`
  const w = window.open('', '_blank')
  if (!w) { toast.error('Please allow pop-ups to download the pack'); return }
  w.document.open(); w.document.write(html); w.document.close()
  setTimeout(() => { w.focus(); w.print() }, 500)
}

function ShiftBoard({ open, onOpenChange, patients, onOpenPatient }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LayoutGrid className="h-5 w-5 text-primary" /> Shift board</DialogTitle>
          <DialogDescription>All your patients at a glance — early-warning scores and top priorities.</DialogDescription>
        </DialogHeader>
        {patients.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No patients on your shift yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {patients.map((p) => {
              const ew = p.aiOutput?.earlyWarning
              const pri = p.aiOutput?.priorities || []
              return (
                <div key={p.id} className="flex flex-col rounded-lg border bg-card p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{p.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{p.bed || ''}</span>
                  </div>
                  {ew ? (
                    <div className={`mt-2 flex items-center justify-between rounded-md px-2 py-1 text-xs font-semibold ${riskBadgeCls(ew.riskLevel)}`}>
                      <span>EWS {ew.score ?? 'N/A'}</span>
                      <span className="inline-flex items-center gap-1"><TrendIcon trend={ew.trend} className="h-3 w-3" />{ew.trend || ''}</span>
                    </div>
                  ) : (
                    <div className="mt-2 rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">No cares generated</div>
                  )}
                  <div className="mt-2 flex-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Top priorities</p>
                    {pri.length ? (
                      <ol className="mt-1 space-y-1 text-xs">
                        {pri.slice(0, 3).map((x, idx) => (
                          <li key={idx} className="flex gap-1.5">
                            <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${x.urgency === 'urgent' ? 'bg-red-500' : x.urgency === 'soon' ? 'bg-amber-500' : 'bg-emerald-500'}`} />
                            <span className="line-clamp-2">{x.priority}</span>
                          </li>
                        ))}
                      </ol>
                    ) : <p className="mt-1 text-xs text-muted-foreground">—</p>}
                  </div>
                  <Button variant="outline" size="sm" className="mt-3 w-full" onClick={() => { onOpenChange(false); onOpenPatient(p.id) }}>Open</Button>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------ Main App ------------------------ */
function App() {
  const [patients, setPatients] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState(null)
  const [tutorialOpen, setTutorialOpen] = useState(false)
  const [boardOpen, setBoardOpen] = useState(false)
  const [generatingId, setGeneratingId] = useState(null)
  const [worseningId, setWorseningId] = useState(null)
  const [improvingId, setImprovingId] = useState(null)
  const [escalated, setEscalated] = useState([]) // [{id,name}] patients that just crossed into HIGH risk
  const [showHome, setShowHome] = useState(false) // document-upload landing ("first section")
  const prevRiskRef = useRef({})
  const firstLoadRef = useRef(true)
  const [bulk, setBulk] = useState(null) // {done,total} while populating all
  const [detail, setDetail] = useState(null) // full patient for detail view
  const [sortMode, setSortMode] = useState('manual') // 'manual' | 'risk'
  const [search, setSearch] = useState('')
  const sortModeRef = useRef('manual')
  const dragIndex = useRef(null)
  const [dragOver, setDragOver] = useState(null)

  const setMode = (m) => { sortModeRef.current = m; setSortMode(m) }

  const saveOrder = (list) => {
    try { localStorage.setItem('nursecare_order', JSON.stringify(list.map((p) => p.id))) } catch {}
  }
  const applyOrder = (list) => {
    try {
      const saved = JSON.parse(localStorage.getItem('nursecare_order') || '[]')
      if (!saved.length) return list
      const map = Object.fromEntries(list.map((p) => [p.id, p]))
      const ordered = saved.map((id) => map[id]).filter(Boolean)
      const rest = list.filter((p) => !saved.includes(p.id))
      return [...ordered, ...rest]
    } catch { return list }
  }

  const rankRisk = (p) => { const r = p.aiOutput?.earlyWarning?.riskLevel; return r === 'high' ? 3 : r === 'medium' ? 2 : r === 'low' ? 1 : 0 }
  const sortByRiskList = (list) => [...list].sort((a, b) => rankRisk(b) - rankRisk(a))
  const applyManualOrder = (list) => {
    try {
      const saved = JSON.parse(localStorage.getItem('nursecare_order') || '[]')
      if (!saved.length) return list
      const map = Object.fromEntries(list.map((p) => [p.id, p]))
      const ordered = saved.map((id) => map[id]).filter(Boolean)
      const rest = list.filter((p) => !saved.includes(p.id))
      return [...ordered, ...rest]
    } catch { return list }
  }

  const load = useCallback(async () => {
    try {
      const data = await api('/patients')
      const next = sortModeRef.current === 'risk'
        ? [...data].sort((a, b) => { const rk = (p) => { const r = p.aiOutput?.earlyWarning?.riskLevel; return r === 'high' ? 3 : r === 'medium' ? 2 : r === 'low' ? 1 : 0 }; return rk(b) - rk(a) })
        : applyManualOrder(data)
      // Auto-escalate detection: flag patients that just crossed into HIGH risk
      const newlyHigh = []
      for (const p of next) {
        const cur = p.aiOutput?.earlyWarning?.riskLevel
        const prev = prevRiskRef.current[p.id]
        if (cur === 'high' && prev && prev !== 'high') newlyHigh.push({ id: p.id, name: p.name })
        prevRiskRef.current[p.id] = cur
      }
      if (firstLoadRef.current) {
        firstLoadRef.current = false
      } else if (newlyHigh.length) {
        setEscalated(newlyHigh)
        toast.error(`${newlyHigh.map((p) => p.name).join(', ')} escalated to HIGH risk`, { duration: 6000 })
      }
      setPatients(next)
    } catch (e) { toast.error(e.message) } finally { setLoading(false) }
  }, [])

  const loadDetail = useCallback(async (id) => {
    try { const p = await api(`/patients/${id}`); setDetail(p) } catch (e) { toast.error(e.message) }
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (selectedId) { setDetail(null); loadDetail(selectedId) }
    else setDetail(null)
  }, [selectedId, loadDetail])

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
    return p
  }

  const addSample = async (type = 'chf') => {
    try {
      const p = await api('/sample', { method: 'POST', body: JSON.stringify({ type }) })
      setPatients((prev) => [...prev, p])
      toast.success('Demo patient added — open it to explore the care plan')
      setSelectedId(p.id)
    } catch (e) { toast.error(e.message) }
  }

  const createFromDocs = async (docs) => {
    try {
      const name = `Patient ${patients.length + 1}`
      const p = await api('/patients', { method: 'POST', body: JSON.stringify({ name }) })
      for (const d of docs) {
        await uploadDocument(p.id, d)
      }
      await load()
      toast.success('Documents uploaded — tap Populate to generate the care plan')
      setSelectedId(p.id)
    } catch (e) { toast.error(e.message) }
  }

  const populatePatient = async (id) => {
    const p = patients.find((x) => x.id === id)
    if (p?.aiOutput && !window.confirm(`Regenerate cares for ${p.name}? This replaces the current plan.`)) return
    setGeneratingId(id)
    try {
      await api(`/patients/${id}/generate`, { method: 'POST' })
      await load()
      toast.success(sortModeRef.current === 'risk' ? 'Populated · sorted by risk' : 'Nursing cares populated')
    } catch (e) { toast.error(e.message) } finally { setGeneratingId(null) }
  }

  const worsenPatient = async (id) => {
    setWorseningId(id)
    try {
      await api(`/patients/${id}/worsen`, { method: 'POST' })
      await load()
      toast.success('Deterioration simulated — watch the warning score climb')
    } catch (e) { toast.error(e.message) } finally { setWorseningId(null) }
  }

  const improvePatient = async (id) => {
    setImprovingId(id)
    try {
      await api(`/patients/${id}/improve`, { method: 'POST' })
      await load()
      toast.success('Recovery simulated — warning score easing off')
    } catch (e) { toast.error(e.message) } finally { setImprovingId(null) }
  }

  const populateAll = async () => {
    if (!patients.length) return
    if (patients.some((p) => p.aiOutput) && !window.confirm('Populate all will regenerate every patient and replace existing plans. Continue?')) return
    setBulk({ done: 0, total: patients.length })
    let ok = 0
    for (let i = 0; i < patients.length; i++) {
      try {
        await api(`/patients/${patients[i].id}/generate`, { method: 'POST' })
        ok++
      } catch (e) { /* continue */ }
      setBulk({ done: i + 1, total: patients.length })
    }
    await load()
    setBulk(null)
    toast.success(`Populated ${ok} of ${patients.length} patients`)
  }

  // drag reorder
  const handleDragStart = (i) => { dragIndex.current = i }
  const handleDragOver = (i) => { if (i !== dragOver) setDragOver(i) }
  const handleDrop = (i) => {
    const from = dragIndex.current
    dragIndex.current = null
    setDragOver(null)
    if (from == null || from === i) return
    setMode('manual')
    setPatients((prev) => {
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(i, 0, moved)
      saveOrder(next)
      return next
    })
  }

  const toggleSort = () => {
    if (sortModeRef.current === 'risk') {
      setMode('manual')
      setPatients((prev) => applyManualOrder(prev))
      toast.success('Back to your manual order')
    } else {
      setMode('risk')
      setPatients((prev) => sortByRiskList(prev))
      toast.success('Sorted by risk — highest first')
    }
  }

  const deletePatient = async (id) => {
    try {
      await api(`/patients/${id}`, { method: 'DELETE' })
      setPatients((prev) => prev.filter((p) => p.id !== id))
      setSelectedId(null)
      toast.success('Patient discharged')
    } catch (e) { toast.error(e.message) }
  }

  const selected = !!selectedId

  return (
    <div className="min-h-screen bg-gradient-to-b from-accent/30 to-background">
      <TutorialDialog open={tutorialOpen} onOpenChange={setTutorialOpen} />
      <ShiftBoard open={boardOpen} onOpenChange={setBoardOpen} patients={patients} onOpenPatient={setSelectedId} />

      {/* Header */}
      <header className="sticky top-0 z-30 border-b bg-card/80 backdrop-blur">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2.5">
            {selected && (
              <Button variant="ghost" size="icon" className="h-9 w-9 -ml-1" onClick={() => setSelectedId(null)} aria-label="Back to shift">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            )}
            <button className="flex items-center gap-2.5" onClick={() => { setSelectedId(null); setShowHome(false) }}>
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="h-5 w-5" />
              </div>
              <div className="text-left">
                <h1 className="text-lg font-bold leading-none tracking-tight">NurseCare</h1>
                <p className="text-[11px] text-muted-foreground">AI care plans for new grads</p>
              </div>
            </button>
          </div>
          <div className="flex items-center gap-2">
            {patients.length > 0 && (
              <Button variant="outline" size="sm" className="gap-2" onClick={() => setBoardOpen(true)}>
                <LayoutGrid className="h-4 w-4" /> <span className="hidden sm:inline">Shift board</span>
              </Button>
            )}
            <Button variant="outline" size="sm" className="gap-2" onClick={() => setTutorialOpen(true)}>
              <BookOpen className="h-4 w-4" /> <span className="hidden sm:inline">Tutorial</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="container py-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : selectedId ? (
          detail ? (
            <PatientDetail
              patient={detail}
              onBack={() => setSelectedId(null)}
              refresh={async () => { await load(); await loadDetail(selectedId) }}
              onDelete={deletePatient}
            />
          ) : (
            <div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
          )
        ) : showHome ? (
          <WelcomeLanding onSubmit={async (docs) => { await createFromDocs(docs); setShowHome(false) }} onSample={(t) => { addSample(t); setShowHome(false) }} onContinue={() => setShowHome(false)} count={patients.length} />
        ) : (
          <>
            {escalated.length > 0 && (
              <div className="mb-4 flex items-start gap-3 rounded-lg border-2 border-red-300 bg-red-50 p-4 text-red-800 animate-in fade-in slide-in-from-top-2">
                <div className="mt-0.5 rounded-lg bg-red-600 p-1.5 text-white"><Siren className="h-5 w-5" /></div>
                <div className="flex-1">
                  <p className="font-semibold">Patient deterioration — escalate now</p>
                  <p className="text-sm">
                    {escalated.map((e, i) => (
                      <span key={e.id}>
                        {i > 0 && ', '}
                        <button className="font-medium underline underline-offset-2 hover:text-red-900" onClick={() => setSelectedId(e.id)}>{e.name}</button>
                      </span>
                    ))}
                    {' '}just crossed into <b>HIGH risk</b>. Reassess, follow your escalation pathway and notify the senior RN / consider a MET call.
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-red-700 hover:bg-red-100" onClick={() => setEscalated([])} aria-label="Dismiss alert">
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}
            {/* Shift banner */}
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" className="h-9 w-9 -ml-1" onClick={() => setShowHome(true)} aria-label="Back to upload documents" title="Upload documents">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div>
                  <h2 className="text-2xl font-bold tracking-tight">Your shift</h2>
                  <p className="text-sm text-muted-foreground">{patients.length} of {MAX_PATIENTS} patients · tap a patient to manage documents & generate cares</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant={sortMode === 'risk' ? 'default' : 'outline'} onClick={toggleSort} className="gap-2">
                  <ArrowDownWideNarrow className="h-4 w-4" /> {sortMode === 'risk' ? 'Sorted by risk' : 'Sort by risk'}
                </Button>
                <Button
                  variant={patients.some((p) => p.aiOutput) ? 'default' : 'outline'}
                  onClick={() => downloadHandoverPack(patients)}
                  className={`gap-2 ${patients.some((p) => p.aiOutput) ? 'ring-2 ring-primary/40' : ''}`}
                >
                  <Download className="h-4 w-4" /> Handover pack
                </Button>
                <Button variant="outline" onClick={populateAll} disabled={!!bulk} className="gap-2">
                  {bulk ? <><Loader2 className="h-4 w-4 animate-spin" /> Populating {bulk.done}/{bulk.total}…</> : <><Sparkles className="h-4 w-4" /> Populate all</>}
                </Button>
                {patients.length < MAX_PATIENTS && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" className="gap-2 text-primary">
                        <Sparkles className="h-4 w-4" /> Sample
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Add a demo patient</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={() => addSample('sepsis')} className="gap-2">
                        <Siren className="h-4 w-4 text-red-600" />
                        <div className="flex flex-col">
                          <span className="font-medium">Sepsis (deteriorating)</span>
                          <span className="text-[11px] text-muted-foreground">High risk · urosepsis</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addSample('postop')} className="gap-2">
                        <ClipboardCheck className="h-4 w-4 text-emerald-600" />
                        <div className="flex flex-col">
                          <span className="font-medium">Post-op (stable)</span>
                          <span className="text-[11px] text-muted-foreground">Low risk · day 1 appendicectomy</span>
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => addSample('chf')} className="gap-2">
                        <HeartPulse className="h-4 w-4 text-amber-600" />
                        <div className="flex flex-col">
                          <span className="font-medium">Heart failure (CHF)</span>
                          <span className="text-[11px] text-muted-foreground">Worsening · fluid overload</span>
                        </div>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <AddPatientDialog onAdd={addPatient} reload={load} disabled={patients.length >= MAX_PATIENTS} />
              </div>
            </div>

            {patients.length > 0 && (
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full max-w-xs">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, bed or diagnosis…"
                    className="pl-8"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label="Clear search"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">Risk key:</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> High</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Medium</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Low</span>
                  <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-slate-300" /> Not populated</span>
                </div>
              </div>
            )}

            {patients.length === 0 ? (
              <Card className="mx-auto max-w-lg overflow-hidden">
                <div className="relative h-28 w-full">
                  <img src={HERO_IMG} alt="Nurse" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 bg-gradient-to-t from-primary/85 to-primary/25" />
                  <div className="absolute bottom-3 left-4 flex items-center gap-2 text-white">
                    <GraduationCap className="h-5 w-5" />
                    <span className="text-lg font-bold tracking-tight">Start your shift</span>
                  </div>
                </div>
                <CardContent className="pt-5">
                  <p className="mb-4 text-sm text-muted-foreground">Upload the patient’s documents — care plan, meds, vitals, doctor or allied-health notes. Snap a photo or choose a PDF/image. NurseCare creates the patient and takes you straight to <b>Populate</b>.</p>
                  <LandingUpload onSubmit={createFromDocs} />
                  <div className="relative my-4">
                    <Separator />
                    <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">or</span>
                  </div>
                  <Button variant="outline" className="w-full gap-2" onClick={() => addSample()}>
                    <Sparkles className="h-4 w-4 text-primary" /> Try a sample patient (ready-made care plan)
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                {patients.map((p, i) => {
                  const q = search.trim().toLowerCase()
                  const match = !q || [p.name, p.bed, p.diagnosis].filter(Boolean).some((f) => f.toLowerCase().includes(q))
                  if (!match) return null
                  return (
                    <PatientCard
                      key={p.id}
                      patient={p}
                      index={i}
                      onOpen={setSelectedId}
                      onPopulate={populatePatient}
                      onWorsen={worsenPatient}
                      onImprove={improvePatient}
                      generating={generatingId === p.id || (!!bulk && !p.aiOutput)}
                      worsening={worseningId === p.id}
                      improving={improvingId === p.id}
                      onDragStart={handleDragStart}
                      onDragOver={handleDragOver}
                      onDrop={handleDrop}
                      dragging={dragOver === i}
                    />
                  )
                })}
                {!search.trim() && Array.from({ length: MAX_PATIENTS - patients.length }).map((_, i) => (
                  <AddPatientDialog
                    key={`empty-${i}`}
                    onAdd={addPatient}
                    reload={load}
                    disabled={false}
                    trigger={
                      <button className="flex min-h-[168px] w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
                        <Plus className="h-6 w-6" />
                        <span className="text-sm font-medium">Add patient</span>
                        <span className="text-[11px] text-muted-foreground/70">tap to add your next patient</span>
                      </button>
                    }
                  />
                ))}
              </div>
            )}

            {patients.length > 0 && search.trim() && !patients.some((p) => {
              const q = search.trim().toLowerCase()
              return [p.name, p.bed, p.diagnosis].filter(Boolean).some((f) => f.toLowerCase().includes(q))
            }) && (
              <div className="mt-4 rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                No patients match “{search.trim()}”.
                <button onClick={() => setSearch('')} className="ml-1 font-medium text-primary hover:underline">Clear search</button>
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
