# SPESIFIKASI TEKNIS: TOTAL REVAMP FLOOR EXECUTION
## WOT-Centric Station-Based Auto-Orchestration Engine

**Versi:** 2.0  
**Tanggal:** 2026-09-02  
**Status:** Development Specification  
**Modul:** Production Execution Hub, Shop Floor Terminal, Warehouse Integration

---

## 1. KONTeks & LATAR BELAKANG

Sistem floor execution yang ada saat ini bersifat **station-reactive** dan **manually-triggered** — operator harus mengklik tombol "Start" per proses, memantau WIP dalam bentuk angka agregat (`completed_qty`), dan memindahkan lot secara manual. Hal ini menyebabkan:

- **WIP Blindness**: Sistem tidak mengetahui WOT (Work Order Ticket) mana yang sedang berada di stasiun mana dalam waktu nyata.
- **Manpower Inefficiency**: Satu operator bisa menumpuk di satu proses sementara proses lain dalam stasiun yang sama kekurangan tenaga kerja.
- **Tidak Ada Forecasting Matematis**: Tidak ada estimasi berapa lama 1 WOT akan selesai dari root hingga leaf, baik end-to-end maupun per-stasiun.
- **NDP Isolation**: NDP dianggap sekadar pause manual tanpa integrasi ke procurement pipeline dan warehouse receipt.
- **Human Bottleneck**: Setiap perpindahan proses memerlukan klik tombol, padahal 90% keputusan tersebut dapat diautomasi berdasarkan aturan WIP dan manpower.

---

## 2. TUJUAN & PRINSIP ARSITEKTUR

### 2.1. Tujuan Utama

Merombak total mekanisme floor execution menjadi **WOT-Centric Station-Based Auto-Orchestration Engine** dengan karakteristik:

| Aspek | Sebelum (Existing) | Sesudah (Target) |
|-------|-------------------|------------------|
| **Unit WIP** | Qty agregat (`completed_qty`) | Entity WOT (Work Order Ticket) |
| **Trigger** | Manual click per station | Single "Start Production", then auto-flow |
| **Manpower** | Assigned ke task/process statis | Dynamic orchestration dalam scope station |
| **Estimasi** | Tidak ada | Matematika CPM per WOT end-to-end & per station |
| **Inter-process gate** | Cek angka qty | Cek entity WOT completed |
| **Inter-station gate** | Tidak terstruktur | WOT completed = auto-transfer |
| **NDP** | Pause manual | Pause + auto-PR + warehouse receipt gate |
| **Human control** | Start/Stop per station | Pause & Continue saja |

### 2.2. Prinsip Dasar

1. **WOT adalah Entitas Atomik**: WOT bukan sekadar label lot, melainkan entitas fisik yang mengalir melalui stasiun dan proses dengan status lifecycle yang jelas.
2. **Station adalah Cluster Eksekusi**: Station adalah pengelompokan logical dari satu atau lebih proses BOP. Manpower di-assign ke Station, bukan ke proses individual.
3. **Auto-Orchestration**: Sistem secara otomatis mengalokasikan manpower ke proses dalam station berdasarkan algoritma prioritas, load balancing, dan work stealing.
4. **Gate Rule Minimal 1 WOT**: Proses downstream tidak bisa berjalan sampai ada minimal 1 WOT berstatus `COMPLETED` dari semua predecessor-nya.
5. **Mathematical Transparency**: Setiap WOT memiliki estimasi waktu selesai yang dihitung secara matematis berdasarkan Cycle Time, Manpower, Factory Factor, dan Working Hours.

---

## 3. ARSITEKTUR ENTITY & RELATIONSHIP

### 3.1. Entity Relationship Diagram (Konseptual)

```
Project (1)
  ├── WOT [1...N] (Work Order Ticket)
  │     ├── wot_id, lot_number, qty
  │     ├── current_station_id, current_process_id
  │     └── status: PLANNED → QUEUED → RUNNING → COMPLETED → TRANSFERRED → RECEIVED
  │
  ├── Station [1...N] (Physical/Logical Work Center)
  │     ├── station_sequence (urutan eksekusi)
  │     ├── Process [1...N] (BOP Routing Steps yang di-map ke Station)
  │     └── Manpower [1...N] (Operator yang di-assign ke Station)
  │
  └── NDP [0...N] (Notice to Down Process — blocker)
        ├── category, description, related_pr_id
        └── status: ACTIVE → BLOCKED_PENDING_PROCUREMENT → RESOLVED
```

### 3.2. WOT Lifecycle State Machine

```
PLANNED 
   │
   ├──[Generate Lots]──► QUEUED 
   │                       │
   │                       ├──[Start Production]──► RUNNING
   │                       │                          │
   │                       │                          ├──[Finish Process]──► COMPLETED
   │                       │                          │                        │
   │                       │                          │                        ├──[Intra-Station]──► QUEUED (Next Process)
   │                       │                          │                        │
   │                       │                          │                        └──[Last Process in Station]──► TRANSFERRED
   │                       │                          │                                                   │
   │                       │                          │                                                   └──[Receipt Scan]──► RECEIVED (Next Station)
   │                       │                          │
   │                       │                          └──[Pause by User/NDP]──► PAUSED
   │                       │                                                     │
   │                       │                                                     └──[Continue Clicked]──► RUNNING
   │                       │
   │                       └──[NDP Active on Station]──► BLOCKED
   │
   └──[Last Station Complete]──► FINISHED (Project Complete)
```

### 3.3. Station Scope Definition

- **Station** adalah clustering logical dari 1 atau lebih proses BOP.
- 1 Project bisa memiliki banyak Station.
- 1 Station bisa melayani banyak Project (multi-project station), namun **WOT queue harus terpisah per project**.
- **Manpower Assignment** dilakukan ke **Station**, bukan ke proses individual.
- Setiap manpower dalam station memiliki `eligible_processes`: daftar proses yang bisa dikerjakan oleh manpower tersebut.
- **Station Scope Enforcement**: Manpower hanya bisa mengerjakan proses yang berada dalam station yang sama. API guard wajib menolak assignment lintas station.

---

## 4. FITUR DETAIL & MEKANISME

### 4.1. WOT-Centric WIP Flow & Transfer Gate

#### 4.1.1. WOT sebagai Unit Atomik WIP

