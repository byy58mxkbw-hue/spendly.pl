import { useState } from "react";
import { Layout, PageHeader } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useListCostCenters,
  useCreateCostCenter,
  useUpdateCostCenter,
  useDeleteCostCenter,
  getListCostCentersQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2, Layers } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const PRESET_COLORS = [
  "#14B8A6", "#6366F1", "#F59E0B", "#EF4444",
  "#22C55E", "#8B5CF6", "#F97316", "#EC4899",
  "#06B6D4", "#84CC16",
];

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  return (
    <div>
      <p className="text-sm font-medium mb-2">Kolor</p>
      <div className="flex flex-wrap gap-2">
        {PRESET_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cn(
              "w-8 h-8 rounded-full border-2 transition-all",
              value === c ? "border-white scale-110" : "border-transparent opacity-70 hover:opacity-100",
            )}
            style={{ background: c }}
          />
        ))}
      </div>
    </div>
  );
}

const PRESET_NAMES = ["Restauracja Centrum", "Bar", "Catering", "Kuchnia", "Ogródek", "Dostawa"];

type CostCenter = { id: number; name: string; color: string; userId: string; invoiceCount: number; supplierCount: number };

function OnboardingWizard({ onCreated, onOpenAdd }: { onCreated: () => void; onOpenAdd: () => void }) {
  const create = useCreateCostCenter();
  const { toast } = useToast();
  const [creating, setCreating] = useState<string | null>(null);
  const [step, setStep] = useState<"pick" | "done">("pick");

  function handlePreset(name: string, color: string) {
    setCreating(name);
    create.mutate(
      { data: { name, color } },
      {
        onSuccess: () => {
          onCreated();
          setStep("done");
          setCreating(null);
          toast({ title: `Centrum "${name}" dodane` });
        },
        onSettled: () => setCreating(null),
      },
    );
  }

  if (step === "done") {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center">
        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Layers className="w-6 h-6 text-primary" />
        </div>
        <p className="font-semibold text-foreground mb-1">Centrum kosztów gotowe</p>
        <p className="text-sm text-muted-foreground mb-5">
          Możesz dodać kolejne centra lub przypisać faktury w sekcji Faktury.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="outline" onClick={onOpenAdd} className="gap-2">
            <Plus className="w-4 h-4" /> Dodaj kolejne
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-8 md:p-12">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <h3 className="font-semibold text-foreground text-lg mb-2">Skonfiguruj centra kosztów</h3>
          <p className="text-sm text-muted-foreground">
            Centra kosztów pozwalają filtrować faktury i raporty według lokalizacji lub funkcji restauracji.
            Wybierz szablon lub dodaj własne.
          </p>
        </div>

        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">Szybki start</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {PRESET_NAMES.map((name, i) => (
            <button
              key={name}
              onClick={() => handlePreset(name, PRESET_COLORS[i % PRESET_COLORS.length])}
              disabled={creating !== null}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm font-medium text-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors disabled:opacity-50"
            >
              <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: PRESET_COLORS[i % PRESET_COLORS.length] }} />
              {creating === name ? "Dodawanie..." : name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">lub</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="mt-4 text-center">
          <Button variant="outline" onClick={onOpenAdd} className="gap-2">
            <Plus className="w-4 h-4" /> Dodaj własne centrum
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsCostCenters() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: centers = [], isLoading } = useListCostCenters();
  const create = useCreateCostCenter();
  const update = useUpdateCostCenter();
  const deleteMut = useDeleteCostCenter();

  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<CostCenter | null>(null);
  const [deleteItem, setDeleteItem] = useState<CostCenter | null>(null);

  const [addName, setAddName] = useState("");
  const [addColor, setAddColor] = useState(PRESET_COLORS[0]);
  const [editName, setEditName] = useState("");
  const [editColor, setEditColor] = useState("");

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: getListCostCentersQueryKey() });
  }

  function handleAdd() {
    if (!addName.trim()) return;
    create.mutate(
      { data: { name: addName.trim(), color: addColor } },
      {
        onSuccess: () => {
          invalidate();
          setShowAdd(false);
          setAddName("");
          setAddColor(PRESET_COLORS[0]);
          toast({ title: "Centrum kosztów dodane" });
        },
        onError: () => toast({ variant: "destructive", title: "Błąd", description: "Nie udało się dodać centrum kosztów" }),
      },
    );
  }

  function openEdit(c: CostCenter) {
    setEditItem(c);
    setEditName(c.name);
    setEditColor(c.color);
  }

  function handleEdit() {
    if (!editItem || !editName.trim()) return;
    update.mutate(
      { id: editItem.id, data: { name: editName.trim(), color: editColor } },
      {
        onSuccess: () => {
          invalidate();
          setEditItem(null);
          toast({ title: "Centrum kosztów zaktualizowane" });
        },
        onError: () => toast({ variant: "destructive", title: "Błąd", description: "Nie udało się zaktualizować centrum kosztów" }),
      },
    );
  }

  function handleDelete() {
    if (!deleteItem) return;
    deleteMut.mutate(
      { id: deleteItem.id },
      {
        onSuccess: () => {
          invalidate();
          setDeleteItem(null);
          toast({ title: "Centrum kosztów usunięte" });
        },
        onError: () => toast({ variant: "destructive", title: "Błąd", description: "Nie udało się usunąć centrum kosztów" }),
      },
    );
  }

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <PageHeader
          title="Centra kosztów"
          subtitle="Pogrupuj wydatki restauracji według lokalizacji lub funkcji"
          action={
            <Button onClick={() => setShowAdd(true)} className="gap-2">
              <Plus className="w-4 h-4" /> Dodaj centrum
            </Button>
          }
        />

        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: "rgba(255,255,255,0.04)" }} />
            ))}
          </div>
        ) : centers.length === 0 ? (
          <OnboardingWizard onCreated={invalidate} onOpenAdd={() => setShowAdd(true)} />
        ) : (
          <div className="space-y-2">
            {centers.map((c) => (
              <div
                key={c.id}
                className="flex items-center gap-4 px-5 py-4 rounded-xl bg-card border border-border group"
              >
                <div
                  className="w-4 h-4 rounded-full shrink-0"
                  style={{ background: c.color }}
                />
                <span className="flex-1 font-medium text-foreground">{c.name}</span>
                <div className="flex items-center gap-3 text-xs text-muted-foreground mr-2">
                  {c.invoiceCount > 0 && <span>{c.invoiceCount} {c.invoiceCount === 1 ? "faktura" : c.invoiceCount < 5 ? "faktury" : "faktur"}</span>}
                  {c.supplierCount > 0 && <span>{c.supplierCount} {c.supplierCount === 1 ? "dostawca" : c.supplierCount < 5 ? "dostawców" : "dostawców"}</span>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(c)}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteItem(c)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add dialog */}
        <Dialog open={showAdd} onOpenChange={setShowAdd}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dodaj centrum kosztów</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">Nazwa</label>
                <Input
                  placeholder="np. Restauracja Centrum, Bar, Catering"
                  value={addName}
                  onChange={(e) => setAddName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  autoFocus
                />
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {PRESET_NAMES.filter((n) => !centers.some((c) => c.name === n)).map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setAddName(n)}
                      className="px-2.5 py-1 text-xs rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <ColorPicker value={addColor} onChange={setAddColor} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAdd(false)}>Anuluj</Button>
              <Button onClick={handleAdd} disabled={!addName.trim() || create.isPending}>
                {create.isPending ? "Dodawanie..." : "Dodaj centrum"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit dialog */}
        <Dialog open={!!editItem} onOpenChange={(o) => { if (!o) setEditItem(null); }}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edytuj centrum kosztów</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-2">Nazwa</label>
                <Input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleEdit()}
                  autoFocus
                />
              </div>
              <ColorPicker value={editColor} onChange={setEditColor} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditItem(null)}>Anuluj</Button>
              <Button onClick={handleEdit} disabled={!editName.trim() || update.isPending}>
                {update.isPending ? "Zapisywanie..." : "Zapisz zmiany"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete confirmation */}
        <AlertDialog open={!!deleteItem} onOpenChange={(o) => { if (!o) setDeleteItem(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Usuń centrum kosztów</AlertDialogTitle>
              <AlertDialogDescription>
                Faktury przypisane do &ldquo;{deleteItem?.name}&rdquo; zostaną odłączone. Ta akcja jest nieodwracalna.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Anuluj</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive hover:bg-destructive/90"
              >
                Usuń
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </Layout>
  );
}
