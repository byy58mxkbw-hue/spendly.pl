import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "@/lib/icons";
import {
  useResetDishes,
  getListDishesQueryKey,
  getGetDishesSalesQueryKey,
  getGetGoposMenuQueryKey,
} from "@workspace/api-client-react";

const CONFIRM_WORD = "WYZERUJ";

// Wyzerowanie menu Food Cost: usuwa wszystkie dania (z recepturami), żeby wgrać
// kartę od nowa. Nieodwracalne, więc wymaga wpisania słowa — samo kliknięcie
// „OK" w potwierdzeniu łatwo zrobić odruchowo.
export default function ResetMenuDialog({
  dishCount,
  onClose,
  onDone,
}: {
  dishCount: number;
  onClose: () => void;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const reset = useResetDishes();
  const [typed, setTyped] = useState("");
  const ok = typed.trim().toUpperCase() === CONFIRM_WORD;

  async function handleReset() {
    try {
      const res = await reset.mutateAsync({ data: { confirm: CONFIRM_WORD } });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListDishesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetDishesSalesQueryKey() }),
        queryClient.invalidateQueries({ queryKey: getGetGoposMenuQueryKey() }),
      ]);
      toast({ title: "Menu wyzerowane", description: `Usunięto dania: ${res.deleted}. Możesz wgrać menu od nowa.` });
      onDone();
    } catch (err) {
      toast({ variant: "destructive", title: "Nie udało się wyzerować menu", description: err instanceof Error ? err.message : "" });
    }
  }

  return (
    <AlertDialog open onOpenChange={(o) => !o && !reset.isPending && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Wyzerować menu?</AlertDialogTitle>
          <AlertDialogDescription>
            Usuniesz wszystkie dania z Food Cost (<span className="num">{dishCount}</span>) razem z recepturami i powiązaniami ze
            sprzedażą. Produkty i faktury zostają. Tego nie da się cofnąć.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor="reset-confirm">
            Wpisz <b className="text-foreground">{CONFIRM_WORD}</b>, aby potwierdzić
          </label>
          <Input id="reset-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={reset.isPending}>Anuluj</AlertDialogCancel>
          <Button variant="destructive" onClick={handleReset} disabled={!ok || reset.isPending}>
            {reset.isPending && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
            Wyzeruj i wgraj od nowa
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
