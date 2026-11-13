# PROMPT: Refactor Conveyor Board — BOP-Based Process Flow, Intra/Inter-Station WIP Logic & Production Hub Robustness

---

## 1. Konteks

### 1.1. Masalah Fatal: Conveyor Board Berbasis Station (Bukan Proses)
Saat ini `ProductionPhaseExecution.tsx` merender **Digital Twin Conveyor Board** sebagai deretan kartu berbasis **`station` fisik** yang dihubungkan panah horizontal.

**Akibatnya:**
- **Flow produksi tidak merefleksikan BOP (Bill of Process)**. BOP adalah urutan *proses* (Cutting → Welding → Painting → Assembly), sedangkan conveyor board menampilkan urutan *station* (ST-01 → ST-02 → ST-03).
- **Satu station bisa menjalankan multiple proses** (contoh: ST-03 menjalankan "Sub-Assembly" dan "Final Assembly"), namun dalam UI station-based, proses-proses ini tertumpuk dan tidak terlihat alur WIP-nya.
- **WIP (Work In Process) tidak bisa ditrack per proses**. Sistem tidak tahu apakah unit yang selesai "Cutting" sudah bisa masuk "Welding" jika kedua proses berada di station yang berbeda.
- **Countdown dan progress terpasang pada station**, bukan pada proses. Akibatnya jika station menjalankan 2 proses, countdown menjadi ambigu.
- **Transfer WOT (Work Order Ticket) dipaksakan per station**, sehingga lot size menjadi kaku dan tidak memperhitungkan apakah proses berikutnya berada di station yang sama atau berbeda.

### 1.2. Perbedaan Fundamental: Intra-Station vs Inter-Station
Dalam manufaktur nyata, aturan transfer WIP berbeda tergantung apakah proses berikutnya berada di station yang sama atau berbeda:

| Skenario | Definisi | Aturan WIP Transfer | Dampak pada UI |
|----------|----------|---------------------|----------------|
| **Intra-Station** | Proses N dan N+1 berada di **station fisik yang sama** | WIP bisa dipindahkan **per unit (1 pcs)** segera setelah proses N selesai. Tidak perlu menunggu 1 lot penuh. | WIP card tetap berada dalam station container yang sama, namun berpindah dari sub-proses A ke sub-proses B. |
| **Inter-Station** | Proses N dan N+1 berada di **station fisik yang berbeda** | WIP harus dikumpulkan sampai mencapai **minimum 1 lot WOT** sebelum ditransfer fisik ke station berikutnya. | WIP card muncul di station tujuan hanya jika qty ≥ lotSize. Menampilkan antrian transfer. |

Saat ini, sistem menganggap **semua transfer adalah inter-station** (memerlukan WOT penuh), yang menyebabkan inefficiency besar jika multiple proses berada dalam 1 station.

### 1.3. Dampak Bisnis
- **Throughput Loss**: Station yang menjalankan 3 proses harus menunggu lot penuh selesai sebelum proses berikutnya dalam station yang sama bisa berjalan. Padahal seharusnya unit per unit bisa mengalir.
- **WIP Pile-Up**: WIP menumpuk di station awal karena station berikutnya (dalam station yang sama) dianggap "belum siap" karena menunggu lot size.
- **Visibility Buruk**: Supervisor tidak bisa melihat *proses mana* yang sedang bottleneck, hanya melihat *station mana* yang idle.
- **False Starvation**: Station dianggap starved padahal sebenarnya proses sebelumnya dalam station yang sama sudah selesai dan WIP sudah tersedia.

---

## 2. Tujuan

1. **Refactor Conveyor Board** dari station-based menjadi **BOP-based process flow**. Station tetap ditampilkan sebagai container fisik, namun node utama adalah proses.
2. **Implementasi Dual WIP Transfer Rule**:
   - **Intra-Station**: Transfer per unit, tidak memerlukan lot WOT.
   - **Inter-Station**: Transfer minimum 1 lot WOT.
3. **Countdown & Cycle Time** tetap ada, namun **terpasang pada proses** (bukan station).
4. **Visualisasi BOP Routing** dengan dashed border outline (mirip BOP Engineering Editor) untuk setiap process node.
5. **Production Hub & Project Detail** menjadi robust dengan state machine per proses, auto-routing, dan audit trail yang jelas.

---

## 3. Fitur yang Harus Dikembangkan

### 3.1. Conveyor Board Refactor: Station-Based → Process-Based (REVISI TOTAL)

