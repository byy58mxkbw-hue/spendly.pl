import { useSignIn } from "@clerk/expo";
import { type Href, Link, useRouter } from "expo-router";
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
  const { signIn, errors, fetchStatus } = useSignIn();
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");

  const s = styles(colors, insets);

  const handleSignIn = async () => {
    const { error } = await signIn.password({ emailAddress: email, password });
    if (error) return;

    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          if (url.startsWith("http")) {
            router.replace("/" as Href);
          } else {
            router.replace(url as Href);
          }
        },
      });
    } else if (signIn.status === "needs_client_trust") {
      const emailCodeFactor = signIn.supportedSecondFactors?.find(
        (f) => f.strategy === "email_code",
      );
      if (emailCodeFactor) {
        await signIn.mfa.sendEmailCode();
      }
    }
  };

  const handleVerify = async () => {
    await signIn.mfa.verifyEmailCode({ code: verifyCode });
    if (signIn.status === "complete") {
      await signIn.finalize({
        navigate: ({ decorateUrl }) => {
          const url = decorateUrl("/");
          if (url.startsWith("http")) {
            router.replace("/" as Href);
          } else {
            router.replace(url as Href);
          }
        },
      });
    }
  };

  if (signIn.status === "needs_client_trust") {
    return (
      <KeyboardAvoidingView
        style={s.container}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.header}>
            <Text style={s.logo}>SPENDLY</Text>
            <Text style={s.subtitle}>Zweryfikuj swoją tożsamość</Text>
          </View>
          <View style={s.form}>
            <Text style={s.label}>Kod weryfikacyjny</Text>
            <TextInput
              style={s.input}
              value={verifyCode}
              placeholder="Wprowadź kod"
              placeholderTextColor={colors.mutedForeground}
              onChangeText={setVerifyCode}
              keyboardType="number-pad"
              autoFocus
            />
            {errors?.fields?.code && (
              <Text style={s.error}>{errors.fields.code.message}</Text>
            )}
            <Pressable
              style={({ pressed }) => [
                s.button,
                (fetchStatus === "fetching" || !verifyCode) && s.buttonDisabled,
                pressed && s.buttonPressed,
              ]}
              onPress={handleVerify}
              disabled={fetchStatus === "fetching" || !verifyCode}
            >
              {fetchStatus === "fetching" ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={s.buttonText}>Zweryfikuj</Text>
              )}
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.secondaryButton, pressed && s.buttonPressed]}
              onPress={() => signIn.mfa.sendEmailCode()}
            >
              <Text style={s.secondaryButtonText}>Wyślij nowy kod</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [s.secondaryButton, pressed && s.buttonPressed]}
              onPress={() => signIn.reset()}
            >
              <Text style={s.secondaryButtonText}>Wróć do logowania</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <KeyboardAvoidingView
      style={s.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.logo}>SPENDLY</Text>
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
          {errors?.fields?.identifier && (
            <Text style={s.error}>{errors.fields.identifier.message}</Text>
          )}

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
          {errors?.fields?.password && (
            <Text style={s.error}>{errors.fields.password.message}</Text>
          )}

          <Pressable
            style={({ pressed }) => [
              s.button,
              (!email || !password || fetchStatus === "fetching") && s.buttonDisabled,
              pressed && s.buttonPressed,
            ]}
            onPress={handleSignIn}
            disabled={!email || !password || fetchStatus === "fetching"}
            testID="sign-in-button"
          >
            {fetchStatus === "fetching" ? (
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
      marginTop: 4,
    },
  });