Setiap WOT memiliki atribut:
- `wot_id`, `lot_number`, `qty` (jumlah unit dalam 1 WOT)
- `current_station_id`, `current_process_id`
- `status` (PLANNED, QUEUED, RUNNING, COMPLETED, TRANSFERRED, RECEIVED, FINISHED)
- `source_station_id`, `target_station_id` (untuk inter-station transfer)
- `timestamp_in`, `timestamp_out`, `operator_id` (untuk genealogy)

**WIP Buffer** per proses tidak lagi `availableQty: number`, melainkan `completedWots: WOT[]`.

#### 4.1.2. Inter-Process Transfer Gate (Intra-Station)

**Rule 11.1 — Piece Flow dalam 1 Station:**

Jika berpindah proses namun tetap dalam 1 station, maka required WIP-nya adalah **per unit proses selesai** (bukan per WOT). Artinya, jika 1 unit selesai di proses A, unit tersebut langsung bisa mengalir ke proses B dalam station yang sama tanpa menunggu seluruh WOT selesai.

```typescript
function canStartNextProcessIntraStation(currentProcessId, nextProcessId, wotId) {
  // Cek apakah nextProcess berada dalam station yang sama
  if (getStation(currentProcessId) !== getStation(nextProcessId)) return false;

  // Untuk intra-station: cukup cek apakah ada unit yang selesai di current process
  // WOT tetap menjadi container, tapi unit individual bisa mengalir
  const completedUnits = getCompletedUnits(currentProcessId);
  return completedUnits > 0;
}
```

**Catatan**: WOT tetap menjadi entity tracking, namun dalam 1 station, WOT bisa berstatus `RUNNING` di beberapa proses secara bersamaan (pipeline) karena unit individual mengalir satu per satu.

#### 4.1.3. Inter-Station Transfer Gate (Inter-Station)

**Rule 11.2 — Minimum 1 Lot WOT antar Station:**

Jika berpindah dari Station N ke Station N+1, maka required-nya adalah **minimum 1 WOT berstatus COMPLETED** di last process Station N.

```typescript
function canTransferToNextStation(currentStationId, nextStationId) {
  const lastProcess = getLastProcessInStation(currentStationId);
  const completedWots = getWipBuffer(lastProcess.id).filter(w => w.status === 'COMPLETED');

  // Gate Rule: Minimal 1 WOT completed
  if (completedWots.length < 1) return false;

  // Cek apakah Station N+1 memiliki manpower assigned
  if (getActiveManpowerInStation(nextStationId).length === 0) return false;

  // Cek apakah ada NDP aktif di Station N+1
  if (hasActiveNDP(nextStationId)) return false;

  // Cek material/product node availability untuk Station N+1
  if (!isMaterialAvailable(nextStationId)) return false;

  return true;
}
```

**Auto-Queue Mechanism:**
- WOT yang completed di last process Station N akan **auto-queue** ke first process Station N+1.
- Transfer hanya terjadi jika semua kondisi gate terpenuhi.
- WOT yang di-consume oleh downstream harus di-flag `TRANSFERRED` (soft-delete dari upstream WIP buffer).

#### 4.1.4. Merge Node Gate (Proses dengan Banyak Predecessor)

Untuk proses dengan `predecessor_ids` (merge node):
- Jika predecessor adalah **serial** (A → B): B bisa start jika ada ≥1 unit/WOT dari A berstatus `COMPLETED`.
- Jika predecessor adalah **merge** (A + B → C): C bisa start jika ada ≥1 WOT/unit dari A **DAN** ≥1 WOT/unit dari B yang `COMPLETED`.
- Untuk merge node dalam 1 station: unit-level. Untuk merge node antar station: WOT-level.

---

### 4.2. Estimasi Siklus 1 WOT End-to-End (Matematika)

#### 4.2.1. Rumus Dasar per Proses

```
T_process (menit) = (CT_minutes × Qty_wot) / (MP_count × FF/100)
```

Dimana:
- `CT_minutes` = Cycle Time per unit (dari BOP/Setup)
- `Qty_wot` = Jumlah unit dalam 1 WOT
- `MP_count` = Jumlah manpower yang aktif di proses tersebut
- `FF` = Factory Factor (%)

**Konversi ke Hari Kalender:**
```
T_process (hari) = T_process (menit) / (WH × 60)
```

Dimana `WH` = Working Hours per hari (default 8, overrideable per station).

#### 4.2.2. Parallel vs Serial dalam BOP

Untuk path yang memiliki branching/merging dalam BOP:

```
T_parallel_path = MAX(T_branch1, T_branch2, ..., T_branchN)
T_serial_path   = SUM(T_process1, T_process2, ..., T_processN)
T_total_wot     = SUM(T_serial_segments) + MAX(T_parallel_segments)
```

#### 4.2.3. Critical Path Method (CPM) per WOT

Sistem menghitung **Earliest Start (ES)**, **Earliest Finish (EF)**, **Latest Start (LS)**, **Latest Finish (LF)**, dan **Float** untuk **setiap WOT**, bukan untuk project keseluruhan.

```typescript
function calculateWotCPM(wotId: string, bopGraph: Graph, assignments: Assignment[]) {
  const nodes = bopGraph.processes.map(p => {
    const mp = assignments.filter(a => a.process_id === p.id).length || 1;
    const ct = p.cycle_time_minutes || 60;
    const durationDays = (wot.qty * ct) / (mp * (FF / 100) * WH * 60);
    return { ...p, duration: Math.max(0.01, durationDays), mp };
  });

  // Forward Pass (ES, EF)
  nodes.forEach(n => {
    const preds = getPredecessors(n.id);
    n.es = preds.length > 0 ? Math.max(...preds.map(p => p.ef || 0)) : 0;
    n.ef = n.es + n.duration;
  });

  // Backward Pass (LS, LF)
  const projectEF = Math.max(...nodes.map(n => n.ef));
  [...nodes].reverse().forEach(n => {
    const succs = getSuccessors(n.id);
    n.lf = succs.length > 0 ? Math.min(...succs.map(s => s.ls || projectEF)) : projectEF;
    n.ls = n.lf - n.duration;
  });

  // Critical Path: Float ≈ 0
  return nodes.map(n => ({
    ...n,
    float: n.ls - n.es,
    is_critical: Math.abs(n.ls - n.es) < 0.001
  }));
}
```

#### 4.2.4. Tampilan UI Estimasi

