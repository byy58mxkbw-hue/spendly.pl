import { useAuth, useUser } from "@clerk/expo";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

function SettingsRow({
  icon,
  label,
  value,
  onPress,
  danger,
}: {
  icon: string;
  label: string;
  value?: string;
  onPress?: () => void;
  danger?: boolean;
}) {
  const colors = useColors();
  const s = rowStyles(colors);

  return (
    <Pressable
      style={({ pressed }) => [s.row, pressed && s.rowPressed, !onPress && s.rowDisabled]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={s.rowLeft}>
        <View style={[s.iconBox, danger && s.iconBoxDanger]}>
          <Feather
            name={icon as any}
            size={16}
            color={danger ? colors.destructive : colors.primary}
          />
        </View>
        <Text style={[s.label, danger && s.labelDanger]}>{label}</Text>
      </View>
      <View style={s.rowRight}>
        {value && <Text style={s.value} numberOfLines={1}>{value}</Text>}
        {onPress && (
          <Feather name="chevron-right" size={16} color={colors.mutedForeground} />
        )}
      </View>
    </Pressable>
  );
}

const rowStyles = (colors: ReturnType<typeof useColors>) =>
  StyleSheet.create({
    row: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 14,
      paddingHorizontal: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    rowPressed: {
      backgroundColor: colors.secondary,
    },
    rowDisabled: {},
    rowLeft: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
      flex: 1,
    },
    rowRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    iconBox: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: "#f0fafa",
      alignItems: "center",
      justifyContent: "center",
    },
    iconBoxDanger: {
      backgroundColor: "#fee2e2",
    },
    label: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
    },
    labelDanger: {
      color: colors.destructive,
    },
    value: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      maxWidth: 160,
    },
  });

export default function SettingsScreen() {
  const { user } = useUser();
  const { signOut } = useAuth();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const s = styles(colors, insets);

  const handleSignOut = () => {
    Alert.alert(
      "Wylogowanie",
      "Czy na pewno chcesz się wylogować?",
      [
        { text: "Anuluj", style: "cancel" },
        {
          text: "Wyloguj",
          style: "destructive",
          onPress: async () => {
            await signOut();
            router.replace("/(auth)/sign-in");
          },
        },
      ]
    );
  };

  const displayName =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.emailAddresses[0]?.emailAddress ||
    "Użytkownik";

  const email = user?.emailAddresses[0]?.emailAddress ?? "—";

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.profileCard}>
        <View style={s.avatar}>
          <Text style={s.avatarText}>
            {(displayName[0] ?? "U").toUpperCase()}
          </Text>
        </View>
        <View>
          <Text style={s.displayName}>{displayName}</Text>
          <Text style={s.email}>{email}</Text>
        </View>
      </View>

      <Text style={s.sectionLabel}>Konto</Text>
      <View style={s.section}>
        <SettingsRow
          icon="user"
          label="Imię"
          value={user?.firstName ?? "—"}
        />
        <SettingsRow
          icon="mail"
          label="E-mail"
          value={email}
        />
      </View>

      <Text style={s.sectionLabel}>Aplikacja</Text>
      <View style={s.section}>
        <SettingsRow
          icon="info"
          label="Wersja"
          value="1.0.0"
        />
        <SettingsRow
          icon="globe"
          label="Aplikacja webowa"
          value="spendly.pl"
        />
      </View>

      <Text style={s.sectionLabel}>Sesja</Text>
      <View style={s.section}>
        <SettingsRow
          icon="log-out"
          label="Wyloguj się"
          onPress={handleSignOut}
          danger
        />
      </View>

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
    },
    profileCard: {
      flexDirection: "row",
      alignItems: "center",
      gap: 16,
      paddingHorizontal: 20,
      paddingBottom: 24,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      marginBottom: 8,
    },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.primary,
      alignItems: "center",
      justifyContent: "center",
    },
    avatarText: {
      fontSize: 22,
      fontFamily: "Inter_700Bold",
      color: "#ffffff",
    },
    displayName: {
      fontSize: 18,
      fontFamily: "Inter_600SemiBold",
      color: colors.foreground,
      letterSpacing: -0.3,
    },
    email: {
      fontSize: 13,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 2,
    },
    sectionLabel: {
      fontSize: 11,
      fontFamily: "Inter_600SemiBold",
      color: colors.mutedForeground,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      paddingHorizontal: 20,
      paddingTop: 20,
      paddingBottom: 8,
    },
    section: {
      borderTopWidth: 1,
      borderBottomWidth: 1,
      borderColor: colors.border,
    },
  });
