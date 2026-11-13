import { create } from 'zustand';

interface ProductionHubState {
  factoryFactor: number;
  setFactoryFactor: (val: number) => void;
  isLoading: boolean;
  setIsLoading: (val: boolean) => void;
  stations: any[];
  setStations: (val: any[]) => void;
  customLotSize: number;
  setCustomLotSize: (val: number) => void;
  project: any;
  setProject: (val: any) => void;
  spkData: any;
  setSpkData: (val: any) => void;
  bom: any[];
  setBom: (val: any[]) => void;
  shortageAnalysis: any[];
  setShortageAnalysis: (val: any[]) => void;
  lots: any[];
  setLots: (val: any[]) => void;
  machines: any[];
  setMachines: (val: any[]) => void;
  activeNdps: any[];
  setActiveNdps: (val: any[]) => void;
  itemsCatalog: any[];
  setItemsCatalog: (val: any[]) => void;
  stationTimers: Record<string, { remainingSecs: number; totalSecs: number; progressPercent: number }>;
  setStationTimers: (val: any | ((prev: any) => any)) => void;
  selectedBop: any;
  setSelectedBop: (val: any) => void;
  showFgrModal: boolean;
  setShowFgrModal: (val: boolean) => void;
  fgrData: any;
  setFgrData: (val: any) => void;
  isFinishing: boolean;
  setIsFinishing: (val: boolean) => void;
  confirmModal: { isOpen: boolean; title?: string; message?: string; action?: () => void; onConfirm?: () => void };
  setConfirmModal: (
    val:
      | { isOpen: boolean; title?: string; message?: string; action?: () => void; onConfirm?: () => void }
      | ((prev: { isOpen: boolean; title?: string; message?: string; action?: () => void; onConfirm?: () => void }) => { isOpen: boolean; title?: string; message?: string; action?: () => void; onConfirm?: () => void })
  ) => void;
  selectedTagForView: any;
  setSelectedTagForView: (val: any) => void;
  selectedNdpForView: any;
  setSelectedNdpForView: (val: any) => void;
  bopData: any[];
  setBopData: (data: any[]) => void;
  updateBopStatus: (bopId: string, status: string, progress?: number, completedQty?: number) => void;
  wotCpmAnalysis: any;
  setWotCpmAnalysis: (data: any) => void;
}

const ensureArray = (val: any, propertyKey?: string): any[] => {
  if (Array.isArray(val)) return val;
  if (val && typeof val === 'object') {
    if (propertyKey && Array.isArray(val[propertyKey])) return val[propertyKey];
    if (Array.isArray(val.data)) return val.data;
    if (Array.isArray(val.stations)) return val.stations;
    if (Array.isArray(val.items)) return val.items;
    if (Array.isArray(val.lots)) return val.lots;
    if (Array.isArray(val.machines)) return val.machines;
    if (Array.isArray(val.ndps)) return val.ndps;
    if (Array.isArray(val.ndp)) return val.ndp;
    if (Array.isArray(val.bom)) return val.bom;
    if (Array.isArray(val.shortages)) return val.shortages;
  }
  return [];
};

export const useProductionHubStore = create<ProductionHubState>((set) => ({
  factoryFactor: 85,
  setFactoryFactor: (val) => set({ factoryFactor: val }),
  isLoading: true,
  setIsLoading: (val) => set({ isLoading: val }),
  stations: [],
  setStations: (val) => set({ stations: ensureArray(val, 'stations') }),
  customLotSize: 100,
  setCustomLotSize: (val) => set({ customLotSize: val }),
  project: null,
  setProject: (val) => set({ project: val }),
  spkData: null,
  setSpkData: (val) => set({ spkData: val }),
  bom: [],
  setBom: (val) => set({ bom: ensureArray(val, 'bom') }),
  shortageAnalysis: [],
  setShortageAnalysis: (val) => set({ shortageAnalysis: ensureArray(val, 'shortages') }),
  lots: [],
  setLots: (val) => set({ lots: ensureArray(val, 'lots') }),
  machines: [],
  setMachines: (val) => set({ machines: ensureArray(val, 'machines') }),
  activeNdps: [],
  setActiveNdps: (val) => set({ activeNdps: ensureArray(val, 'ndps') }),
  itemsCatalog: [],
  setItemsCatalog: (val) => set({ itemsCatalog: ensureArray(val, 'items') }),
  stationTimers: {},
  setStationTimers: (val) =>
    set((state) => ({
      stationTimers: typeof val === 'function' ? val(state.stationTimers) : val,
    })),
  selectedBop: null,
  setSelectedBop: (val) => set({ selectedBop: val }),
  showFgrModal: false,
  setShowFgrModal: (val) => set({ showFgrModal: val }),
  fgrData: null,
  setFgrData: (val) => set({ fgrData: val }),
  isFinishing: false,
  setIsFinishing: (val) => set({ isFinishing: val }),
  confirmModal: { isOpen: false },
  setConfirmModal: (val) =>
    set((state) => ({
      confirmModal: typeof val === 'function' ? val(state.confirmModal) : val,
    })),
  selectedTagForView: null,
  setSelectedTagForView: (val) => set({ selectedTagForView: val }),
  selectedNdpForView: null,
  setSelectedNdpForView: (val) => set({ selectedNdpForView: val }),
  bopData: [],
  setBopData: (data) =>
    set({
      bopData: Array.isArray(data)
        ? data
        : data && typeof data === 'object' && Array.isArray((data as any).bop)
          ? (data as any).bop
          : [],
    }),
  updateBopStatus: (bopId, status, progress, completedQty) =>
    set((state) => ({
      bopData: (Array.isArray(state.bopData) ? state.bopData : []).map((bop) => {
        if (bop.id === bopId) {
          return {
            ...bop,
            status,
            ...(progress !== undefined ? { progress } : {}),
            ...(completedQty !== undefined ? { completed_qty: completedQty } : {}),
          };
        }
        return bop;
      }),
    })),
  wotCpmAnalysis: null,
  setWotCpmAnalysis: (data) => set({ wotCpmAnalysis: data }),
}));
