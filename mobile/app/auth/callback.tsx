import {useEffect,useState} from "react";
import {ActivityIndicator,Text,View} from "react-native";
import {router} from "expo-router";
import {Linking} from "react-native";
import type {EmailOtpType} from "@supabase/supabase-js";
import {supabase} from "@/lib/supabase";
import {palette} from "@/components/ui";
export default function AuthCallback(){
 const [error,setError]=useState("");
 useEffect(()=>{let active=true;async function handle(url:string){try{if(!supabase)throw new Error("Authentication is not configured.");const parsed=new URL(url);const query=new URLSearchParams(parsed.search);const hash=new URLSearchParams(parsed.hash.replace(/^#/,""));const read=(key:string)=>hash.get(key)||query.get(key)||"";const code=read("code");const tokenHash=read("token_hash");const type=read("type");if(code){const {error}=await supabase.auth.exchangeCodeForSession(code);if(error)throw error;}else if(tokenHash&&type){const {error}=await supabase.auth.verifyOtp({token_hash:tokenHash,type:type as EmailOtpType});if(error)throw error;}else{const accessToken=read("access_token");const refreshToken=read("refresh_token");if(!accessToken||!refreshToken)throw new Error("The confirmation link is invalid or expired.");const {error}=await supabase.auth.setSession({access_token:accessToken,refresh_token:refreshToken});if(error)throw error;}if(active)router.replace(type==="recovery"?"/reset-password":"/(tabs)");}catch(e){if(active)setError(e instanceof Error?e.message:"Unable to complete account verification.");}}
 Linking.getInitialURL().then(url=>{if(url)void handle(url);else if(active)setError("No confirmation link was received.");});
 const sub=Linking.addEventListener("url",event=>void handle(event.url));
 return ()=>{active=false;sub.remove();};},[]);
 return <View style={{flex:1,backgroundColor:palette.bg,justifyContent:"center",alignItems:"center",padding:28,gap:16}}>{error?<><Text style={{color:palette.danger,textAlign:"center"}}>{error}</Text><Text onPress={()=>router.replace("/sign-in")} style={{color:palette.gold}}>Return to sign in</Text></>:<><ActivityIndicator color={palette.gold}/><Text style={{color:palette.text}}>Verifying your ChatB2K account…</Text></>}</View>;
}