#### 3.1.1. Process Node sebagai First-Class Citizen
Conveyor board tidak lagi di-render dari array `stations`, melainkan dari array `processSteps` (BOP nodes yang sudah difilter hanya node tipe PROCESS).

**Struktur Node Baru:**
```
┌─────────────────────────────────────────────────────────────┐
│  #02  CUTTING — ST-01 (Press A)                    [RUNNING] │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│                                                             │
│  [WOT-001-A] 25 pcs  ████████░░  65%  ⏱️ 04:32 remaining    │
│  [WOT-001-B] 25 pcs  ██████░░░░  50%  ⏱️ 06:15 remaining    │
│                                                             │
│  [Start] [Pause] [NDP]           Cycle: 12 min/pcs          │
└─────────────────────────────────────────────────────────────┘
```

- **Header**: Sequence number, Process name, Station code & name, Status badge.
- **Body**: WIP cards yang sedang diproses di proses ini (bukan di station ini secara keseluruhan).
- **Footer**: Action buttons, cycle time info, assigned operator avatars.
- **Border**: `border-2 border-dashed border-stone-300 rounded-2xl` (konsisten dengan BOP Engineering Editor).

#### 3.1.2. Station Container sebagai Grouping Visual
Jika multiple proses berada dalam 1 station, station ditampilkan sebagai **container grouping** dengan background berbeda (contoh: `bg-stone-50/50 border border-stone-200 rounded-3xl p-4`).

```
┌─ STATION ST-01: PRESS LINE ─────────────────────────────┐
│  ┌─ #01: BLANKING ─┐    ┌─ #02: CUTTING ─┐            │
│  │ [WOT...]         │ →  │ [WOT...]        │            │
│  └───────────────────┘    └─────────────────┘            │
└──────────────────────────────────────────────────────────┘
```

- Proses dalam 1 station dihubungkan dengan **panah pendek** (intra-station arrow).
- Proses ke station lain dihubungkan dengan **panah panjang + gap** (inter-station arrow).

#### 3.1.3. BOP Predecessor Connector Visualization
Connector antar process node mengikuti `predecessor_ids` dari BOP, bukan urutan array station.

| Tipe Koneksi | Visual | Keterangan |
|--------------|--------|------------|
| **Serial** | Garis solid dengan panah | Proses A harus selesai sebelum Proses B mulai |
| **Parallel** | Garis putus-putus dengan panah | Proses B dan C bisa berjalan bersamaan setelah A selesai |
| **Merge** | Dua garis menyatu ke 1 panah | Proses D memerlukan output dari B dan C |

---

### 3.2. Dual WIP Transfer Logic: Intra-Station vs Inter-Station (BARU)

#### 3.2.1. Intra-Station Transfer Rule (Proses dalam Station Sama)
**Definisi:** Proses N dan Proses N+1 memiliki `station_id` yang sama.

**Logic:**
```typescript
function getIntraStationWipLedger(currentStepId: string, previousStepId: string) {
  const prevStep = getBopStep(previousStepId);
  const currentStep = getBopStep(currentStepId);

  // Validasi: harus dalam station yang sama
  if (prevStep.station_id !== currentStep.station_id) return null;

  const targetQty = project?.qty || 1;
  const completedByPrev = Number(prevStep.completed_qty || 0);
  const consumedByCurrent = Number(currentStep.completed_qty || 0);

  // Intra-station: transfer per unit (1 pcs)
  const availableWip = Math.max(0, completedByPrev - consumedByCurrent);

  return {
    transferMode: "INTRA_STATION",
    availableWip,
    canStart: availableWip > 0,
    requiredLotSize: 1, // Per unit, bukan per lot
    bottleneck: availableWip <= 0 ? prevStep.process_name : null
  };
}
```

**Behavior UI:**
- WIP card tidak "pindah station" secara visual. WIP card tetap berada dalam station container, namun berpindah dari sub-proses A ke sub-proses B.
- Tombol "Start" di proses B aktif jika `availableWip > 0` (tidak perlu menunggu lot penuh).
- Auto-start guard: Jika proses B idle dan `availableWip > 0`, auto-start tanpa menunggu lot size.

#### 3.2.2. Inter-Station Transfer Rule (Proses antar Station Berbeda)
**Definisi:** Proses N dan Proses N+1 memiliki `station_id` yang berbeda.