- **WOT Lead Time**: "WOT #001 estimated 2.4 days from Station 1 to Station 4"
- **Cumulative ETA**: Timeline visual per WOT menunjukkan kapan WOT tersebut akan selesai di setiap station.
- **Gap Analysis**: Jika `T_total_wot × jumlah_WOT > Available_days`, tampilkan warning merah dengan rekomendasi:
  - "Tambah manpower di Station X"
  - "Kurangi WOT size dari 100 pcs menjadi 50 pcs"
  - "Aktifkan overtime schedule"

---

### 4.3. Station-Based Process Clustering & Manpower Orchestration

#### 4.3.1. Station Definition

Station didefinisikan di fase Setup dengan atribut:
- `station_id`, `station_code`, `station_name`
- `station_sequence` (urutan eksekusi antar station: 1, 2, 3, ...)
- `work_center` (physical location)
- `max_manpower` (kapasitas manpower maksimum)
- `process_ids[]` (daftar proses BOP yang termasuk dalam station)
- `working_hours` (WH per hari, default 8)

#### 4.3.2. Manpower Assignment ke Station

- Manpower di-assign ke Station dengan `eligible_processes`: array process_id yang bisa dikerjakan.
- Contoh: Manpower X eligible untuk proses A dan C. Manpower Y eligible untuk proses B.
- **Scope Enforcement**: Manpower tidak bisa dikerjakan proses di luar station-nya. API guard wajib menolak.

#### 4.3.3. Dynamic Manpower Orchestration Algorithm

Algoritma dijalankan setiap **5 detik** (interval) atau **event-triggered** (WOT completed, manpower status changed, NDP resolved).

```typescript
function orchestrateStation(stationId: string) {
  const manpowers = getActiveManpowers(stationId).filter(m => m.status !== 'OFFLINE');
  const processes = getProcessesInStation(stationId);
  const wipBuffers = getWipBuffers(stationId); // WOT[] atau Unit[] per process

  // ─── PHASE 1: Priority Assignment (Prerequisite-aware) ───
  for (const mp of manpowers) {
    if (mp.status === 'BUSY') continue;

    // Cari proses eligible dengan WIP tertinggi & prerequisite terpenuhi
    const candidates = mp.eligible_processes
      .map(pid => ({
        process_id: pid,
        wip_count: getReadyWipCount(pid, stationId), // QUEUED + READY
        prerequisite_met: checkPrerequisites(pid, stationId),
        is_merge_node: getPredecessors(pid).length > 1,
        current_mp_count: countManpowerOnProcess(pid)
      }))
      .filter(c => c.wip_count > 0 && c.prerequisite_met)
      .sort((a, b) => {
        // Merge node dengan WIP adalah highest priority
        if (a.is_merge_node && !b.is_merge_node) return -1;
        if (!a.is_merge_node && b.is_merge_node) return 1;
        // Lalu sort by WIP count descending
        return b.wip_count - a.wip_count;
      });

    if (candidates.length > 0) {
      assignManpowerToProcess(mp, candidates[0].process_id);
    }
  }

  // ─── PHASE 2: Load Balancing (Work Stealing) ───
  // Jika ada manpower idle dan manpower lain overload (>1 process backlog)
  const idleMp = manpowers.filter(m => m.status === 'IDLE');

  for (const idle of idleMp) {
    const stealCandidates = processes
      .filter(p => idle.eligible_processes.includes(p.id))
      .map(p => ({
        process_id: p.id,
        backlog: getQueuedWipCount(p.id),
        current_mp_count: countManpowerOnProcess(p.id),
        is_merge_node: getPredecessors(p.id).length > 1
      }))
      .filter(c => c.backlog > 1 && c.current_mp_count > 0)
      .sort((a, b) => {
        if (a.is_merge_node && !b.is_merge_node) return -1;
        if (!a.is_merge_node && b.is_merge_node) return 1;
        return b.backlog - a.backlog;
      });

    if (stealCandidates.length > 0) {
      assignManpowerToProcess(idle, stealCandidates[0].process_id);
    }
  }

  // ─── PHASE 3: Auto-Switching (C → A loop) ───
  // Jika manpower selesai dari C, cek apakah A memiliki WOT. Jika ya, switch ke A.
  for (const mp of manpowers) {
    if (mp.current_process && mp.task_progress === 'DONE') {
      const next = getNextProcessForManpower(mp, wipBuffers);
      if (next && next.id !== mp.current_process_id) {
        switchManpowerProcess(mp, next.id);
      }
    }
  }
}
```

#### 4.3.4. Detail Kasus 5.1 (X: A&C, Y: B)

**Skenario:** Station S1 memiliki Proses: A → C, B → C (C memerlukan prasyarat A dan B). Manpower: X (eligible: A, C), Y (eligible: B).

| Step | Kondisi WIP | Aksi Sistem |
|------|-------------|-------------|
| 1 | WIP A = 10 WOT, WIP B = 0 | X ke A. Y idle (tunggu B). |
| 2 | WIP B mulai terbentuk | Y ke B. X masih di A. |
| 3 | WIP C ≥ 1 WOT (A & B completed) | X auto-switch ke C (priority C > A karena C adalah bottleneck merge). |
| 4 | X selesai C, WIP A masih ada | X auto-switch kembali ke A. |
| 5 | Y selesai B, X masih sibuk A+C | Y idle → Phase 2 trigger → Y steal process A dari X. X fokus ke C. |

**Penjelasan Phase 2 (Work Stealing):**
Ketika Y selesai mengerjakan B dan X masih sibuk mengerjakan A (karena backlog A masih tinggi), maka Y yang idle akan mencuri (steal) proses A dari X. Hasilnya: X fokus ke C (merge bottleneck), Y mengambil alih A. Distribusi beban menjadi merata.

#### 4.3.5. Station Scope Enforcement

```typescript
// API Guard
function validateManpowerAssignment(manpowerId, processId, stationId) {
  const process = getProcess(processId);
  const manpower = getManpower(manpowerId);

  // Rule: Process harus berada dalam station yang sama
  if (process.station_id !== stationId) {
    throw new Error("Process tidak berada dalam station yang dituju");
  }

  // Rule: Manpower harus eligible untuk process tersebut
  if (!manpower.eligible_processes.includes(processId)) {
    throw new Error("Manpower tidak eligible untuk process ini");
  }

  return true;
}
```

---

