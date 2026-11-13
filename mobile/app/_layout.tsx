import {Stack} from "expo-router";
import {StatusBar} from "expo-status-bar";
import {AuthProvider} from "@/providers/auth-provider";
import {palette} from "@/components/ui";
export default function RootLayout(){return <AuthProvider><StatusBar style="light"/><Stack screenOptions={{headerShown:false,contentStyle:{backgroundColor:palette.bg}}}><Stack.Screen name="index"/><Stack.Screen name="sign-in"/><Stack.Screen name="auth/callback"/><Stack.Screen name="(tabs)"/></Stack></AuthProvider>;}