**Logic:**
```typescript
function getInterStationWipLedger(currentStepId: string, previousStepId: string) {
  const prevStep = getBopStep(previousStepId);
  const currentStep = getBopStep(currentStepId);
  const lotSize = currentStep.lot_size || project?.default_lot_size || 50;

  // Validasi: harus di station berbeda
  if (prevStep.station_id === currentStep.station_id) return null;

  const completedByPrev = Number(prevStep.completed_qty || 0);
  const consumedByCurrent = Number(currentStep.completed_qty || 0);

  // Inter-station: transfer per lot (dikumpulkan dulu)
  const transferableLots = Math.floor(completedByPrev / lotSize);
  const transferableQty = transferableLots * lotSize;
  const availableWip = Math.max(0, transferableQty - consumedByCurrent);

  const remainingToNextLot = lotSize - (completedByPrev % lotSize);

  return {
    transferMode: "INTER_STATION",
    availableWip,
    canStart: availableWip >= lotSize, // Minimal 1 lot penuh
    requiredLotSize: lotSize,
    transferableLots,
    remainingToNextLot, // Berapa lagi untuk membentuk 1 lot penuh
    inQueue: completedByPrev - transferableQty, // WIP yang sudah selesai tapi belum cukup 1 lot
    bottleneck: availableWip < lotSize ? `${prevStep.process_name} (need ${remainingToNextLot} more for 1 lot)` : null
  };
}
```

**Behavior UI:**
- WIP card muncul di station tujuan hanya jika `availableWip >= lotSize`.
- Jika `completedByPrev` belum cukup 1 lot, ditampilkan **"WIP Accumulating"** progress bar di station asal:
  ```
  [Accumulating for Transfer to ST-02]
  [████████░░░░░░░░░░] 32/50 pcs (need 18 more)
  ```
- Tombol "Start" di station tujuan disabled sampai 1 lot penuh terbentuk.
- Tombol "Force Transfer" (manual override) tersedia untuk supervisor jika urgent (dengan konfirmasi modal).

#### 3.2.3. Unified WIP Ledger
```typescript
function getProcessWipLedger(stepId: string) {
  const processPreds = getDirectProcessPredecessors(stepId);
  if (processPreds.length === 0) {
    // Step pertama: WIP dari material (sudah dihandle oleh material flow)
    return getMaterialBasedWip(stepId);
  }

  let minAvailableWip = Infinity;
  let bottleneckProcess = "";
  let transferMode: "INTRA" | "INTER" = "INTRA";

  for (const pred of processPreds) {
    let ledger;
    if (isSameStation(pred.id, stepId)) {
      ledger = getIntraStationWipLedger(stepId, pred.id);
      transferMode = "INTRA";
    } else {
      ledger = getInterStationWipLedger(stepId, pred.id);
      transferMode = "INTER";
    }

    if (ledger && ledger.availableWip < minAvailableWip) {
      minAvailableWip = ledger.availableWip;
      bottleneckProcess = ledger.bottleneck || pred.process_name;
    }
  }

  const isStarved = transferMode === "INTER" 
    ? minAvailableWip < (getBopStep(stepId).lot_size || 1)
    : minAvailableWip <= 0;

  return {
    availableWip: minAvailableWip,
    isStarved,
    bottleneckProcess,
    transferMode,
    canStart: !isStarved && hasOperatorAssigned(stepId) && !hasActiveNdp(stepId)
  };
}
```

---

### 3.3. Process Lifecycle State Machine (BARU)

Setiap **proses** (bukan station) memiliki state machine yang ketat:

```
PLANNED
    ↓ (Master locked, material ready, operator assigned)
SETUP
    ↓ (WIP tersedia: intra > 0 atau inter ≥ lotSize)
RUNNING
    ↓ (completed_qty ≥ target_qty)
COMPLETED
    ↓ (Auto-route ke proses berikutnya)
TRANSFERRED
```

**State Tambahan:**
- `PAUSED_MANUAL`: Operator/teknisi pause proses.
- `PAUSED_NDP`: NDP aktif pada proses ini.
- `STARVED`: WIP tidak tersedia (menunggu predecessor atau material).
- `WAITING_OPERATOR`: Material & WIP ready, tapi belum ada operator assigned.

**Transisi State:**
| Dari | Ke | Trigger | Guard Condition |
|------|----|---------|-----------------|
| PLANNED | SETUP | Auto / Manual | `isMasterSet && materialReady && operatorAssigned` |
| SETUP | RUNNING | Auto / Manual | `availableWip > 0` (intra) atau `≥ lotSize` (inter) |
| RUNNING | COMPLETED | Auto | `completed_qty >= target_qty` |
| RUNNING | PAUSED_MANUAL | Manual | Operator klik Pause |
| RUNNING | PAUSED_NDP | Auto/Manual | NDP issued untuk proses ini |
| RUNNING | STARVED | Auto | WIP habis (predecessor belum supply) |
| STARVED | SETUP | Auto | WIP datang (predecessor supply atau material diterima) |
| PAUSED_* | RUNNING | Manual | Resume button / NDP resolved |

---

### 3.4. Countdown & Cycle Time per Process (REVISI)

#### 3.4.1. Countdown Attachment
Countdown tidak lagi terpasang pada `stationTimers[station.id]`, melainkan pada `processTimers[process.id]`.

```typescript
interface ProcessTimer {
  processId: string;
  remainingSeconds: number;
  totalSeconds: number;
  progressPercent: number;
  mode: "INTRA" | "INTER";
}
```

#### 3.4.2. Countdown Logic
```typescript
useEffect(() => {
  const interval = setInterval(() => {
    processSteps.forEach(step => {
      if (step.status !== 'RUNNING') return;

      const ff = Number(project?.factory_factor || 85);
      const stdMins = step.cycle_time_minutes || 60;
      const adjMins = stdMins * (100 / ff);
      const cycleSecs = Math.max(1, adjMins * 60);

      // Untuk intra-station: countdown per unit
      // Untuk inter-station: countdown per lot (cycle time × lot size)
      const isIntra = isIntraStationTransfer(step.id);
      const lotSize = isIntra ? 1 : (step.lot_size || 50);
      const totalCycleSecs = cycleSecs * lotSize;

      setProcessTimers(prev => {
        const current = prev[step.id] || { remainingSecs: totalCycleSecs, totalSecs: totalCycleSecs };
        const newRemaining = Math.max(0, current.remainingSecs - 1);

        if (newRemaining <= 0) {
          // Auto-increment
          handleIncrementProcess(step.id, lotSize);
          return {
            ...prev,
            [step.id]: { remainingSecs: totalCycleSecs, totalSecs: totalCycleSecs, progressPercent: 0 }
          };
        }

        const elapsed = totalCycleSecs - newRemaining;
        const progress = Math.min(100, (elapsed / totalCycleSecs) * 100);

        return {
          ...prev,
          [step.id]: { remainingSecs: newRemaining, totalSecs: totalCycleSecs, progressPercent: progress }
        };
      });
    });
  }, 1000);
  return () => clearInterval(interval);
}, [processSteps, project, factoryFactor]);
```

#### 3.4.3. UI Countdown per Process
```tsx
<div className="mt-2 space-y-1">
  <div className="flex justify-between items-center text-[10px] font-mono text-stone-500">
    <span>{formatCountdown(timer.remainingSeconds)}</span>
    <span>{Math.round(timer.progressPercent)}%</span>
    <span className="text-[9px] uppercase font-bold text-stone-400">
      {isIntra ? "per unit" : `per lot (${lotSize} pcs)`}
    </span>
  </div>
  <div className="w-full bg-stone-200 h-1.5 rounded-full overflow-hidden">
    <div 
      className="bg-emerald-500 h-full transition-all duration-1000 ease-linear" 
      style={{ width: `${timer.progressPercent}%` }}
    />
  </div>
</div>
```

---

### 3.5. BOP Visual Routing dengan Dashed Border Outline (TETAP)

#### 3.5.1. Process Node Styling
Setiap process node menggunakan styling yang konsisten dengan BOP Engineering Editor:

```tsx
<div className={cn(
  "relative p-5 rounded-2xl border-2 border-dashed transition-all",
  step.status === 'RUNNING' ? "border-emerald-400 bg-emerald-50/30" :
  step.status === 'STARVED' ? "border-amber-400 bg-amber-50/30" :
  step.status === 'PAUSED_NDP' ? "border-rose-400 bg-rose-50/30" :
  "border-stone-300 bg-white"
)}>
  {/* Dashed outline tetap dipertahankan meskipun status berubah */}
  <div className="absolute -top-3 left-4 px-2 bg-white text-[10px] font-black uppercase tracking-wider text-stone-500">
    {step.station_code} — {step.process_name}
  </div>

  {/* Content */}
</div>
```

