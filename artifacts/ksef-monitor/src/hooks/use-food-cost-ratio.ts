import { useQuery } from "@tanstack/react-query";
import { useClerk } from "@clerk/react";
import { apiUrl } from "@/lib/api-base";

// Realny food cost % = koszt składników (netto, z KSeF) ÷ przychód (netto, GoPOS/ręczny).
// Endpoint poza Orval (nie ma go w openapi.yaml), więc goły fetch z tokenem Clerk.
// Zwraca null w foodCostPct, gdy brak przychodu za okres — wtedy nie ma czego pokazywać.
export type FoodCostRatio = {
  foodCostPct: number | null;
  prevFoodCostPct: number | null;
};

export function useFoodCostRatio(params: { from: string; to: string } | { month: string }) {
  const { session } = useClerk();
  const qs = "month" in params
    ? `month=${params.month}`
    : `from=${params.from}&to=${params.to}`;

  return useQuery<FoodCostRatio | null>({
    queryKey: ["food-cost-ratio", qs],
    queryFn: async () => {
      const token = await session?.getToken();
      const res = await fetch(apiUrl(`/api/reports/food-cost-ratio?${qs}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return null;
      return (await res.json()) as FoodCostRatio;
    },
    staleTime: 5 * 60 * 1000,
  });
}
