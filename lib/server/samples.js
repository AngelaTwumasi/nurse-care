import { v4 as uuidv4 } from 'uuid'

export function buildSamplePatient(sampleType = 'chf') {
  const now = new Date()
  const h = (n) => new Date(now.getTime() - n * 3600 * 1000)
      const patient = {
        id: uuidv4(),
        name: 'DEMO · Mr. Alan Reid',
        bed: 'Bed 6',
        age: '79',
        diagnosis: 'Congestive heart failure exacerbation; Type 2 diabetes; monitoring for fluid overload',
        documents: [{
          id: uuidv4(), name: 'Care plan & obs (demo)', category: 'careplan', kind: 'text', mimeType: null, dataUrl: null,
          textContent: 'CHF exacerbation. Fluid restrict 1.5L/day, daily weights, strict fluid balance. Meds: Furosemide 40mg IV BD (0800, 1400), Metformin 500mg BD (0800, 1800), Enoxaparin 40mg SC (2000). Obs 0600 HR 88 BP 128/78 RR 20 SpO2 94% Temp 36.9. Obs 1000 HR 102 BP 112/70 RR 24 SpO2 91% Temp 37.2. Obs 1400 HR 116 BP 98/60 RR 28 SpO2 88% Temp 37.6. Increasing SOB, bilateral basal crackles.',
          uploadedAt: now,
        }],
        aiOutput: {
          patientSummary: '79-year-old man admitted with a heart-failure flare. Over the shift his heart and breathing rates have climbed while oxygen levels have fallen — a picture of worsening fluid overload that needs close watching.',
          priorities: [
            { rank: 1, priority: 'Respiratory support & oxygenation', rationale: 'SpO2 falling 94→88% with rising RR and crackles suggests pulmonary congestion', urgency: 'urgent' },
            { rank: 2, priority: 'Fluid balance & diuresis', rationale: 'Ensure furosemide given, monitor urine output, daily weight and strict fluid balance', urgency: 'soon' },
            { rank: 3, priority: 'Glycaemic monitoring', rationale: 'T2DM on metformin — check BGLs, watch for illness-related swings', urgency: 'routine' },
          ],
          interventions: [
            { intervention: 'Apply oxygen and sit upright; titrate to SpO2 ≥ 92%', frequency: 'Now, continuous', monitoring: 'SpO2, work of breathing, RR', howToMonitor: 'Use pulse oximeter continuous (target SpO2 ≥ 92%); observe chest rise, use of accessory muscles, RR (normal 12-20). Escalate if SpO2 < 90% despite O2 or RR > 28.', rationale: 'Improves oxygenation and reduces preload' },
            { intervention: 'Administer prescribed IV furosemide and monitor response', frequency: '0800 & 1400', monitoring: 'Urine output, weight, K+', howToMonitor: 'Measure urine output hourly (expect increase post-dose); weigh daily same time (target loss 0.5-1 kg/day); check K+ level (normal 3.5-5). Escalate if K+ < 3.5 or urine output poor.', rationale: 'Reduces fluid overload' },
            { intervention: 'Half-hourly vital signs and escalate on trigger', frequency: 'Every 30 min', monitoring: 'HR, BP, RR, SpO2', howToMonitor: 'Use automated BP cuff and pulse oximeter every 30 min; chart trends. Escalate if SBP < 90, HR > 120, RR > 28, or SpO2 < 90%.', rationale: 'Detects deterioration early' },
          ],
          isbar: {
            identify: 'Mr Alan Reid, 79, Bed 6, RN [your name] calling.',
            situation: 'Increasing shortness of breath with falling oxygen saturations this shift.',
            background: 'Admitted with CHF exacerbation; also has T2DM. On IV furosemide, fluid restricted.',
            assessment: 'HR 116, BP 98/60, RR 28, SpO2 88% on room air, bibasal crackles — appears fluid overloaded and hypoxic.',
            recommendation: 'Please review urgently; consider increasing diuresis and oxygen; would like a medical review now.',
          },
          medications: [
            { name: 'Furosemide', dose: '40mg', route: 'IV', times: ['0800', '1400'], notes: 'Monitor urine output and potassium' },
            { name: 'Metformin', dose: '500mg', route: 'PO', times: ['0800', '1800'], notes: 'Hold if unwell/for contrast' },
            { name: 'Enoxaparin', dose: '40mg', route: 'SC', times: ['2000'], notes: 'VTE prophylaxis' },
          ],
          medicationTimes: [
            { time: '0800', medication: 'Furosemide 40mg IV / Metformin 500mg', dose: '' },
            { time: '1400', medication: 'Furosemide 40mg IV', dose: '' },
            { time: '1800', medication: 'Metformin 500mg', dose: '' },
            { time: '2000', medication: 'Enoxaparin 40mg SC', dose: '' },
          ],
          careSchedule: [
            { time: '0800', task: 'Morning meds, weigh patient, commence fluid balance chart', priority: 'soon' },
            { time: 'Every 30 min', task: 'Vital signs while deteriorating', priority: 'urgent' },
            { time: '1200', task: 'Check blood glucose level', priority: 'routine' },
            { time: '1400', task: 'Second furosemide dose, reassess oedema & chest', priority: 'soon' },
            { time: 'End of shift', task: 'Update fluid balance total and handover', priority: 'routine' },
          ],
          vitalsTimeline: [
            { time: '0600', hr: '88', bp: '128/78', rr: '20', spo2: '94', temp: '36.9', notes: 'Baseline' },
            { time: '1000', hr: '102', bp: '112/70', rr: '24', spo2: '91', temp: '37.2', notes: 'Increasing SOB' },
            { time: '1400', hr: '116', bp: '98/60', rr: '28', spo2: '88', temp: '37.6', notes: 'Bibasal crackles' },
          ],
          earlyWarning: { score: '6', riskLevel: 'high', trend: 'worsening', rationale: 'Rising HR/RR with falling SpO2 and BP over the shift', escalation: 'Notify senior RN and request urgent medical review / consider MET criteria' },
          redFlags: ['SpO2 < 90% or ongoing fall', 'RR > 28 or increasing distress', 'Systolic BP < 90 mmHg', 'New confusion or chest pain'],
          newGradTips: ['Sit the patient up and get oxygen on early — it buys time.', 'Escalate on a trend, not just a single number.', 'Have your ISBAR ready before you call — it makes the review faster.'],
          handoverHeader: {
            alerts: ['Falls risk', 'Fluid restrict 1.5L/day', 'Diabetic — BGL monitoring', 'For review — deteriorating'],
            diagnosis: 'Congestive heart failure exacerbation',
            background: 'CHF, type 2 diabetes, hypertension; lives with wife',
            age: '79',
            attendingDoctor: 'Dr. Roberts (Cardiology/Medical team)',
          },
          criticalActions: [
            { action: 'Apply oxygen, sit upright and request urgent medical review', window: 'now', rationale: 'SpO2 falling to 88% with rising RR — impending respiratory compromise' },
            { action: 'Ensure IV furosemide given and monitor urine output', window: 'this hour', rationale: 'Reduces fluid overload driving the deterioration' },
          ],
          drsabcd: {
            danger: 'Bed low, call bell in reach, clear path — falls risk.',
            response: 'Alert but increasingly breathless — reassess frequently.',
            sendForHelp: 'Notify senior RN now; consider MET if SpO2/BP worsen.',
            airway: 'Patent.',
            breathing: 'RR 28, SpO2 88%, bibasal crackles — O2 to ≥92%, sit upright, half-hourly.',
            circulation: 'HR 116, BP 98/60 — IV access, strict fluid balance, daily weight.',
            disability: 'Alert; check BGL (diabetic); watch for confusion.',
            exposure: 'Check peripheral/sacral oedema; skin integrity; temp 37.6.',
          },
          dietMobility: { diet: 'Cardiac diet; fluid restrict 1.5L/day; monitor BGL', mobility: 'Bed rest while breathless; assist with hygiene; falls precautions', aids: '2 staff assist; commode at bedside' },
          assessments: { done: ['Vitals 0600/1000/1400', 'Daily weight', 'Chest auscultation'], todo: ['Half-hourly vitals while deteriorating', 'BGL at 1200', 'Strict fluid balance', 'Reassess chest post-furosemide'] },
          linesDevices: [
            { type: 'IV cannula', detail: '20G — for IV furosemide', site: 'R hand', notes: 'Check patency; monitor for tissuing' },
            { type: 'Oxygen', detail: 'Nasal prongs, titrate to SpO2 ≥92%', site: 'Nasal', notes: 'Escalate if FiO2 need rises' },
          ],
          edd: 'Not documented — pending stabilisation',
          recommendations: ['Continue diuresis and oxygen', 'Half-hourly obs while deteriorating', 'Urgent medical review', 'Strict fluid balance + daily weights'],
          outstandingTasks: ['1200 BGL', '1400 furosemide dose', 'Update fluid balance total', 'Handover deterioration to team'],
          abbreviations: [
            { abbr: 'CHF', meaning: 'Congestive Heart Failure — the heart can’t pump effectively, causing fluid to back up in the lungs/body.' },
            { abbr: 'SpO2', meaning: 'Peripheral oxygen saturation — % of oxygen in the blood, measured on a finger probe.' },
            { abbr: 'MET', meaning: 'Medical Emergency Team — rapid response team for a deteriorating patient.' },
            { abbr: 'BGL', meaning: 'Blood Glucose Level — bedside blood sugar reading.' },
          ],
          safetyNotice: 'This is a demo. Always verify medications, doses and escalation with your senior/RN.',
        },
        aiGeneratedAt: now,
        careDone: {},
        ewHistory: [
          { t: h(4), score: 2, risk: 'low', riskValue: 1 },
          { t: h(2), score: 4, risk: 'medium', riskValue: 2 },
          { t: now, score: 6, risk: 'high', riskValue: 3 },
        ],
        isSample: true,
        createdAt: now,
      }
  applySamplePreset(patient, sampleType, h, now)
  return patient
}

