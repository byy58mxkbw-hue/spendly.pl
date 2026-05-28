import { useListProducts, type Product } from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const formatPrice = (price: number | string | null | undefined) => {
  const n = Number(price ?? 0);
  return new Intl.NumberFormat("pl-PL", { style: "currency", currency: "PLN" }).format(n);
};

function ProductRow({ item }: { item: Product }) {
  const colors = useColors();
  const s = rowStyles(colors);
  const change = Number(item.priceChangePercent ?? 0);
  const isUp = change > 0;
  const hasChange = item.priceChangePercent != null;
  const sub = (item as Product & { subcategory?: string | null; needsReview?: boolean | null }).subcategory;
  const needsReview = (item as Product & { subcategory?: string | null; needsReview?: boolean | null }).needsReview;

  const metaParts = [
    item.category ?? null,
    sub ?? null,
    item.supplierName ?? "—",
  ].filter(Boolean).join(" · ");

  return (
    <View style={s.row}>
      <View style={s.left}>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1}>{item.name}</Text>
          {needsReview && (
            <View style={s.reviewBadge}>
              <Text style={s.reviewBadgeText}>!</Text>
            </View>
          )}
        </View>
        <Text style={s.meta} numberOfLines={1}>{metaParts}</Text>
      </View>
      <View style={s.right}>
        <Text style={s.price}>{formatPrice(item.latestPrice)}</Text>
        {hasChange && (
          <View style={[s.badge, isUp ? s.badgeUp : s.badgeDown]}>
            <Text style={[s.badgeText, isUp ? s.badgeTextUp : s.badgeTextDown]}>
              {isUp ? "+" : ""}{change.toFixed(1)}%
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const rowStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    left: {
      flex: 1,
      marginRight: 12,
    },
    right: {
      alignItems: "flex-end",
      gap: 4,
    },
    nameRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
    },
    name: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      flexShrink: 1,
    },
    reviewBadge: {
      backgroundColor: "#fef3c7",
      borderRadius: 8,
      width: 16,
      height: 16,
      alignItems: "center",
      justifyContent: "center",
      flexShrink: 0,
    },
    reviewBadgeText: {
      fontSize: 10,
      fontFamily: "Inter_700Bold",
      color: "#d97706",
    },
    meta: {
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
    badge: {
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    badgeUp: {
      backgroundColor: "#fee2e2",
    },
    badgeDown: {
      backgroundColor: "#d1fae5",
    },
    badgeText: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
    },
    badgeTextUp: {
      color: "#dc2626",
    },
    badgeTextDown: {
      color: "#059669",
    },
  });

export default function ProductsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = styles(colors, insets);

  const [search, setSearch] = useState("");
  const { data: products, isLoading, refetch } = useListProducts();

  const filtered = useMemo(() => {
    if (!products) return [];
    if (!search.trim()) return products;
    const q = search.toLowerCase();
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q) ||
        (p.supplierName ?? "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const ca = Math.abs(Number(a.priceChangePercent ?? 0));
      const cb = Math.abs(Number(b.priceChangePercent ?? 0));
      return cb - ca;
    });
  }, [filtered]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Produkty</Text>
        <View style={s.searchBar}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={s.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Szukaj produktu..."
            placeholderTextColor={colors.mutedForeground}
            returnKeyType="search"
            autoCorrect={false}
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <ProductRow item={item} />}
          scrollEnabled={!!sorted.length}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Feather name="package" size={40} color={colors.border} />
              <Text style={s.emptyTitle}>Brak produktów</Text>
              <Text style={s.emptyText}>
                {search ? "Brak wyników dla podanego zapytania" : "Importuj faktury, aby śledzić ceny"}
              </Text>
            </View>
          }
          contentContainerStyle={sorted.length === 0 ? { flex: 1 } : { paddingBottom: Platform.OS === "web" ? 34 : 100 }}
        />
      )}
    </View>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingTop: Platform.OS === "web" ? insets.top + 67 : insets.top + 16,
      paddingHorizontal: 20,
      paddingBottom: 12,
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: colors.foreground,
      letterSpacing: -0.5,
      marginBottom: 12,
    },
    searchBar: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.secondary,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    loading: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
    },
    emptyState: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 40,
      gap: 12,
    },
    emptyTitle: {
      fontSize: 16,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
    },
    emptyText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      textAlign: "center",
      lineHeight: 20,
    },
  });