### 4.4. Estimasi Siklus 1 WOT per Station (Matematika)

#### 4.4.1. Rumus Station Lead Time

```
T_station (hari) = MAX_over_parallel_branches(
  SUM_serial_processes( (CT_i × Qty_wot) / (MP_i × FF/100) )
) / (WH × 60)
```

#### 4.4.2. Bottleneck Detection per Station

```
Bottleneck_Process = argmax( (CT_i × Qty_wot) / (MP_i × FF/100) )
Station_Utilization = SUM(MP_i_active) / SUM(MP_i_assigned) × 100%
```

#### 4.4.3. Tampilan UI per Station Card

- **Station ETA**: "Station 2 akan selesai memproses WOT #005 dalam 4.2 jam"
- **Bottleneck Indicator**: Proses mana yang memperlambat station (highlight merah/orange).
- **Manpower Utilization Gauge**: Berapa % dari waktu manpower aktif vs idle.
- **WOT Queue Depth**: Berapa WOT yang mengantre di station ini.

---

### 4.5. "Start Production" Trigger & Auto-Flow

#### 4.5.1. Pre-Flight Checklist (Saat Button Diklik)

Sebelum "Start Production" di-trigger, sistem wajib memverifikasi:

```
□ Station memiliki ≥1 manpower assigned
□ First process memiliki WOT queued ≥ 1
□ Material/Product Node untuk first process tersedia (scan/warehouse)
□ Tidak ada NDP aktif di station
□ Previous station (jika bukan root) memiliki WOT completed ≥ 1
```

#### 4.5.2. Post-Trigger Auto-Flow

1. Sistem mengambil WOT pertama dari queue.
2. Manpower di-assign ke first process sesuai algoritma orchestration.
3. Timer cycle time mulai berjalan.
4. Setelah unit/WOT completed di proses:
   - Jika masih ada proses lain dalam station yang sama → auto-queue ke proses berikutnya (intra-station transfer).
   - Jika sudah last process dalam station → auto-queue ke next station (inter-station transfer).
5. **Tidak ada tombol "Start" lagi per proses**. Semua perpindahan WOT/unit terjadi otomatis berdasarkan gate rule.

#### 4.5.3. Exception Handling

- Jika mid-flow manpower keluar (logout/absen), sistem trigger re-orchestration (Phase 2).
- Jika WIP buffer habis di tengah jalan, station auto-pause dengan status `STARVED` (bukan `PAUSED_MANUAL`).
- Jika terjadi error pada proses, sistem trigger NDP otomatis.

---

### 4.6. Pause & Continue (Human Override)

#### 4.6.1. Pause Button

- Tersedia di setiap proses card dan station header.
- **Efek Proses-Level Pause**:
  - Proses berubah status ke `PAUSED_MANUAL`.
  - WOT/unit yang sedang `RUNNING` di-proses tersebut di-freeze (timer pause).
  - Manpower yang sedang di-proses tersebut di-release ke `IDLE` (bisa dialihkan ke proses lain dalam station jika eligible).
  - **Tidak menghentikan proses lain dalam station yang sama**.
- **Efek Station-Level Pause**:
  - Semua proses dalam station di-pause.
  - Semua manpower di-release ke `IDLE`.
  - Tidak ada WOT yang bisa masuk ke station ini sampai Continue ditekan.

#### 4.6.2. Continue Button

- **Wajib manual click** oleh user.
- Pre-check sebelum resume:
  - Apakah prerequisite WIP/WOT masih terpenuhi?
  - Apakah manpower tersedia kembali?
  - Apakah tidak ada NDP aktif?
- Setelah click Continue, WOT melanjutkan dari keadaan terakhir (timer resume, manpower re-assigned via orchestration).

---

### 4.7. NDP (Notice to Down Process) dengan Integrasi PR-BOM-Warehouse

#### 4.7.1. NDP Trigger Flow

```
Operator klik NDP
  └──► Modal Form:
        1. Category (Machine Breakdown / Material NG / Tooling / Power / Quality Defect / Other)
        2. Description
        3. [Checkbox] "Apakah memerlukan pengadaan barang/material?"
              └──► Jika YA:
                    ├── Dropdown BOM Items yang terkait process/station
                    ├── Input Qty yang dibutuhkan
                    ├── Auto-generate PR (Purchase Request) dengan:
                    │     - source = "NDP_TRIGGER"
                    │     - related_ndp_id = <ndp_id>
                    │     - related_process_id = <process_id>
                    │     - urgency = "CRITICAL"
                    │     - status = "BLOCKED_PENDING_PROCUREMENT"
                    └── Process LOCKED sampai barang diterima
              └──► Jika TIDAK:
                    └── NDP Status = BLOCKED_PENDING_ACTION (manual resolve)
```

#### 4.7.2. Procurement-Warehouse-Production Integration

1. **PR Generation**: PR di-generate → masuk ke modul **Requests** dengan tag `NDP_ORIGIN`.
2. **Purchasing Process**: Purchasing proses PR → PO → Supplier Delivery.
3. **Warehouse Receipt**: 
   - Barang tiba di Warehouse → Warehouse membuat **Goods Receipt (GR)**.
   - Warehouse scan QR Product Node / Material → status jadi `IN_TRANSIT_TO_PRODUCTION`.
4. **Production Terminal Receipt**:
   - Operator Production scan receipt di ShopFloorTerminal → status jadi `AVAILABLE`.
5. **Auto-Resolution**:
   - Sistem auto-detect: jika semua BOM items untuk NDP tersebut sudah `AVAILABLE` di production floor:
     - NDP auto-resolve.
     - Process unlock.
     - Notifikasi ke user: "Material untuk NDP-004 telah tersedia. Process dapat dilanjutkan."

#### 4.7.3. NDP Cascade Impact

- NDP di proses X akan **auto-pause semua downstream process** yang bergantung pada X (baik dalam station maupun antar station).
- Upstream process tetap berjalan tapi akan **starvation** karena WIP buffer downstream penuh (jika WOT tidak bisa transfer).
- Visualisasi: Warna merah meluas ke seluruh downstream path pada conveyor board.

---

### 4.8. Conveyor Board — Station-Based Visual Flow

#### 4.8.1. Redesign Konveyor

- **Flow berdasarkan Station**, bukan berdasarkan Proses.
- Setiap Station ditampilkan sebagai **lane/kolom vertikal** (Kanban style) atau **node horizontal** (Conveyor style).
- **Di dalam setiap Station card**, detail proses ditampilkan dengan **border garis putus-putus** (dashed outline) — sama seperti BOP flowchart.
- **Countdown per-proses tetap ada** di dalam detail station.

#### 4.8.2. Visualisasi WOT sebagai Kartu Fisik

- WOT ditampilkan sebagai "kartu" fisik yang bergerak:
  - **Station Lane**: Kolom yang berisi WOT cards.
  - **WOT Card Colors**:
    - 🟢 **Green**: On track / Running
    - 🟡 **Yellow**: Waiting in queue / WIP gate
    - 🔴 **Red**: NDP/Blocked
    - ⚪ **Gray**: Not started / Planned
    - 🔵 **Blue**: Transferred (in transit to next station)

#### 4.8.3. Shadow Board Digital (Kanban per Station)

Panel kanan atau dalam setiap station card menampilkan:
- **To Do**: WOT Queue (WOT yang menunggu manpower atau prerequisite)
- **Doing**: WOT Running + Manpower avatar yang sedang mengerjakan
- **Done**: WOT Completed (menunggu transfer ke station berikutnya)
- **Blocked**: WOT yang terkena NDP atau prerequisite belum terpenuhi

---

## 5. ALGORITMA & PSEUDOCODE DETAIL

### 5.1. WOT Transfer Gate (Complete Pseudocode)

```typescript
function canProcessStart(processId: string, stationId: string): boolean {
  const process = getProcess(processId);

  // 1. Cek NDP aktif di station
  if (hasActiveNDP(stationId)) return false;

  // 2. Cek manpower tersedia
  if (getActiveManpowerInStation(stationId).length === 0) return false;

  // 3. Cek prerequisite WOT/Unit
  const predecessors = getPredecessors(processId);
  const stationProcesses = getProcessesInStation(stationId);

  for (const predId of predecessors) {
    const predInSameStation = stationProcesses.some(p => p.id === predId);

    if (predInSameStation) {
      // Intra-station: cek unit-level completion
      const readyUnits = getCompletedUnits(predId);
      if (readyUnits === 0) return false;
    } else {
      // Inter-station: cek WOT transferred dari station sebelumnya
      const transferredWots = getWotQueueForProcess(processId).filter(
        w => w.status === 'TRANSFERRED' && w.source_station_id === getProcess(predId).station_id
      );
      if (transferredWots.length === 0) return false;
    }
  }

  return true;
}

function onUnitCompleted(processId: string, wotId: string) {
  const process = getProcess(processId);
  const wot = getWot(wotId);
  const station = getStation(process.station_id);

  // Increment completed unit count untuk proses ini
  incrementCompletedUnits(processId, wotId);

  // Cek apakah ini last process dalam station
  const isLastProcess = isLastProcessInStation(processId, station.id);

  if (isLastProcess) {
    // Cek apakah seluruh WOT completed
    if (isWotFullyCompleted(wotId, station.id)) {
      const nextStation = getNextStation(station.id);
      if (nextStation) {
        wot.status = 'TRANSFERRED';
        wot.target_station_id = nextStation.id;
        wot.source_station_id = station.id;
        enqueueWotToStation(wot, nextStation.id);

        // Trigger orchestration di station berikutnya
        triggerOrchestration(nextStation.id);
      } else {
        wot.status = 'FINISHED';
        checkProjectCompletion(wot.project_id);
      }
    }
  } else {
    // Auto-queue ke next process dalam station yang sama
    const nextProcess = getNextProcessInStation(processId, station.id);
    if (nextProcess) {
      // Untuk intra-station: unit langsung mengalir
      enqueueUnitToProcess(wotId, nextProcess.id);
    }
  }

  // Re-run orchestration untuk station ini (untuk re-assign manpower)
  triggerOrchestration(station.id);
}
```

### 5.2. Manpower Orchestration (Complete Pseudocode)

```typescript
function runStationOrchestration(stationId: string) {
  const mps = getManpowersByStation(stationId).filter(m => m.status !== 'OFFLINE');
  const processes = getProcessesByStation(stationId);

  // Build priority matrix untuk setiap proses
  const processMatrix = processes.map(p => {
    const queuedWots = getQueuedWots(p.id).length;
    const runningWots = getRunningWots(p.id).length;
    const mpAssigned = countManpowerOnProcess(p.id);
    const prerequisiteMet = checkPrerequisites(p.id, stationId);
    const isMergeNode = getPredecessors(p.id).length > 1;
    const readyWip = getReadyWipCount(p.id, stationId); // QUEUED + yang prerequisite terpenuhi

    return {
      id: p.id,
      queuedWots,
      runningWots,
      mpAssigned,
      prerequisiteMet,
      isMergeNode,
      readyWip,
      priorityScore: calculatePriorityScore(readyWip, isMergeNode, mpAssigned)
    };
  });

  // Sort by priority score descending
  processMatrix.sort((a, b) => b.priorityScore - a.priorityScore);

  // PHASE 1: Assign idle manpower ke proses dengan priority tertinggi
  const idleMps = mps.filter(m => m.status === 'IDLE');

  for (const mp of idleMps) {
    const eligibleProcesses = processMatrix.filter(p => 
      mp.eligible_processes.includes(p.id) && 
      p.prerequisiteMet && 
      p.readyWip > 0
    );

    if (eligibleProcesses.length > 0) {
      assignManpowerToProcess(mp, eligibleProcesses[0].id);
    }
  }

  // PHASE 2: Load Balancing — Work Stealing
  const stillIdleMps = mps.filter(m => m.status === 'IDLE');

  for (const idleMp of stillIdleMps) {
    const stealable = processMatrix
      .filter(p => 
        idleMp.eligible_processes.includes(p.id) &&
        p.readyWip > 1 && // Backlog tinggi
        p.mpAssigned > 0 && // Sudah ada manpower yang mengerjakan
        !isManpowerAlreadyOnProcess(idleMp.id, p.id)
      )
      .sort((a, b) => b.readyWip - a.readyWip);

    if (stealable.length > 0) {
      assignManpowerToProcess(idleMp, stealable[0].id);
    }
  }

  // PHASE 3: Auto-Switching setelah task selesai
  for (const mp of mps.filter(m => m.status === 'BUSY')) {
    if (mp.current_process && mp.task_status === 'DONE') {
      const nextProcess = getBestNextProcessForManpower(mp, processMatrix);
      if (nextProcess && nextProcess.id !== mp.current_process_id) {
        switchManpowerProcess(mp, nextProcess.id);
      }
    }
  }
}

function calculatePriorityScore(readyWip: number, isMergeNode: boolean, mpAssigned: number): number {
  let score = readyWip * 10;
  if (isMergeNode) score += 100; // Merge node gets highest priority
  if (mpAssigned === 0) score += 50; // Unstaffed process gets boost
  return score;
}
```

