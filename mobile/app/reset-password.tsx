import {useState} from "react";
import {Alert,Text,TextInput} from "react-native";
import {router} from "expo-router";
import {Action,Card,Eyebrow,Heading,Screen,palette} from "@/components/ui";
import {supabase} from "@/lib/supabase";
export default function ResetPassword(){
 const [password,setPassword]=useState("");const [confirm,setConfirm]=useState("");const [busy,setBusy]=useState(false);
 async function save(){if(password.length<8){Alert.alert("Password too short","Use at least 8 characters.");return;}if(password!==confirm){Alert.alert("Passwords do not match","Re-enter the same password.");return;}if(!supabase)return;setBusy(true);try{const {error}=await supabase.auth.updateUser({password});if(error)throw error;Alert.alert("Password updated","Your ChatB2K password has been changed.");router.replace("/(tabs)");}catch(e){Alert.alert("Could not update password",e instanceof Error?e.message:"Please request another reset link.");}finally{setBusy(false);}}
 const field={backgroundColor:"#0B0D10",borderColor:"#303238",borderWidth:1,borderRadius:12,padding:14,color:palette.text} as const;
 return <Screen><Eyebrow>Account recovery</Eyebrow><Heading subtitle="Choose a new password for your ResoFit account.">Reset password.</Heading><Card><TextInput value={password} onChangeText={setPassword} placeholder="New password (8+ characters)" placeholderTextColor="#77756F" secureTextEntry style={field}/><TextInput value={confirm} onChangeText={setConfirm} placeholder="Confirm new password" placeholderTextColor="#77756F" secureTextEntry style={field}/><Action label={busy?"Saving…":"Update password"} onPress={()=>void save()} disabled={busy}/></Card></Screen>;
}