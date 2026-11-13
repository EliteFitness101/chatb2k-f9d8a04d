import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import * as Linking from "expo-linking";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
type AuthValue = { session: Session | null; loading: boolean; configured: boolean; signIn(email:string,password:string):Promise<void>; signUp(email:string,password:string):Promise<boolean>; requestPasswordReset(email:string):Promise<void>; signOut():Promise<void> };
const Context = createContext<AuthValue | null>(null);
export function AuthProvider({children}:React.PropsWithChildren) {
 const [session,setSession]=useState<Session|null>(null); const [loading,setLoading]=useState(true);
 useEffect(()=>{ if(!supabase){setLoading(false);return;} let alive=true;
  supabase.auth.getSession().then(({data,error})=>{if(alive){if(!error)setSession(data.session);setLoading(false);}});
  const {data}=supabase.auth.onAuthStateChange((_event,next)=>{setSession(next);setLoading(false);});
  return ()=>{alive=false;data.subscription.unsubscribe();};
 },[]);
 const value=useMemo<AuthValue>(()=>({
  session,loading,configured:isSupabaseConfigured,
  async signIn(email,password){if(!supabase)throw new Error("Mobile authentication is not configured.");const {error}=await supabase.auth.signInWithPassword({email,password});if(error)throw error;},
  async signUp(email,password){if(!supabase)throw new Error("Mobile authentication is not configured.");const {data,error}=await supabase.auth.signUp({email,password,options:{emailRedirectTo:Linking.createURL("auth/callback")}});if(error)throw error;return Boolean(data.session);},
  async requestPasswordReset(email){if(!supabase)throw new Error("Mobile authentication is not configured.");const {error}=await supabase.auth.resetPasswordForEmail(email,{redirectTo:Linking.createURL("auth/callback")});if(error)throw error;},
  async signOut(){if(!supabase)return;const {error}=await supabase.auth.signOut();if(error)throw error;}
 }),[session,loading]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useAuth(){const value=useContext(Context);if(!value)throw new Error("useAuth must be used inside AuthProvider");return value;}