#### 3.5.2. Connector Styling
```tsx
{/* Intra-station connector: pendek, solid */}
<div className="flex items-center px-1">
  <div className="w-4 h-0.5 bg-stone-400 relative">
    <div className="absolute -right-1 -top-1 w-2 h-2 border-t-2 border-r-2 border-stone-400 transform rotate-45" />
  </div>
</div>

{/* Inter-station connector: panjang, dashed, dengan label lot size */}
<div className="flex items-center px-4">
  <div className="w-12 h-0.5 border-t-2 border-dashed border-stone-400 relative">
    <div className="absolute -right-1.5 -top-1.5 w-3 h-3 border-t-2 border-r-2 border-stone-400 transform rotate-45" />
    <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] font-bold text-stone-400 bg-stone-50 px-1">
      Lot {step.lot_size || 50}
    </span>
  </div>
</div>
```

---

### 3.6. Production Hub Robustness Enhancement

#### 3.6.1. Auto-Start Guard per Process (Bukan per Station)
```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    if (currentPhase !== 'EXECUTION' || !isMasterSet) return;

    processSteps.forEach(step => {
      const pStatus = getProcessStatus(step.id); // PLANNED, SETUP, RUNNING, etc.
      if (pStatus !== 'SETUP' && pStatus !== 'STARVED') return;

      const wip = getProcessWipLedger(step.id);
      const hasOp = hasOperatorAssigned(step.id);
      const noNdp = !hasActiveNdp(step.id);
      const noManualPause = !step.manual_pause_flag;

      if (wip.canStart && hasOp && noNdp && noManualPause) {
        handleStartProcess(step.id, false); // Auto-start
      }
    });
  }, 5000);
  return () => clearInterval(interval);
}, [processSteps, currentPhase, isMasterSet]);
```

#### 3.6.2. Dynamic Operator Rebalancing within Station
Jika station memiliki 3 proses dan 1 proses starved, operator bisa di-reassign ke proses lain dalam station yang sama tanpa pindah fisik.

```typescript
function rebalanceOperatorsInStation(stationId: string) {
  const stationProcesses = processSteps.filter(s => s.station_id === stationId);
  const starvedProcesses = stationProcesses.filter(p => getProcessStatus(p.id) === 'STARVED');
  const readyProcesses = stationProcesses.filter(p => {
    const wip = getProcessWipLedger(p.id);
    return wip.canStart && getProcessStatus(p.id) === 'SETUP';
  });

  // Pindahkan operator dari proses starved ke proses ready dalam station yang sama
  for (const starved of starvedProcesses) {
    const assignments = getAssignmentsForProcess(starved.id);
    for (const assignment of assignments) {
      if (readyProcesses.length > 0) {
        const target = readyProcesses[0];
        reassignOperator(assignment.manpower_id, starved.id, target.id);
        readyProcesses.shift();
      }
    }
  }
}
```

#### 3.6.3. WIP Accumulation Visual Indicator (Inter-Station)
Untuk inter-station transfer, tampilkan visual "WIP sedang mengumpulkan" di proses predecessor:

```tsx
{ledger.transferMode === "INTER" && ledger.inQueue > 0 && (
  <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
    <div className="text-[10px] font-bold text-blue-700 flex justify-between">
      <span>Accumulating for Transfer</span>
      <span>{ledger.inQueue} / {ledger.requiredLotSize} pcs</span>
    </div>
    <div className="w-full bg-blue-200 h-1.5 rounded-full mt-1 overflow-hidden">
      <div 
        className="bg-blue-500 h-full transition-all" 
        style={{ width: `${(ledger.inQueue / ledger.requiredLotSize) * 100}%` }}
      />
    </div>
    <div className="text-[9px] text-blue-600 mt-0.5">
      Need {ledger.remainingToNextLot} more to form 1 lot
    </div>
  </div>
)}
```

#### 3.6.4. Process-Based NDP (Non-Delivery Problem)
NDP tidak lagi di-attach ke `station_id`, melainkan ke `bop_step_id` (process id).

```typescript
// NDP record
{
  id: "ndp_001",
  project_id: "proj_123",
  bop_step_id: "step_cutting_01", // Process-specific, bukan station
  station_id: "st_01", // Tetap dicatat untuk referensi fisik
  reason_category: "MATERIAL_SHORTAGE",
  status: "ACTIVE"
}
```

---

### 3.7. Project Detail — Process Flow Mirror & Robustness

#### 3.7.1. BOP Process Flow Read-Only Mirror
`ProjectDetails.tsx` menampilkan mini conveyor board berbasis proses (read-only) yang menunjukkan:
- Status setiap proses ( Running / Starved / Completed / Paused ).
- WIP position: "Sedang di Proses #3: Welding".
- Transfer mode indicator: "Intra-Station" atau "Inter-Station (Lot 50)".