### 5.3. NDP → PR → Warehouse → Resolution (Complete Pseudocode)

```typescript
async function createNDP(payload: NDPPayload) {
  // 1. Create NDP record
  const ndp = await api.post('/production/ndp', {
    ...payload,
    status: payload.requires_procurement 
      ? 'BLOCKED_PENDING_PROCUREMENT' 
      : 'BLOCKED_PENDING_ACTION',
    process_id: payload.process_id,
    station_id: payload.station_id,
    created_by: payload.operator_name
  });

  // 2. Pause process & cascade downstream
  await pauseProcessCascade(payload.process_id, payload.station_id);

  // 3. Jika memerlukan procurement, auto-generate PR
  if (payload.requires_procurement) {
    const bomItems = await getBomItemsForProcess(payload.process_id);
    const wotSize = getWotSize(payload.station_id);

    const pr = await api.post('/purchasing/pr/generate-from-ndp', {
      ndp_id: ndp.id,
      station_id: payload.station_id,
      project_id: payload.project_id,
      items: bomItems.map(b => ({
        item_id: b.item_id,
        item_code: b.item_code,
        qty: Math.ceil(b.required_qty * wotSize),
        urgency: 'CRITICAL',
        source: 'NDP_TRIGGER',
        expected_delivery_date: addBusinessDays(new Date(), b.lead_time_days || 7)
      }))
    });

    // Link PR ke NDP
    ndp.related_pr_id = pr.id;
    await save(ndp);

    // Notifikasi ke Purchasing
    await sendNotification('PURCHASING_TEAM', {
      type: 'CRITICAL_PR_FROM_NDP',
      ndp_id: ndp.id,
      pr_id: pr.id,
      station: payload.station_name
    });
  }

  return ndp;
}

// Warehouse Receipt Hook — Dipanggil saat material diterima di production
async function onWarehouseReceiptScanned(materialId: string, stationId: string, operatorName: string) {
  // 1. Update material status
  await updateMaterialStatus(materialId, stationId, 'AVAILABLE', operatorName);

  // 2. Cek NDP yang terkait station ini
  const ndps = await getActiveNDPsForStation(stationId);

  for (const ndp of ndps) {
    if (ndp.status === 'BLOCKED_PENDING_PROCUREMENT') {
      const requiredItems = await getPendingItemsForNDP(ndp.id);

      // Cek apakah semua item sudah diterima
      const isFulfilled = requiredItems.every(item => item.received_qty >= item.required_qty);

      if (isFulfilled) {
        // Resolve NDP
        ndp.status = 'RESOLVED';
        ndp.resolved_at = new Date().toISOString();
        ndp.resolved_by = 'SYSTEM_AUTO';
        await save(ndp);

        // Unlock process cascade
        await resumeProcessCascade(ndp.process_id, ndp.station_id);

        // Notifikasi
        await sendNotification('PRODUCTION_TEAM', {
          type: 'NDP_RESOLVED',
          ndp_id: ndp.id,
          message: `NDP ${ndp.number} resolved. Material received. Station ${stationId} can resume.`
        });

        // Trigger re-orchestration
        triggerOrchestration(stationId);
      }
    }
  }
}
```

---

## 6. PEMISAHAN TANGGUNG JAWAB YANG TEGAS (The Golden Rule)

| Modul | Boleh Melakukan | Tidak Boleh Melakukan |
|-------|-----------------|----------------------|
| **BOM (Engineering.tsx)** | Definisi material, spec, dimensi, qty, harga, revisi ECO | Cycle time, station assignment, WOT consumption, manpower assign |
| **BOP (BopEngineeringPage.tsx)** | Routing graph, process node, product node, QC checkpoint, predecessor/successor | Manpower assign, WOT execution, station clustering logic |
| **Production Hub (ProjectProductionHub.tsx)** | **Station definition**, **WOT generation**, **manpower orchestration**, **auto-flow execution**, **NDP+PR integration**, **estimasi matematika**, **Start Production trigger** | Edit BOM item, edit BOP graph structure |
| **ShopFloorTerminal.tsx** | Scan WOT QR, scan material receipt, input yield/scrap per WOT, trigger NDP, click Pause/Continue, view station status | Edit master data, assign manpower, generate WOT, override orchestration |
| **ProjectDetails.tsx** | Read-only WOT progress mirror, read-only station OEE, read-only project ETA, audit trail, material tracking | Task execution, WOT transfer, manpower assignment, NDP creation |
| **Requests.tsx** | PR generation (manual + NDP-triggered), shortage analysis, procurement wave, authorization | WOT execution, station management, manpower orchestration |
| **Warehouse Module** | Goods receipt, material dispatch, scan QR product node, update stock status | WOT execution, process control, NDP resolution logic |

---

## 7. VALUE-ADD FEATURES (Differentiation)

### 7.1. Digital Twin Conveyor Dashboard

- Visualisasi WOT sebagai kartu fisik yang bergerak dari kiri ke kanan (Station 1 → N).
- Setiap station menampilkan: WOT Running (animasi pulse), WOT Queue (stack), Manpower Avatar yang sedang aktif.
- **Auto-Transfer Animation**: Ketika WOT pindah station, kartu WOT beranimasi berpindah ke lane berikutnya.
- **Real-time WebSocket Update**: Semua perubahan status WOT dipush ke UI secara real-time.

### 7.2. Predictive Starvation Alert

- Sistem menghitung `consumption_rate` downstream vs `production_rate` upstream secara kontinu.
- Jika `production_rate > consumption_rate` selama > 30 menit, prediksi WIP buffer akan penuh dalam X jam.
- **Rekomendasi AI**: "Alihkan 1 manpower dari Station 3 ke Station 4 dalam 2 jam untuk mencegah bottleneck."
- **Confidence Score**: Setiap rekomendasi dilengkapi confidence score berdasarkan historical data.

