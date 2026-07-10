import {
  useListPriceAlerts,
  useUpdatePriceAlert,
  type PriceAlert,
} from "@workspace/api-client-react";
import { Feather } from "@expo/vector-icons";
import React from "react";
import {
  ActivityIndicator,
  FlatList,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

function AlertRow({ item, onToggle }: { item: PriceAlert; onToggle: () => void }) {
  const colors = useColors();
  const s = rowStyles(colors);

  return (
    <View style={[s.row, !item.isActive && s.rowInactive]}>
      <View style={s.rowLeft}>
        <Text style={s.productName} numberOfLines={1}>
          {item.productName}
        </Text>
        {item.supplierName && (
          <Text style={s.supplierName} numberOfLines={1}>{item.supplierName}</Text>
        )}
        <View style={s.threshold}>
          <Feather name="trending-up" size={12} color={colors.mutedForeground} />
          <Text style={s.thresholdText}>
            Próg: {item.thresholdPercent}%
          </Text>
        </View>
      </View>
      <Switch
        value={item.isActive === true}
        onValueChange={onToggle}
        trackColor={{ false: colors.border, true: colors.primary }}
        thumbColor="#ffffff"
      />
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
    rowInactive: {
      opacity: 0.55,
    },
    rowLeft: {
      flex: 1,
      marginRight: 16,
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
    threshold: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
      marginTop: 4,
    },
    thresholdText: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
  });

export default function AlertsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = styles(colors, insets);

  const { data: alerts, isLoading, refetch } = useListPriceAlerts();
  const { mutate: updateAlert } = useUpdatePriceAlert();

  const handleToggle = (alert: PriceAlert) => {
    updateAlert({ id: alert.id, data: { isActive: !alert.isActive } });
  };

  const active = (alerts ?? []).filter((a) => a.isActive === true);
  const inactive = (alerts ?? []).filter((a) => a.isActive !== true);

  const sections = [
    ...(active.length > 0 ? [{ key: "active", title: `Aktywne (${active.length})`, data: active }] : []),
    ...(inactive.length > 0 ? [{ key: "inactive", title: `Nieaktywne (${inactive.length})`, data: inactive }] : []),
  ];

  const flatData: Array<{ type: "header"; title: string } | { type: "item"; item: PriceAlert }> =
    sections.flatMap((section) => [
      { type: "header" as const, title: section.title },
      ...section.data.map((item) => ({ type: "item" as const, item })),
    ]);

  return (
    <View style={s.container}>
      <View style={s.header}>
        <Text style={s.title}>Alerty cenowe</Text>
      </View>

      {isLoading ? (
        <View style={s.loading}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : (
        <FlatList
          data={flatData}
          keyExtractor={(item, idx) =>
            item.type === "header" ? `h-${idx}` : String(item.item.id)
          }
          renderItem={({ item }) => {
            if (item.type === "header") {
              return <Text style={s.sectionHeader}>{item.title}</Text>;
            }
            return (
              <AlertRow
                item={item.item}
                onToggle={() => handleToggle(item.item)}
              />
            );
          }}
          scrollEnabled={!!flatData.length}
          refreshControl={
            <RefreshControl
              refreshing={false}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={s.emptyState}>
              <Feather name="bell-off" size={40} color={colors.border} />
              <Text style={s.emptyTitle}>Brak alertów</Text>
              <Text style={s.emptyText}>
                Skonfiguruj alerty w aplikacji webowej, aby śledzić zmiany cen
              </Text>
            </View>
          }
          contentContainerStyle={
            flatData.length === 0
              ? { flex: 1 }
              : { paddingBottom: Platform.OS === "web" ? 34 : 100 }
          }
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
    },
    sectionHeader: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      paddingHorizontal: 20,
      paddingVertical: 8,
      backgroundColor: colors.secondary,
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