#### 3.7.2. Process Completion Timeline
Timeline vertikal di Project Detail menampilkan:
- Tanggal & waktu setiap proses selesai.
- Durasi aktual vs standard cycle time.
- Variance analysis: "Cutting selesai 15% lebih cepat dari standard".

#### 3.7.3. Station Utilization Heatmap
Di bawah BOP Progress Mirror, tambahkan heatmap yang menunjukkan:
- Berapa lama station digunakan oleh proses-proses yang di-assign.
- Idle time per station.
- Utilization rate: `(total cycle time of assigned processes) / (available working time)`.

---

## 4. Perubahan pada Kode Eksisting

### 4.1. [CRITICAL] `ProductionPhaseExecution.tsx` — Conveyor Board Refactor

**Lokasi Kode:**
```typescript
// SAAT INI: Mapping berdasarkan stations
{safeStations.map((station, index) => {
  const stationWots = safeWots.filter(w => w.current_station_id === station.id);
  // ... render station card
})}
```

**Perbaikan:**
```typescript
// BARU: Mapping berdasarkan processSteps (BOP)
// Kelompokkan processSteps berdasarkan station untuk visual grouping
const stationGroups = useMemo(() => {
  const groups = new Map<string, any[]>();
  processSteps.forEach(step => {
    const stId = step.station_id || 'unassigned';
    if (!groups.has(stId)) groups.set(stId, []);
    groups.get(stId)!.push(step);
  });
  return Array.from(groups.entries()).map(([stationId, steps]) => ({
    stationId,
    station: safeStations.find(s => s.id === stationId),
    steps: steps.sort((a, b) => (a.step_sequence || 0) - (b.step_sequence || 0))
  }));
}, [processSteps, safeStations]);

// Render: Station Container → Process Nodes
{stationGroups.map((group, gIndex) => (
  <div key={group.stationId} className="station-container">
    {/* Station Header */}
    <div className="station-header">{group.station?.station_name}</div>

    {/* Process Nodes dalam station */}
    <div className="flex gap-4">
      {group.steps.map((step, sIndex) => (
        <React.Fragment key={step.id}>
          <ProcessNode 
            step={step} 
            wipLedger={getProcessWipLedger(step.id)}
            timer={processTimers[step.id]}
            isLastInStation={sIndex === group.steps.length - 1}
          />

          {/* Intra-station connector */}
          {sIndex < group.steps.length - 1 && (
            <IntraStationConnector />
          )}
        </React.Fragment>
      ))}
    </div>

    {/* Inter-station connector */}
    {gIndex < stationGroups.length - 1 && (
      <InterStationConnector lotSize={group.steps[group.steps.length-1]?.lot_size || 50} />
    )}
  </div>
))}
```

### 4.2. [CRITICAL] `ProjectProductionHub.tsx` — WIP Ledger & State Logic

**Lokasi Kode:**
```typescript
// SAAT INI: getStationWipLedger menggunakan station sebagai unit
const getStationWipLedger = (step: any) => {
  // ... menghitung WIP berbasis station
};
```

**Perbaikan:**
```typescript
// BARU: getProcessWipLedger dengan dual transfer mode
const getProcessWipLedger = (stepId: string) => {
  const step = safeBopSteps.find(s => s.id === stepId);
  if (!step) return { availableWip: 0, isStarved: true, canStart: false };

  const processPreds = getDirectProcessPredecessors(stepId);

  // Step pertama: gunakan material flow (dari dokumen sebelumnya)
  if (processPreds.length === 0) {
    return getMaterialBasedWip(stepId);
  }

  let minWip = Infinity;
  let bottleneck = "";
  let isInterStation = false;

  for (const pred of processPreds) {
    const isIntra = pred.station_id === step.station_id;
    let available;

    if (isIntra) {
      const completedPrev = Number(pred.completed_qty || 0);
      const consumedCurrent = Number(step.completed_qty || 0);
      available = Math.max(0, completedPrev - consumedCurrent);
    } else {
      const lotSize = step.lot_size || project?.default_lot_size || 50;
      const completedPrev = Number(pred.completed_qty || 0);
      const consumedCurrent = Number(step.completed_qty || 0);
      const transferableLots = Math.floor(completedPrev / lotSize);
      available = Math.max(0, (transferableLots * lotSize) - consumedCurrent);
      isInterStation = true;
    }

    if (available < minWip) {
      minWip = available;
      bottleneck = pred.process_name;
    }
  }

  const required = isInterStation 
    ? (step.lot_size || project?.default_lot_size || 50)
    : 1;

  const isStarved = minWip < required;

  return {
    availableWip: minWip,
    isStarved,
    canStart: !isStarved && hasOperatorAssigned(stepId) && !hasActiveNdp(stepId),
    bottleneckProcess: bottleneck,
    transferMode: isInterStation ? "INTER" : "INTRA",
    requiredLotSize: required
  };
};
```

