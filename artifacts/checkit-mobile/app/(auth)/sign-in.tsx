import { useSignIn } from "@clerk/expo/legacy";
import { isClerkAPIResponseError } from "@clerk/expo";
import { Link, useRouter } from "expo-router";
import React, { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

export default function SignInPage() {
  const { isLoaded, signIn, setActive } = useSignIn();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = styles(colors, insets);

  const handleSignIn = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signIn.create({
        identifier: email,
        password,
      });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      }
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(err.errors[0]?.longMessage ?? err.errors[0]?.message ?? "Błąd logowania");
      } else {
        setError("Błąd logowania. Spróbuj ponownie.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.header}>
          <Text style={s.logo}>CheckIT</Text>
          <Text style={s.subtitle}>Monitoruj ceny. Reaguj szybciej.</Text>
        </View>

        <View style={s.form}>
          <Text style={s.label}>Adres e-mail</Text>
          <TextInput
            style={s.input}
            value={email}
            placeholder="twoj@email.pl"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            testID="email-input"
          />

          <Text style={[s.label, { marginTop: 16 }]}>Hasło</Text>
          <TextInput
            style={s.input}
            value={password}
            placeholder="Wprowadź hasło"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setPassword}
            secureTextEntry
            testID="password-input"
          />

          {error && <Text style={s.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [
              s.button,
              (!email || !password || loading) && s.buttonDisabled,
              pressed && s.buttonPressed,
            ]}
            onPress={handleSignIn}
            disabled={!email || !password || loading}
            testID="sign-in-button"
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Zaloguj się</Text>
            )}
          </Pressable>

          <View style={s.footer}>
            <Text style={s.footerText}>Nie masz konta? </Text>
            <Link href="/(auth)/sign-up" asChild>
              <Pressable>
                <Text style={s.link}>Zarejestruj się</Text>
              </Pressable>
            </Link>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = (colors: ReturnType<typeof useColors>, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scroll: {
      flexGrow: 1,
      paddingTop: insets.top + (Platform.OS === "web" ? 67 : 40),
      paddingBottom: insets.bottom + 40,
      paddingHorizontal: 24,
      justifyContent: "center",
    },
    header: {
      alignItems: "center",
      marginBottom: 48,
    },
    logo: {
      fontSize: 40,
      fontFamily: "Inter_700Bold",
      color: colors.primary,
      letterSpacing: -1,
    },
    subtitle: {
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginTop: 8,
      textAlign: "center",
    },
    form: {
      gap: 4,
    },
    label: {
      fontSize: 13,
      fontFamily: "Inter_500Medium",
      color: colors.foreground,
      marginBottom: 6,
    },
    input: {
      height: 48,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      fontSize: 15,
      fontFamily: "Inter_400Regular",
      color: colors.foreground,
      backgroundColor: colors.card,
    },
    button: {
      height: 50,
      backgroundColor: colors.primary,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 24,
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    buttonPressed: {
      opacity: 0.85,
    },
    buttonText: {
      fontSize: 15,
      fontFamily: "Inter_600SemiBold",
      color: "#ffffff",
    },
    footer: {
      flexDirection: "row",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 24,
    },
    footerText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
    },
    link: {
      fontSize: 14,
      fontFamily: "Inter_500Medium",
      color: colors.primary,
    },
    error: {
      fontSize: 12,
      fontFamily: "Inter_400Regular",
      color: colors.destructive,
      marginTop: 8,
    },
  });
