import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { useListCostCenters, getListCostCentersQueryKey } from "@workspace/api-client-react";
import { useAuth } from "@clerk/react";

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
  // Provider owija też strony logowania/rejestracji — bez `enabled` każdy niezalogowany
  // gość dostawał 401 z /api/cost-centers (widoczne w konsoli na /sign-up).
  const { isSignedIn } = useAuth();
  const { data: costCenters = [], isLoading } = useListCostCenters({ query: { enabled: !!isSignedIn, queryKey: getListCostCentersQueryKey() } });

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

  // Validate that stored id still exists — clear if deleted or if list becomes empty
  useEffect(() => {
    if (!isLoading && selectedId !== null) {
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