### 4.3. [HIGH] `ProjectProductionHub.tsx` — Auto-Start & Rebalancing

**Perbaikan:**
```typescript
useEffect(() => {
  const interval = setInterval(async () => {
    if (currentPhase !== 'EXECUTION' || !isMasterSet) return;

    // 1. Auto-Start per Process (bukan per Station)
    processSteps.forEach(step => {
      const status = getProcessStatus(step.id);
      if (status !== 'SETUP' && status !== 'STARVED') return;

      const wip = getProcessWipLedger(step.id);
      const hasOp = hasOperatorAssigned(step.id);
      const noNdp = !safeNdps.some(n => n.bop_step_id === step.id && n.status === "ACTIVE");
      const noPause = !step.manual_pause_flag;

      if (wip.canStart && hasOp && noNdp && noPause) {
        handleStartProcess(step.id, false);
      }
    });

    // 2. Intra-Station Operator Rebalancing
    const stationIds = [...new Set(processSteps.map(s => s.station_id))];
    for (const stId of stationIds) {
      await rebalanceOperatorsInStation(stId);
    }
  }, 5000);
  return () => clearInterval(interval);
}, [processSteps, currentPhase, isMasterSet, safeNdps]);
```

### 4.4. [HIGH] `BopEngineeringPage.tsx` / BOP Editor — Transfer Mode Configuration

**Enhancement:**
Di BOP Engineering Editor, setiap edge (koneksi antar proses) harus bisa dikonfigurasi:
- `transfer_mode`: `"INTRA_STATION"` | `"INTER_STATION"` (auto-detect dari station_id, tapi bisa di-override).
- `lot_size`: Jika inter-station, default mengikuti project lot size, tapi bisa di-override per edge.

```typescript
interface BopEdge {
  from_step_id: string;
  to_step_id: string;
  transfer_mode: "INTRA_STATION" | "INTER_STATION";
  lot_size?: number; // Hanya relevan jika INTER_STATION
  transfer_time_minutes?: number; // Lead time antar station
}
```

### 4.5. [MEDIUM] `ProductionPhaseSetup.tsx` — Lot Size Configuration per Process

Tambahkan input **"Inter-Station Lot Size"** di panel Cycle Time Configuration:

```tsx
<td className="p-3">
  <label className="text-[10px] font-bold text-stone-500 block">Lot Size (Inter-Station)</label>
  <Input
    type="number"
    min={1}
    value={step.lot_size || project?.default_lot_size || 50}
    onChange={(e) => handleUpdateLotSize(step.id, Number(e.target.value))}
    className="w-20 text-xs font-mono"
  />
  <span className="text-[9px] text-stone-400">pcs</span>
</td>
```

---

## 5. Database Schema & API Changes

### 5.1. Schema Changes

**A. `bop_steps` (Alter Table)**
```sql
ALTER TABLE bop_steps ADD COLUMN IF NOT EXISTS lot_size INTEGER DEFAULT 50;
ALTER TABLE bop_steps ADD COLUMN IF NOT EXISTS transfer_mode VARCHAR(20) DEFAULT 'INTER_STATION'; -- INTRA_STATION, INTER_STATION
ALTER TABLE bop_steps ADD COLUMN IF NOT EXISTS process_status VARCHAR(50) DEFAULT 'PLANNED'; -- PLANNED, SETUP, RUNNING, COMPLETED, STARVED, PAUSED
```

**B. `bop_edges` (New Table — Jika belum ada)**
```sql
CREATE TABLE bop_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  from_step_id TEXT NOT NULL REFERENCES bop_steps(id),
  to_step_id TEXT NOT NULL REFERENCES bop_steps(id),
  transfer_mode VARCHAR(20) DEFAULT 'INTER_STATION',
  lot_size INTEGER,
  transfer_time_minutes INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);
```

**C. `production_ndp` (Alter Table)**
```sql
ALTER TABLE production_ndp ADD COLUMN IF NOT EXISTS bop_step_id TEXT REFERENCES bop_steps(id);
-- station_id tetap ada untuk referensi fisik lokasi NDP
```

### 5.2. API Endpoints (New/Modified)

