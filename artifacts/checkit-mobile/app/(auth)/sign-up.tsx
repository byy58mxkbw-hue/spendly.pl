import { useSignUp } from "@clerk/expo/legacy";
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

export default function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [pendingVerification, setPendingVerification] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const s = styles(colors, insets);

  const handleSignUp = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      await signUp.create({ emailAddress: email, password });
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
      setPendingVerification(true);
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(err.errors[0]?.longMessage ?? err.errors[0]?.message ?? "Błąd rejestracji");
      } else {
        setError("Błąd rejestracji. Spróbuj ponownie.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!isLoaded) return;
    setLoading(true);
    setError(null);
    try {
      const result = await signUp.attemptEmailAddressVerification({ code });
      if (result.status === "complete") {
        await setActive({ session: result.createdSessionId });
        router.replace("/");
      }
    } catch (err) {
      if (isClerkAPIResponseError(err)) {
        setError(err.errors[0]?.longMessage ?? err.errors[0]?.message ?? "Nieprawidłowy kod");
      } else {
        setError("Błąd weryfikacji. Spróbuj ponownie.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    if (!isLoaded) return;
    try {
      await signUp.prepareEmailAddressVerification({ strategy: "email_code" });
    } catch {
      // ignore
    }
  };

  if (pendingVerification) {
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
            <Text style={s.subtitle}>Zweryfikuj adres e-mail</Text>
          </View>
          <View style={s.form}>
            <Text style={s.description}>
              Wysłaliśmy kod weryfikacyjny na {email}. Wprowadź go poniżej.
            </Text>
            <Text style={s.label}>Kod weryfikacyjny</Text>
            <TextInput
              style={s.input}
              value={code}
              placeholder="Wprowadź 6-cyfrowy kod"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoFocus
            />
            {error && <Text style={s.error}>{error}</Text>}
            <Pressable
              style={({ pressed }) => [
                s.button,
                (loading || !code) && s.buttonDisabled,
                pressed && s.buttonPressed,
              ]}
              onPress={handleVerify}
              disabled={loading || !code}
            >
              {loading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.buttonText}>Zweryfikuj</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.secondaryButton, pressed && s.buttonPressed]}
              onPress={handleResendCode}
            >
              <Text style={s.secondaryButtonText}>Wyślij nowy kod</Text>
            </Pressable>
          </View>
          <View nativeID="clerk-captcha" />
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

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
          <Text style={s.subtitle}>Utwórz konto</Text>
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
          />

          <Text style={[s.label, { marginTop: 16 }]}>Hasło</Text>
          <TextInput
            style={s.input}
            value={password}
            placeholder="Minimum 8 znaków"
            placeholderTextColor={colors.mutedForeground}
            onChangeText={setPassword}
            secureTextEntry
          />

          {error && <Text style={s.error}>{error}</Text>}

          <Pressable
            style={({ pressed }) => [
              s.button,
              (!email || !password || loading) && s.buttonDisabled,
              pressed && s.buttonPressed,
            ]}
            onPress={handleSignUp}
            disabled={!email || !password || loading}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={s.buttonText}>Zarejestruj się</Text>
            )}
          </Pressable>

          <View style={s.footer}>
            <Text style={s.footerText}>Masz już konto? </Text>
            <Link href="/(auth)/sign-in" asChild>
              <Pressable>
                <Text style={s.link}>Zaloguj się</Text>
              </Pressable>
            </Link>
          </View>
        </View>
        <View nativeID="clerk-captcha" />
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
    description: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
      marginBottom: 20,
      lineHeight: 20,
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
    secondaryButton: {
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      marginTop: 8,
    },
    secondaryButtonText: {
      fontSize: 14,
      fontFamily: "Inter_400Regular",
      color: colors.mutedForeground,
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