### 7.3. WOT Travel Tag & Genealogy Tree

- Setiap WOT memiliki QR Travel Tag yang dicetak saat lot generation.
- Scan di setiap station transfer mencatat:
  - `timestamp_in`, `timestamp_out`
  - `operator_id`, `station_id`
  - `yield_qty`, `scrap_qty`
- **Genealogy Tree**: User bisa trace "WOT #005 dibuat dari Material Batch M-102, diproses di Station 1 oleh Operator X (yield 98%), lalu Station 2 oleh Operator Y (yield 99%)."
- **Full Traceability**: Dari raw material batch hingga finished goods.

### 7.4. OEE (Overall Equipment Effectiveness) per Station — Real-time

```
Availability = (Planned Time - Downtime) / Planned Time
Performance    = (Ideal Cycle Time × Total Output) / Run Time
Quality        = Good Output / Total Output
OEE            = Availability × Performance × Quality
```

- Ditampilkan di header setiap station card dengan gauge chart.
- **Trigger Warning** jika OEE < 70% selama > 15 menit.
- **Historical Trend**: Grafik OEE per station per shift/hari/minggu.

### 7.5. Auto-Overtime Recommendation Engine

- Jika gap analysis menunjukkan project akan terlambat:
  - Sistem simulasikan skenario: "Jika Station 2 dan 3 di-extend 2 jam/hari, project selesai 1 hari lebih awal."
  - Sistem simulasikan skenario alternatif: "Jika WOT size dikurangi dari 100 pcs menjadi 50 pcs, project selesai tepat waktu tanpa overtime."
- **Tombol "Apply Overtime Schedule"** yang mengubah `WH` (working hours) untuk station tertentu dan auto-recalculate ETA.
- **Cost Analysis**: Perbandingan biaya overtime vs biaya delay (penalty customer).

### 7.6. Smart WOT Size Optimizer

- Berdasarkan CPM calculation, sistem merekomendasikan WOT size optimal:
  - WOT terlalu besar: lead time per WOT panjang, WIP mengendap.
  - WOT terlalu kecil: terlalu banyak switching overhead, tidak efisien.
- **Optimal WOT Size Formula**:
  ```
  Optimal_WOT = sqrt( (2 × Setup_Cost × Demand_Rate) / Holding_Cost_per_Unit )
  ```
- UI menampilkan slider WOT size dengan real-time impact pada project ETA.

### 7.7. Station Comparison & Benchmarking

- Cross-project analysis: "Station 'Welding-A' di Project X memiliki OEE 85%, sementara di Project Y hanya 72%."
- **Best Practice Recommendation**: "Project X menggunakan setup tooling yang lebih cepat. Consider applying same setup to Project Y."

---

## 8. PERUBAHAN PADA KODE EKSISTING

### 8.1. [CRITICAL] ProductionPhaseExecution.tsx — Total Rewrite Pipeline Logic

- **Hapus**: Tombol "Start Station" per process card.
- **Ganti**: Tombol "Start Production" per station header.
- **Tambah**: WOT queue visualizer per process (daftar WOT entity, bukan angka qty).
- **Tambah**: Manpower avatar/orchestration indicator di setiap station card.
- **Tambah**: Auto-transfer animation ketika WOT pindah process/station.
- **Tambah**: Station lane view (Kanban) sebagai view mode default.
- **Tambah**: Matrix view untuk high-density monitoring.

### 8.2. [CRITICAL] ProjectProductionHub.tsx — Station Layer Introduction

- **Tambah**: Layer `stations` antara `project` dan `processSteps`.
- **Tambah**: `station_sequence` untuk menentukan urutan antar station.
- **Tambah**: `orchestrateStation()` interval (5 detik) atau WebSocket event-driven.
- **Tambah**: `calculateStationEta()` dan `calculateWotEta()`.
- **Tambah**: State management untuk WOT entities (`wots`, `wotQueue`, `wotHistory`).
- **Tambah**: Integration dengan NDP → PR → Warehouse flow.

### 8.3. [HIGH] ShopFloorTerminal.tsx — WOT Scan-First Architecture

- **Hapus**: Direct lot execution tanpa WOT context.
- **Ganti**: Operator scan QR WOT → sistem cek process mana yang sedang aktif untuk WOT tersebut → tampilkan action yang relevan (Pause/Continue/NDP/Complete).
- **Tambah**: Warehouse receipt scan untuk NDP resolution.
- **Tambah**: WOT genealogy view (trace WOT history).

### 8.4. [HIGH] ProductionPhaseSetup.tsx — Station Manpower Panel

- **Hapus**: Manpower assignment per process individual (jika masih ada).
- **Ganti**: Manpower assignment per station + `eligible_processes` multi-select.
- **Tambah**: Station definition UI (tabel mapping process ke station, atau drag-drop).
- **Tambah**: CPM preview per station setelah assignment.

### 8.5. [MEDIUM] ProductionPhasePlanning.tsx — WOT Mathematics

- **Tambah**: Display `T_wot_end_to_end` setelah lot generation.
- **Tambah**: Gap analysis: "Dengan WOT size 100 pcs dan manpower saat ini, project selesai 3 hari setelah deadline."
- **Tambah**: Rekomendasi auto: "Kurangi WOT size menjadi 50 pcs atau tambah 1 manpower di Station 2."
- **Tambah**: Smart WOT Size Optimizer slider.

### 8.6. [MEDIUM] NDP Flow Integration

- **Tambah**: `NDPModal` dengan checkbox procurement dan BOM item dropdown.
- **Tambah**: Auto-PR generation endpoint: `POST /api/production/ndp/:id/generate-pr`.
- **Tambah**: Warehouse terminal endpoint: `POST /api/warehouse/scan-to-production`.
- **Tambah**: NDP resolution listener di Production Hub (WebSocket event: `NDP_RESOLVED`).
- **Tambah**: NDP cascade pause/resume logic.

### 8.7. [MEDIUM] Production.tsx (Production Hub List)

- **Tambah**: Station count per project card.
- **Tambah**: WOT progress indicator: "12/20 WOT Completed".
- **Tambah**: Next station ETA preview.

---

## 9. API ENDPOINT YANG DIPERLUKAN (Backend)

### 9.1. WOT Management

```
POST   /api/production/projects/:id/wots/generate
GET    /api/production/projects/:id/wots
PUT    /api/production/wots/:wotId/status
GET    /api/production/wots/:wotId/genealogy
POST   /api/production/wots/:wotId/transfer
```

