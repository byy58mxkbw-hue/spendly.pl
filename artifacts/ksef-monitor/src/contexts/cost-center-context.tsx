import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useListCostCenters } from "@workspace/api-client-react";

export type CostCenter = {
  id: number;
  userId: string;
  name: string;
  color: string;
};

type CostCenterContextValue = {
  selectedId: number | null;
  setSelectedId: (id: number | null) => void;
  costCenters: CostCenter[];
  isLoading: boolean;
  selectedCenter: CostCenter | null;
};

const CostCenterContext = createContext<CostCenterContextValue | null>(null);

const LS_KEY = "spendly_cost_center_id";

export function CostCenterProvider({ children }: { children: ReactNode }) {
  const { data: costCenters = [], isLoading } = useListCostCenters();

  const [selectedId, setSelectedIdState] = useState<number | null>(() => {
    try {
      const stored = localStorage.getItem(LS_KEY);
      if (stored === "null" || stored === null) return null;
      const n = parseInt(stored, 10);
      return isNaN(n) ? null : n;
    } catch {
      return null;
    }
  });

  const setSelectedId = (id: number | null) => {
    setSelectedIdState(id);
    try {
      localStorage.setItem(LS_KEY, id === null ? "null" : String(id));
    } catch {}
  };

  // Validate that stored id still exists — clear if deleted
  useEffect(() => {
    if (!isLoading && costCenters.length > 0 && selectedId !== null) {
      const exists = costCenters.some((c) => c.id === selectedId);
      if (!exists) setSelectedId(null);
    }
  }, [costCenters, isLoading, selectedId]);

  const selectedCenter = selectedId !== null
    ? (costCenters.find((c) => c.id === selectedId) ?? null)
    : null;

  return (
    <CostCenterContext.Provider value={{ selectedId, setSelectedId, costCenters, isLoading, selectedCenter }}>
      {children}
    </CostCenterContext.Provider>
  );
}

export function useCostCenter() {
  const ctx = useContext(CostCenterContext);
  if (!ctx) throw new Error("useCostCenter must be used within CostCenterProvider");
  return ctx;
}
