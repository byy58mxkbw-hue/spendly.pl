import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useCorrectProductCategory,
  useCreateCategory,
  useDeleteCategory,
  useUpdateCategory,
  getListCategoriesQueryKey,
  getListProductsQueryKey,
  type CategoryItem,
} from "@workspace/api-client-react";
import { categorizeProduct } from "@/lib/categories";
import { useToast } from "@/hooks/use-toast";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Pencil, Plus, Trash2 } from "lucide-react";

export function CreateCategoryModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (categoryId: string) => void;
}) {
  const queryClient = useQueryClient();
  const createMutation = useCreateCategory();
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError("Nazwa musi mieć co najmniej 2 znaki.");
      return;
    }
    setError(null);
    createMutation.mutate(
      { data: { label: trimmed } },
      {
        onSuccess: (data) => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          onCreated(data.id);
          onClose();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          setError(msg ?? "Nie udało się utworzyć kategorii.");
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Nowa kategoria</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              autoFocus
              placeholder="Nazwa kategorii, np. Dania gotowe"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null); }}
              maxLength={60}
              data-testid="input-new-category"
            />
            {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" size="sm" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Tworzenie..." : "Utwórz"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RenameCategoryModal({
  category,
  onClose,
}: {
  category: CategoryItem;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const renameMutation = useUpdateCategory();
  const [label, setLabel] = useState(category.label);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = label.trim();
    if (trimmed.length < 2) {
      setError("Nazwa musi mieć co najmniej 2 znaki.");
      return;
    }
    setError(null);
    renameMutation.mutate(
      { id: category.id, data: { label: trimmed } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          onClose();
        },
        onError: (err: unknown) => {
          const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
          setError(msg ?? "Nie udało się zmienić nazwy kategorii.");
        },
      },
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle>Zmień nazwę kategorii</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Input
              autoFocus
              placeholder="Nowa nazwa kategorii"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setError(null); }}
              maxLength={60}
              data-testid="input-rename-category"
            />
            {error && <p className="text-xs text-destructive mt-1.5">{error}</p>}
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Anuluj
            </Button>
            <Button type="submit" size="sm" disabled={renameMutation.isPending}>
              {renameMutation.isPending ? "Zapisywanie..." : "Zapisz"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CategoryBadge({
  productId,
  productName,
  category,
  categories,
  onChanged,
}: {
  productId: number;
  productName: string;
  category: string | null | undefined;
  categories: CategoryItem[] | undefined;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const correctMutation = useCorrectProductCategory();
  const deleteMutation = useDeleteCategory();
  const [optimisticCategory, setOptimisticCategory] = useState<string | null | undefined>(category);
  const effectiveId = optimisticCategory ?? categorizeProduct(productName);
  const def = categories?.find((c) => c.id === effectiveId);
  const isAuto = optimisticCategory == null;
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [renameCategory, setRenameCategory] = useState<CategoryItem | null>(null);

  const handleSelect = (newCategoryId: string | null) => {
    // Optimistic update - change immediately
    setOptimisticCategory(newCategoryId);

    correctMutation.mutate(
      { id: productId, data: { category: newCategoryId ?? "inne" } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListProductsQueryKey() });
          onChanged();
          toast({ title: "Kategoria zaktualizowana" });
        },
        onError: () => {
          // Rollback on error
          setOptimisticCategory(category);
          toast({ variant: "destructive", title: "Błąd", description: "Nie udało się zmienić kategorii." });
        },
      },
    );
  };

  const handleDelete = (e: React.MouseEvent, catId: string) => {
    e.preventDefault();
    e.stopPropagation();
    deleteMutation.mutate(
      { id: catId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          if (category === catId) {
            handleSelect(null);
          } else {
            onChanged();
          }
        },
      },
    );
  };

  const customCategories = categories?.filter((c) => c.isCustom) ?? [];
  const builtinCategories = categories?.filter((c) => !c.isCustom && c.id !== "inne") ?? [];

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
          <button
            className={cn(
              "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-medium transition-colors",
              "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground",
              isAuto && "italic opacity-70",
            )}
            title={isAuto ? "Kategoria wykryta automatycznie — kliknij, aby zmienić" : "Zmień kategorię"}
            data-testid={`product-category-${productId}`}
          >
            {def ? (
              <>
                <span>{def.emoji}</span>
                <span>{def.label}</span>
              </>
            ) : (
              <span>Inne</span>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="max-h-80 overflow-y-auto w-52"
          onClick={(e) => e.stopPropagation()}
        >
          {builtinCategories.map((cat) => (
            <DropdownMenuItem
              key={cat.id}
              onSelect={() => handleSelect(cat.id)}
              className={cn(effectiveId === cat.id && "bg-secondary")}
            >
              <span className="mr-2">{cat.emoji}</span>
              {cat.label}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem
            onSelect={() => handleSelect("inne")}
            className={cn(effectiveId === "inne" && "bg-secondary")}
          >
            Inne
          </DropdownMenuItem>

          {customCategories.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <p className="px-2 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                Własne kategorie
              </p>
              {customCategories.map((cat) => (
                <DropdownMenuItem
                  key={cat.id}
                  onSelect={() => handleSelect(cat.id)}
                  className={cn("group flex items-center justify-between pr-1", effectiveId === cat.id && "bg-secondary")}
                >
                  <span className="flex items-center gap-2 flex-1 min-w-0">
                    <span>{cat.emoji}</span>
                    <span className="truncate">{cat.label}</span>
                  </span>
                  <span className="flex items-center gap-0.5 ml-2 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <button
                      className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setTimeout(() => setRenameCategory(cat), 0);
                      }}
                      title={`Zmień nazwę kategorii ${cat.label}`}
                      data-testid={`rename-category-${cat.id}`}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                      onClick={(e) => handleDelete(e, cat.id)}
                      title={`Usuń kategorię ${cat.label}`}
                      data-testid={`delete-category-${cat.id}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </span>
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => {
              setTimeout(() => setShowCreateModal(true), 0);
            }}
            className="text-primary font-medium"
            data-testid="create-category-option"
          >
            <Plus className="w-3.5 h-3.5 mr-2" />
            Utwórz nową kategorię...
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleSelect(null)} className="text-muted-foreground text-xs">
            Wykryj automatycznie
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showCreateModal && (
        <CreateCategoryModal
          onClose={() => setShowCreateModal(false)}
          onCreated={(newCatId) => handleSelect(newCatId)}
        />
      )}

      {renameCategory && (
        <RenameCategoryModal
          category={renameCategory}
          onClose={() => setRenameCategory(null)}
        />
      )}
    </>
  );
}