function applySamplePreset(patient, type, h, now) {
  if (type === 'sepsis') {
    patient.name = 'DEMO · Mrs. Rita Kaur'
    patient.bed = 'Bed 2'
    patient.age = '68'
    patient.diagnosis = 'Urosepsis; hypotension; on IV antibiotics and fluids'
    patient.documents[0].textContent = 'Query urosepsis. Cultures sent. IV Piperacillin-Tazobactam 4.5g QID (0600 1200 1800 2400). 1L Hartmanns stat then reassess. Hourly obs. Obs 0600 HR 108 BP 96/54 RR 24 SpO2 94% Temp 38.8. Obs 0900 HR 124 BP 84/48 RR 28 SpO2 92% Temp 39.4. Lactate 3.1. Reduced urine output.'
    patient.aiOutput = {
      patientSummary: '68-year-old woman with urosepsis. She is febrile, tachycardic and becoming hypotensive with a rising lactate — she meets sepsis criteria and needs the sepsis pathway now.',
      priorities: [
        { rank: 1, priority: 'Sepsis 6 / restore perfusion', rationale: 'Hypotension (84/48), tachycardia and lactate 3.1 indicate septic shock risk', urgency: 'urgent' },
        { rank: 2, priority: 'Timely IV antibiotics', rationale: 'Give prescribed antibiotics without delay after cultures', urgency: 'urgent' },
        { rank: 3, priority: 'Urine output & fluid status', rationale: 'Reduced output — monitor hourly, consider IDC and fluid balance', urgency: 'soon' },
      ],
      interventions: [
        { intervention: 'Escalate for MET/sepsis pathway; give O2 to keep SpO2 ≥ 94%', frequency: 'Now', monitoring: 'BP, HR, SpO2, GCS', howToMonitor: 'Use automated BP cuff every 15 min; pulse oximeter continuous; assess GCS (normal = 15). Escalate if SBP < 90, SpO2 < 92%, or GCS drops.', rationale: 'Septic shock is time-critical' },
        { intervention: 'Give IV fluid bolus as prescribed and reassess', frequency: 'Stat then review', monitoring: 'BP, lactate, urine output', howToMonitor: 'Check BP pre/post bolus (target SBP > 100); send repeat lactate 1-2h after fluids (target < 2); measure urine hourly (target > 0.5 mL/kg/hr). Escalate if no improvement.', rationale: 'Restores perfusion' },
        { intervention: 'Administer IV antibiotics on time', frequency: '0600/1200/1800/2400', monitoring: 'Temp, allergy status', howToMonitor: 'Check temp 1h after dose (expect downward trend); watch for rash, itch, wheeze during infusion. Stop and call if allergic reaction.', rationale: 'Source control of infection' },
      ],
      isbar: {
        identify: 'Mrs Rita Kaur, 68, Bed 2, RN [your name] calling.',
        situation: 'I am worried about sepsis — she is hypotensive and tachycardic.',
        background: 'Admitted with query urosepsis, on IV antibiotics and fluids.',
        assessment: 'HR 124, BP 84/48, RR 28, Temp 39.4, lactate 3.1, low urine output.',
        recommendation: 'Please attend now; I have started the sepsis pathway and need urgent review.',
      },
      medications: [
        { name: 'Piperacillin-Tazobactam', dose: '4.5g', route: 'IV', times: ['0600', '1200', '1800', '2400'], notes: 'Give on time; check allergies' },
        { name: 'Hartmann\'s solution', dose: '1L', route: 'IV', times: ['stat'], notes: 'Bolus then reassess' },
      ],
      medicationTimes: [
        { time: '0600', medication: 'Pip-Taz 4.5g IV', dose: '' },
        { time: '1200', medication: 'Pip-Taz 4.5g IV', dose: '' },
      ],
      careSchedule: [
        { time: 'Now', task: 'Escalate sepsis, oxygen, IV access x2, bloods & cultures', priority: 'urgent' },
        { time: 'Hourly', task: 'Vital signs and urine output', priority: 'urgent' },
        { time: '1200', task: 'Repeat lactate and reassess fluids', priority: 'soon' },
      ],
      vitalsTimeline: [
        { time: '0600', hr: '108', bp: '96/54', rr: '24', spo2: '94', temp: '38.8', notes: 'Febrile' },
        { time: '0900', hr: '124', bp: '84/48', rr: '28', spo2: '92', temp: '39.4', notes: 'Hypotensive, lactate 3.1' },
      ],
      earlyWarning: { score: '8', riskLevel: 'high', trend: 'worsening', rationale: 'Hypotension with tachycardia, fever and rising lactate', escalation: 'Activate MET / sepsis team immediately' },
      redFlags: ['Systolic BP < 90 or not responding to fluids', 'Lactate rising', 'New confusion', 'Urine output < 0.5 mL/kg/hr'],
      newGradTips: ['Think Sepsis 6: give 3, take 3.', 'Don\'t delay antibiotics waiting for everything else.', 'Escalate early — sepsis moves fast.'],
      handoverHeader: {
        alerts: ['Sepsis pathway active', 'Allergy: NKDA (confirm)', 'Falls risk — hypotensive', 'For MET review'],
        diagnosis: 'Urosepsis with septic shock risk',
        background: 'Recurrent UTIs; type 2 diabetes; lives alone',
        age: '68',
        attendingDoctor: 'Dr. Nguyen (Medical/ID team)',
      },
      criticalActions: [
        { action: 'Complete Sepsis 6 (O2, blood cultures, IV antibiotics, IV fluids, lactate, urine output)', window: 'within 1 hour', rationale: 'Every hour antibiotics are delayed increases mortality in septic shock' },
        { action: 'Escalate to MET / senior RN for hypotension', window: 'now', rationale: 'BP 84/48 with rising lactate = septic shock' },
      ],
      drsabcd: {
        danger: 'Standard precautions; keep call bell in reach; bed low.',
        response: 'Alert but tiring — reassess GCS/AVPU hourly.',
        sendForHelp: 'Escalate to RN now; MET criteria met — do not wait.',
        airway: 'Patent, talking in full sentences.',
        breathing: 'RR 28, SpO2 92% — apply O2 to keep ≥94%, monitor work of breathing.',
        circulation: 'Hypotensive 84/48, HR 124 — 2x IV access, fluid bolus, hourly BP.',
        disability: 'Watch for new confusion; check BGL (diabetic).',
        exposure: 'Temp 39.4 — check for source, warm/cool as needed, inspect skin/IV sites.',
      },
      dietMobility: { diet: 'Nil by mouth pending review; monitor BGL', mobility: 'Bed rest — assist with all cares, falls precautions', aids: 'Supervise; 2 staff for transfers' },
      assessments: { done: ['Set of vitals 0900', 'Blood cultures sent', 'Lactate 3.1'], todo: ['Repeat lactate at 1200', 'Insert IDC for strict output', 'Fluid balance chart', 'Reassess post fluid bolus'] },
      linesDevices: [
        { type: 'IV cannula x2', detail: '18G both arms — antibiotics + fluids', site: 'L & R ACF', notes: 'Check patency each round' },
        { type: 'IV infusion', detail: 'Hartmann\'s 1L bolus then reassess', site: 'R ACF', notes: 'Monitor response to fluids' },
      ],
      edd: 'Not documented — acute phase',
      recommendations: ['Continue sepsis pathway', 'Hourly obs + urine output', 'Repeat lactate and reassess fluids at 1200', 'Medical review for ongoing antibiotics/ICU consideration'],
      outstandingTasks: ['Insert IDC', 'Send repeat bloods', 'Update family', 'Chart fluid balance total'],
      abbreviations: [
        { abbr: 'UTI', meaning: 'Urinary Tract Infection — infection in the urinary system, a common source of sepsis.' },
        { abbr: 'MET', meaning: 'Medical Emergency Team — rapid response team you call when a patient meets escalation criteria.' },
        { abbr: 'IDC', meaning: 'Indwelling Catheter — a tube in the bladder to drain and accurately measure urine output.' },
        { abbr: 'BGL', meaning: 'Blood Glucose Level — bedside blood sugar reading, important in diabetics.' },
      ],
      safetyNotice: 'This is a demo. Always verify medications, doses and escalation with your senior/RN.',
    }
    patient.ewHistory = [ { t: h(3), score: 4, risk: 'medium', riskValue: 2 }, { t: h(1), score: 6, risk: 'high', riskValue: 3 }, { t: now, score: 8, risk: 'high', riskValue: 3 } ]
  } else if (type === 'postop') {
    patient.name = 'DEMO · Mr. Tom Fischer'
    patient.bed = 'Bed 9'
    patient.age = '54'
    patient.diagnosis = 'Day 1 post laparoscopic appendicectomy; stable, pain management'
    patient.documents[0].textContent = 'POD1 lap appendicectomy. Obs stable. Regular paracetamol 1g QID (0600 1200 1800 2400), oxycodone 5mg PRN pain. Encourage mobilisation, deep breathing, diet as tolerated. Obs 0600 HR 74 BP 122/76 RR 15 SpO2 98% Temp 36.8. Obs 1000 HR 78 BP 118/74 RR 14 SpO2 99% Temp 36.9. Pain 3/10.'
    patient.aiOutput = {
      patientSummary: '54-year-old man, day 1 after keyhole appendix surgery. He is comfortable and stable; the focus is good pain relief, early mobilising and watching for any post-op complications.',
      priorities: [
        { rank: 1, priority: 'Pain management', rationale: 'Good analgesia enables mobilising and recovery', urgency: 'soon' },
        { rank: 2, priority: 'Mobilisation & chest care', rationale: 'Prevents VTE and chest complications', urgency: 'routine' },
        { rank: 3, priority: 'Wound & diet progression', rationale: 'Monitor wound, advance diet as tolerated', urgency: 'routine' },
      ],
      interventions: [
        { intervention: 'Regular analgesia and reassess pain score', frequency: 'QID + PRN', monitoring: 'Pain score, sedation, bowels', howToMonitor: 'Use 0-10 pain scale before and 30 min after analgesia (target < 4); check sedation score (alert = safe); ask about bowel movement daily. Escalate if pain uncontrolled or oversedated.', rationale: 'Comfort and function' },
        { intervention: 'Assist to mobilise and deep-breathe', frequency: '3-4 hourly', monitoring: 'Tolerance, dizziness', howToMonitor: 'Observe gait steadiness, ask about dizziness; listen to chest for clear breath sounds bilaterally. Sit if dizzy; escalate if chest sounds diminished.', rationale: 'Reduces VTE/atelectasis' },
        { intervention: 'Wound check and observe for infection', frequency: 'Each shift', monitoring: 'Redness, ooze, fever', howToMonitor: 'Inspect wound sites for spreading redness, purulent discharge, or increased pain; check temp (normal < 37.5). Escalate if any signs of infection.', rationale: 'Early detection' },
      ],
      isbar: {
        identify: 'Mr Tom Fischer, 54, Bed 9, RN [your name].',
        situation: 'Day 1 post appendicectomy, stable and comfortable.',
        background: 'Laparoscopic appendicectomy yesterday, no complications.',
        assessment: 'Obs stable, pain 3/10 with regular analgesia, mobilising with help.',
        recommendation: 'Continue current plan; will escalate if pain, fever or obs change.',
      },
      medications: [
        { name: 'Paracetamol', dose: '1g', route: 'PO', times: ['0600', '1200', '1800', '2400'], notes: 'Regular, max 4g/day' },
        { name: 'Oxycodone', dose: '5mg', route: 'PO', times: ['PRN'], notes: 'For breakthrough pain; watch sedation' },
      ],
      medicationTimes: [
        { time: '0600', medication: 'Paracetamol 1g', dose: '' },
        { time: '1200', medication: 'Paracetamol 1g', dose: '' },
      ],
      careSchedule: [
        { time: '0800', task: 'Analgesia, assist to shower & mobilise', priority: 'routine' },
        { time: '1000', task: 'Deep breathing exercises, encourage diet', priority: 'routine' },
        { time: '1400', task: 'Wound check and pain reassessment', priority: 'soon' },
      ],
      vitalsTimeline: [
        { time: '0600', hr: '74', bp: '122/76', rr: '15', spo2: '98', temp: '36.8', notes: 'Comfortable' },
        { time: '1000', hr: '78', bp: '118/74', rr: '14', spo2: '99', temp: '36.9', notes: 'Pain 3/10' },
      ],
      earlyWarning: { score: '0', riskLevel: 'low', trend: 'stable', rationale: 'All observations within normal limits and stable', escalation: 'Routine monitoring; escalate if pain, fever or obs change' },
      redFlags: ['Fever or wound redness/discharge', 'Increasing abdominal pain or distension', 'Persistent nausea/vomiting'],
      newGradTips: ['Stay ahead of pain with regular analgesia.', 'Early mobilising prevents clots and chest infections.', 'A calm shift is a great time to practise your ISBAR.'],
      handoverHeader: {
        alerts: ['Allergy: Penicillin (rash)', 'Low falls risk', 'Day 1 post-op'],
        diagnosis: 'Day 1 post laparoscopic appendicectomy',
        background: 'Previously well; non-smoker; works as a teacher',
        age: '54',
        attendingDoctor: 'Dr. Patel (Surgical team)',
      },
      criticalActions: [],
      drsabcd: {
        danger: 'Nil hazards; bed low, call bell in reach.',
        response: 'Alert and oriented.',
        sendForHelp: 'Escalate to RN if pain uncontrolled, fever, or obs change.',
        airway: 'Patent.',
        breathing: 'RR 14, SpO2 99% — encourage deep breathing / incentive spirometry.',
        circulation: 'HR 78, BP 118/74 — warm and well perfused, IV in situ.',
        disability: 'Pain 3/10 with regular analgesia; alert.',
        exposure: 'Afebrile; wound sites clean and dry.',
      },
      dietMobility: { diet: 'Diet as tolerated — advance from light diet', mobility: 'Mobilise 3-4 hourly with assist; independent by end of shift', aids: 'Supervision only' },
      assessments: { done: ['Morning vitals', 'Pain score 3/10', 'Wound check — clean/dry'], todo: ['Afternoon vitals', 'Reassess pain post-mobilising', 'Bowel/bladder check', 'Confirm eating/drinking'] },
      linesDevices: [
        { type: 'IV cannula', detail: '20G — TKVO, for analgesia if needed', site: 'L forearm', notes: 'Consider removal if tolerating oral' },
      ],
      edd: 'Tomorrow if tolerating diet, mobilising and pain controlled',
      recommendations: ['Continue regular analgesia + PRN', 'Encourage mobilising and diet', 'Remove IV when oral tolerated', 'Discharge planning for tomorrow'],
      outstandingTasks: ['Afternoon obs', 'Reassess IV need', 'Provide discharge education', 'Confirm follow-up appointment'],
      abbreviations: [
        { abbr: 'TDS', meaning: 'Ter Die Sumendum — three times a day (medication frequency).' },
        { abbr: 'PRN', meaning: 'Pro Re Nata — given "as needed" rather than at set times.' },
        { abbr: 'IV', meaning: 'Intravenous — into the vein (e.g. IV cannula for fluids/medicines).' },
        { abbr: 'DVT', meaning: 'Deep Vein Thrombosis — a blood clot in a deep vein; early mobilising helps prevent it.' },
      ],
      safetyNotice: 'This is a demo. Always verify medications, doses and escalation with your senior/RN.',
    }
    patient.ewHistory = [ { t: h(3), score: 1, risk: 'low', riskValue: 1 }, { t: h(1), score: 0, risk: 'low', riskValue: 1 }, { t: now, score: 0, risk: 'low', riskValue: 1 } ]
  }
  // 'chf' keeps the default object already built
}