| Method | Endpoint | Deskripsi |
|--------|----------|-----------|
| `GET` | `/api/production/bop/:projectId/process-flow` | Ambil BOP steps dengan WIP ledger per process |
| `POST` | `/api/production/bop/:stepId/start` | Start process (bukan station) |
| `POST` | `/api/production/bop/:stepId/pause` | Pause process |
| `POST` | `/api/production/bop/:stepId/increment` | Increment completed_qty per process |
| `POST` | `/api/production/bop/:stepId/transfer-wip` | Trigger WIP transfer ke proses berikutnya |
| `GET` | `/api/production/stations/:id/processes` | Ambil semua proses dalam 1 station |
| `PUT` | `/api/production/bop/:stepId/lot-size` | Update lot size per process |

---

## 6. Indikator Keberhasilan (Success Criteria)

- [ ] Conveyor board di `ProductionPhaseExecution.tsx` menampilkan **process nodes** sebagai unit utama, bukan station cards.
- [ ] Setiap process node memiliki **dashed border outline** (konsisten dengan BOP Editor).
- [ ] **Countdown timer** terpasang pada setiap proses, dengan mode "per unit" (intra) atau "per lot" (inter).
- [ ] **Intra-Station Transfer**: WIP bisa berpindah proses dalam station yang sama **per 1 unit** tanpa menunggu lot penuh.
- [ ] **Inter-Station Transfer**: WIP hanya berpindah ke station lain jika sudah terkumpul **minimum 1 lot WOT**.
- [ ] Visual **"WIP Accumulating"** muncul di proses predecessor jika belum cukup 1 lot untuk inter-station transfer.
- [ ] `getProcessWipLedger()` menggantikan `getStationWipLedger()` dan menghitung WIP berbasis proses dengan memperhatikan transfer mode.
- [ ] **Auto-start guard** bekerja per proses, bukan per station.
- [ ] **Operator rebalancing** bekerja dalam station yang sama (intra-station) jika salah satu proses starved.
- [ ] NDP di-attach ke `bop_step_id` (proses), bukan hanya ke `station_id`.
- [ ] `ProjectDetails.tsx` menampilkan **process flow mirror** dengan status per proses dan transfer mode indicator.
- [ ] Station container tetap ada sebagai **visual grouping**, namun tidak lagi sebagai unit logika WIP.

---

## 7. Catatan Implementasi

### 7.1. Backward Compatibility
- Jika `transfer_mode` belum diisi di database (migration lama), default ke `INTER_STATION` untuk menjaga behavior existing.
- Jika `lot_size` belum diisi, default ke `project.qty` (1 lot = 1 SPK) atau 50 pcs.
- Flag `ENABLE_PROCESS_BASED_FLOW = true` diaktifkan per project setelah BOP di-reconfigure.

### 7.2. Performance
- `getProcessWipLedger()` dipanggil setiap 5 detik oleh auto-start guard. Pastikan query tidak N+1.
- Gunakan `useMemo` untuk `stationGroups` dan `processWipLedgers` agar tidak re-render berlebihan.
- Countdown interval (1 detik) hanya aktif untuk proses yang berstatus `RUNNING`.

### 7.3. Testing Scenarios
1. **Scenario A**: Proses #1 (Blanking) dan #2 (Cutting) di ST-01. Proses #1 selesai 5 pcs. Expected: Proses #2 bisa langsung start dengan 5 pcs WIP (intra-station).
2. **Scenario B**: Proses #2 (Cutting) di ST-01, Proses #3 (Welding) di ST-02. Lot size = 50. Proses #2 selesai 45 pcs. Expected: Proses #3 status = STARVED, visual "Accumulating 45/50" muncul di ST-01.
3. **Scenario C**: Sama seperti B, tapi Proses #2 selesai 55 pcs. Expected: Proses #3 bisa start dengan 50 pcs WIP (1 lot), 5 pcs tetap di ST-01 sebagai sisa.
4. **Scenario D**: ST-01 menjalankan 3 proses. Proses #2 starved. Expected: Operator dari Proses #2 auto-reassigned ke Proses #1 atau #3 dalam ST-01 yang sedang butuh operator.
5. **Scenario E**: BOP dengan parallel processes (Proses B dan C setelah A). Expected: Kedua proses bisa running bersamaan jika WIP tersedia, dengan connector garis putus-putus.

---

*Dokumen ini merupakan prompt pengembangan fitur untuk tim Developer / Business Analyst — Fokus: Refactor Conveyor Board ke BOP-Based Process Flow dengan Dual WIP Transfer Logic.*