### 9.2. Station Orchestration

```
GET    /api/production/projects/:id/stations
POST   /api/production/stations/:id/orchestrate
GET    /api/production/stations/:id/eta
GET    /api/production/stations/:id/oee
POST   /api/production/stations/:id/start-production
POST   /api/production/stations/:id/pause
POST   /api/production/stations/:id/continue
```

### 9.3. Manpower Assignment

```
POST   /api/production/stations/:id/manpower/assign
DELETE /api/production/stations/:id/manpower/:mpId
PUT    /api/production/manpower/:id/eligible-processes
GET    /api/production/stations/:id/manpower/utilization
```

### 9.4. NDP & Procurement Integration

```
POST   /api/production/ndp
POST   /api/production/ndp/:id/generate-pr
PUT    /api/production/ndp/:id/resolve
GET    /api/production/stations/:id/ndps
POST   /api/warehouse/scan-to-production
PUT    /api/warehouse/material-dispatches/:id/receive
```

### 9.5. Estimation & Analytics

```
GET    /api/production/projects/:id/wot-cpm
GET    /api/production/projects/:id/station-etas
GET    /api/production/projects/:id/gap-analysis
POST   /api/production/projects/:id/simulate-overtime
```

---

## 10. INDIKATOR KEBERHASILAN PENGEMBANGAN (Success Criteria)

### 10.1. Functional Requirements

- [ ] WOT adalah entity first-class: memiliki status lifecycle, queue, dan history transfer yang tersimpan di database.
- [ ] 1 WOT completed di upstream menjadi prerequisite minimal untuk downstream process start (gate rule).
- [ ] Inter-station transfer terjadi otomatis ketika WOT completed di last process station sebelumnya (minimal 1 WOT).
- [ ] Intra-station transfer terjadi per unit selesai (piece flow), tidak perlu menunggu 1 WOT utuh.
- [ ] Estimasi siklus 1 WOT end-to-end tersedia dengan rumus CPM yang memperhitungkan CT, manpower, FF, dan WH.
- [ ] Estimasi siklus per station tersedia dengan bottleneck detection.
- [ ] Tombol "Start Production" hanya ada 1 per station; perpindahan process dan station terjadi auto.
- [ ] Manpower orchestration dalam station mengikuti algoritma: priority assignment → load balancing (work stealing) → auto-switching.
- [ ] Manpower tidak bisa mengerjakan process di luar station scope-nya (API guard + UI restriction).
- [ ] Pause menghentikan process tanpa menghentikan station lain; Continue wajib manual click.
- [ ] NDP terintegrasi dengan PR generation; process ter-lock sampai material diterima via warehouse scan.
- [ ] ShopFloorTerminal menggunakan WOT QR scan sebagai entry point utama.
- [ ] Conveyor Board menampilkan WOT flow real-time per station (bukan per process).
- [ ] OEE per station dihitung real-time dan ditampilkan di UI.

### 10.2. Non-Functional Requirements

- [ ] Orchestration algorithm idempotent: bisa dipanggil berkali-kali tanpa side effect berbahaya.
- [ ] Real-time update via WebSocket/Socket.io untuk WOT transfer, NDP resolution, dan manpower status.
- [ ] Mathematical estimation reactive: setiap perubahan CT, manpower, atau FF auto-recalculate ETA tanpa refresh halaman.
- [ ] Backward compatibility: `completed_qty` legacy tetap disimpan untuk reporting, tapi WOT menjadi source of truth untuk execution.
- [ ] NDP-PR traceability: PR yang di-generate dari NDP membawa metadata `ndp_id` dan `station_id`.
- [ ] Performance: Orchestration cycle ≤ 500ms untuk station dengan ≤ 20 proses dan ≤ 10 manpower.

---

## 11. CATATAN PENTING UNTUK DEVELOPER

1. **Jangan ubah shape fundamental BOP/BOM**: Process Node tetap kotak, Product Node tetap jajaran genjang. Station adalah **wrapper execution** di atas BOP, bukan perubahan struktur graph.

2. **WOT adalah entitas transaksi**, BOP/BOM adalah entitas master. WOT mengalir di atas BOP seperti "token" yang bergerak melalui graph.

3. **Manpower orchestration harus idempotent**: Fungsi `orchestrateStation()` bisa dipanggil berkali-kali (interval 5 detik + event trigger) tanpa menyebabkan re-assignment yang berbahaya. Gunakan state check (`if (mp.status === 'BUSY') return;`) sebelum re-assign.

4. **Gunakan WebSocket / Socket.io untuk real-time**:
   - Event `WOT_COMPLETED` → trigger orchestration station berikutnya.
   - Event `NDP_RESOLVED` → trigger process unlock.
   - Event `MANPOWER_STATUS_CHANGED` → trigger re-orchestration.
   - Event `MATERIAL_RECEIVED` → trigger NDP auto-check.

5. **Matematika estimasi harus reactive**: Gunakan React `useMemo` atau store computation untuk auto-recalculate ETA setiap kali ada perubahan CT, manpower count, FF, atau WH.

6. **NDP-PR integration**: Pastikan PR yang di-generate dari NDP membawa metadata lengkap agar bisa di-trace dari NDP → PR → PO → GR → Resolution.

7. **Warehouse Terminal**: Endpoint scan penerimaan material harus menerima `station_id` dan `ndp_id` (jika ada) agar sistem tahu NDP mana yang harus di-check.

8. **Konveyor UI**: Station-based view adalah default, namun detail proses tetap terlihat dengan dashed border. Jangan hilangkan informasi process-level karena engineer perlu melihatnya.

9. **Pause/Continue State Persistence**: Status pause harus tersimpan di database, bukan hanya state lokal. Jika user refresh halaman, status pause tetap terjaga.

10. **WOT Genealogy**: Simpan setiap event transfer WOT (timestamp, station, process, operator, yield, scrap) di tabel terpisah untuk audit dan traceability.

---

*Dokumen ini merupakan spesifikasi total revamp untuk Production Execution Hub — berbasis WOT, Station, dan Dynamic Manpower Orchestration dengan matematika estimasi terintegrasi.*

**Disusun oleh:** AI System Architect  
**Review oleh:** [Production Lead, Engineering Lead, Purchasing Lead]  
**Approval:** [CTO / Production Director]
