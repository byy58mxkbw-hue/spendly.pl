import { useLocation } from "wouter";
import { Layout, PageHeader } from "@/components/layout";
import {
  useGetSupplier,
  useListInvoices,
  getGetSupplierQueryKey,
  getListInvoicesQueryKey,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Building2, Mail, Phone, FileText } from "lucide-react";
import { formatPrice, formatDate } from "@/lib/format";

export default function SupplierDetail({ params }: { params: { id: string } }) {
  const [, setLocation] = useLocation();
  const id = parseInt(params.id, 10);

  const { data: supplier, isLoading: supplierLoading } = useGetSupplier(id, {
    query: { enabled: !!id, queryKey: getGetSupplierQueryKey(id) },
  });
  const { data: invoices, isLoading: invoicesLoading } = useListInvoices(
    { supplierId: id },
    { query: { enabled: !!id, queryKey: getListInvoicesQueryKey({ supplierId: id }) } }
  );

  return (
    <Layout>
      <div className="px-4 py-5 md:px-8 md:py-8">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 mb-6 -ml-2 text-muted-foreground"
          onClick={() => setLocation("/suppliers")}
          data-testid="btn-back"
        >
          <ArrowLeft className="w-4 h-4" /> Dostawcy
        </Button>

        {supplierLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-48" />
          </div>
        ) : supplier ? (
          <>
            <PageHeader title={supplier.name} subtitle={`NIP: ${supplier.taxId}`} />

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Informacje kontaktowe</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-sm">
                    <Building2 className="w-4 h-4 text-muted-foreground" />
                    <span>{supplier.name}</span>
                  </div>
                  {supplier.email && (
                    <div className="flex items-center gap-2 text-sm">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{supplier.email}</span>
                    </div>
                  )}
                  {supplier.phone && (
                    <div className="flex items-center gap-2 text-sm">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>{supplier.phone}</span>
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-card border border-border rounded-xl p-6">
                <h3 className="text-sm font-medium text-muted-foreground mb-4">Statystyki</h3>
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Liczba faktur</span>
                    <span className="font-semibold">{supplier.invoiceCount}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Łączne wydatki</span>
                    <span className="font-semibold">{formatPrice(supplier.totalSpend)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Ostatnia faktura</span>
                    <span className="font-semibold">{formatDate(supplier.lastInvoiceDate)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Invoices list */}
            <div className="bg-card border border-border rounded-xl">
              <div className="px-6 py-4 border-b border-border">
                <h2 className="font-semibold text-foreground">Historia faktur</h2>
              </div>
              {invoicesLoading ? (
                <div className="p-6 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded-lg" />)}
                </div>
              ) : invoices && invoices.length > 0 ? (
                <div className="divide-y divide-border">
                  {invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="w-full px-6 py-4 flex items-center justify-between"
                      data-testid={`invoice-row-${invoice.id}`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <FileText className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-foreground">{invoice.invoiceNumber}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(invoice.invoiceDate)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-semibold text-foreground">{formatPrice(invoice.totalAmount)}</p>
                        <p className="text-xs text-muted-foreground">{invoice.itemCount} pozycji</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-12 text-center text-sm text-muted-foreground">
                  Brak faktur od tego dostawcy.
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">Nie znaleziono dostawcy.</div>
        )}
      </div>
    </Layout>
  );
}
