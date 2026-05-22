import { useAuth } from "@clerk/expo";
import { Redirect } from "expo-router";

export default function Index() {
  const { isSignedIn } = useAuth();
  if (isSignedIn) {
    return <Redirect href="/(home)/(tabs)" />;
  }
  return <Redirect href="/(auth)/sign-in" />;
}
