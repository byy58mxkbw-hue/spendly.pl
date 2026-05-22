import { useUser } from "@clerk/expo";
import {
  useGetDashboardSummary,
  useGetTopPriceChanges,
  useGetRecentPurchases,
} from "@workspace/api-client-react";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const formatPrice = (price: number) =>
  new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(price);

const formatDate = (date: string) =>
  new Date(date).toLocaleDateString("pl-PL");

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  const colors = useColors();
  const s = cardStyles(colors);
  return (
    <View style={s.statCard}>
      <Text style={s.statLabel}>{label}</Text>
      <Text style={s.statValue}>{value}</Text>
      {sub ? <Text style={s.statSub}>{sub}</Text> : null}
    </View>
  );
}

const cardStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    statCard: {
      flex: 1,
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 90,
    },
    statLabel: {
      fontSize: 11,
      fontFamily: "Inter_500Medium",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 6,
    },
    statValue: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
    },
    statSub: {
      fontSize: 11,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 4,
    },
  });

export default function DashboardScreen() {
  const { user } = useUser();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = styles(colors, insets);

  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } =
    useGetDashboardSummary();
  const { data: topChanges, isLoading: loadingChanges, refetch: refetchChanges } =
    useGetTopPriceChanges({ limit: 5 });
  const { data: recentPurchases, isLoading: loadingPurchases, refetch: refetchPurchases } =
    useGetRecentPurchases({ limit: 5 });

  const isRefreshing = false;
  const onRefresh = async () => {
    await Promise.all([refetchSummary(), refetchChanges(), refetchPurchases()]);
  };

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Dzień dobry";
    if (h < 18) return "Dzień dobry";
    return "Dobry wieczór";
  };

  return (
    <ScrollView
      style={s.container}
      contentContainerStyle={s.content}
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={onRefresh}
          tintColor={colors.primary}
        />
      }
      showsVerticalScrollIndicator={false}
    >
      <View style={s.headerRow}>
        <View>
          <Text style={s.greeting}>{greeting()}</Text>
          <Text style={s.name}>{user?.firstName ?? user?.emailAddresses[0]?.emailAddress ?? "—"}</Text>
        </View>
      </View>

      {loadingSummary ? (
        <View style={s.loadingRow}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : summary ? (
        <View style={s.statsGrid}>
          <View style={s.statsRow}>
            <StatCard
              label="Wydatki (miesiąc)"
              value={formatPrice(Number(summary.totalSpendThisMonth ?? 0))}
            />
          </View>
          <View style={s.statsRow}>
            <StatCard
              label="Faktury"
              value={String(summary.totalInvoices ?? 0)}
              sub="w tym miesiącu"
            />
            <View style={{ width: 10 }} />
            <StatCard
              label="Alerty"
              value={String(summary.activeAlerts ?? 0)}
              sub="aktywnych"
            />
          </View>
        </View>
      ) : null}

      <Text style={s.sectionTitle}>Największe zmiany cen</Text>
      {loadingChanges ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
      ) : topChanges && topChanges.length > 0 ? (
        topChanges.map((item, i) => {
          const change = Number(item.changePercent ?? 0);
          const isUp = change > 0;
          return (
            <View key={i} style={s.priceRow}>
              <View style={s.priceRowLeft}>
                <Text style={s.productName} numberOfLines={1}>{item.productName}</Text>
                <Text style={s.supplierName} numberOfLines={1}>{item.supplierName ?? "—"}</Text>
              </View>
              <View style={s.priceRowRight}>
                <Text style={s.price}>{formatPrice(Number(item.currentPrice ?? 0))}</Text>
                <View style={[s.changeBadge, isUp ? s.changeBadgeUp : s.changeBadgeDown]}>
                  <Text style={[s.changeText, isUp ? s.changeTextUp : s.changeTextDown]}>
                    {isUp ? "+" : ""}{change.toFixed(1)}%
                  </Text>
                </View>
              </View>
            </View>
          );
        })
      ) : (
        <View style={s.emptyState}>
          <Text style={s.emptyText}>Brak danych o zmianach cen</Text>
        </View>
      )}

      <Text style={s.sectionTitle}>Ostatnie zakupy</Text>
      {loadingPurchases ? (
        <ActivityIndicator color={colors.primary} style={{ marginTop: 16 }} />
      ) : recentPurchases && recentPurchases.length > 0 ? (
        recentPurchases.map((item, i) => {
          const change = Number(item.changePercent ?? 0);
          const isUp = change > 0;
          const hasChange = item.previousPrice != null;
          return (
            <View key={i} style={s.purchaseRow}>
              <View style={s.purchaseLeft}>
                <Text style={s.productName} numberOfLines={1}>{item.productName}</Text>
                <Text style={s.supplierName} numberOfLines={1}>
                  {item.supplierName ?? "—"} · {formatDate(item.purchaseDate)}
                </Text>
              </View>
              <View style={s.priceRowRight}>
                <Text style={s.price}>{formatPrice(Number(item.currentPrice ?? 0))}</Text>
                {hasChange && (
                  <View style={[s.changeBadge, isUp ? s.changeBadgeUp : s.changeBadgeDown]}>
                    <Text style={[s.changeText, isUp ? s.changeTextUp : s.changeTextDown]}>
                      {isUp ? "+" : ""}{change.toFixed(1)}%
                    </Text>
                  </View>
                )}
              </View>
            </View>
          );
        })
      ) : (
        <View style={s.emptyState}>
          <Text style={s.emptyText}>Brak ostatnich zakupów</Text>
        </View>
      )}

      <View style={{ height: Platform.OS === "web" ? 34 : 100 }} />
    </ScrollView>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingTop: Platform.OS === "web" ? insets.top + 67 : insets.top + 20,
      paddingHorizontal: 20,
    },
    headerRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: 24,
    },
    greeting: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    name: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
      marginTop: 2,
    },
    loadingRow: {
      height: 80,
      alignItems: "center",
      justifyContent: "center",
    },
    statsGrid: {
      gap: 10,
      marginBottom: 32,
    },
    statsRow: {
      flexDirection: "row",
    },
    sectionTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      marginBottom: 12,
      letterSpacing: -0.2,
    },
    priceRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    purchaseRow: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    priceRowLeft: {
      flex: 1,
      marginRight: 12,
    },
    purchaseLeft: {
      flex: 1,
      marginRight: 12,
    },
    priceRowRight: {
      alignItems: "flex-end",
      gap: 4,
    },
    productName: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
    },
    supplierName: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    price: {
      fontSize: 14,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    changeBadge: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    changeBadgeUp: {
      backgroundColor: "#fee2e2",
    },
    changeBadgeDown: {
      backgroundColor: "#d1fae5",
    },
    changeText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
    },
    changeTextUp: {
      color: "#dc2626",
    },
    changeTextDown: {
      color: "#059669",
    },
    emptyState: {
      paddingVertical: 32,
      alignItems: "center",
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });
