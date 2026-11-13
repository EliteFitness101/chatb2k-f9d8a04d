import {useState} from "react";
import {ActivityIndicator,KeyboardAvoidingView,Platform,ScrollView,Text,TextInput,View} from "react-native";
import {Action,Card,Eyebrow,Heading,Screen,SmallLabel,palette} from "@/components/ui";
import {destinations,openTrackedLink} from "@/lib/links";
import {useAuth} from "@/providers/auth-provider";
import {supabase} from "@/lib/supabase";
type Message={role:"user"|"assistant";content:string};
export default function ChatScreen(){
 const {session}=useAuth();
 const [messages,setMessages]=useState<Message[]>([]);
 const [input,setInput]=useState("");
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 async function send(){
  const message=input.trim();
  if(!message||busy||!session||!supabase)return;
  const history=messages.slice(-8);
  setInput("");setError("");setMessages(current=>[...current,{role:"user",content:message}]);setBusy(true);
  try{
   const {data,error:invokeError}=await supabase.functions.invoke("chatb2k-live-assistant",{
    body:{message,history,persona:"coach-b2k"},
    headers:{"x-chatb2k-client":"mobile","Authorization":`Bearer ${session.access_token}`}
   });
   if(invokeError)throw invokeError;
   if(!data?.ok||typeof data.reply!=="string")throw new Error(data?.error||"The assistant returned an incomplete response.");
   setMessages(current=>[...current,{role:"assistant",content:data.reply}]);
  }catch(e){const detail=e instanceof Error?e.message:"ChatB2K request failed.";setError(detail);setMessages(current=>[...current,{role:"assistant",content:"I couldn't complete that request. Please try again in a moment."}]);}
  finally{setBusy(false);}
 }
 return <Screen>
  <Eyebrow>Live Gemini intelligence</Eyebrow>
  <Heading subtitle="Authenticated mobile access to the existing ChatB2K live assistant.">Talk to ChatB2K.</Heading>
  <Card>
   <SmallLabel>Coach B2K · Live assistant</SmallLabel>
   <Text style={{color:palette.muted,lineHeight:20}}>Ask about wellness, ResoFit programmes, Elite creator services or your next practical step.</Text>
   <ScrollView style={{maxHeight:390,minHeight:170}} contentContainerStyle={{gap:10}} keyboardShouldPersistTaps="handled">
    {messages.length===0?<View style={{padding:16,borderRadius:12,backgroundColor:"#0B0D10"}}><Text style={{color:palette.text,lineHeight:21}}>Welcome. What would you like help with today?</Text></View>:messages.map((m,i)=><View key={i} style={{alignSelf:m.role==="user"?"flex-end":"stretch",maxWidth:"94%",padding:13,borderRadius:13,backgroundColor:m.role==="user"?"#D8B76A":"#1C2025"}}><Text style={{color:m.role==="user"?"#17140E":palette.text,lineHeight:21}}>{m.content}</Text></View>)}
    {busy?<View style={{flexDirection:"row",alignItems:"center",gap:8,padding:8}}><ActivityIndicator color={palette.gold}/><Text style={{color:palette.muted,fontSize:12}}>ChatB2K is responding…</Text></View>:null}
   </ScrollView>
   {error?<Text style={{color:palette.danger,fontSize:12}}>{error}</Text>:null}
   <TextInput value={input} onChangeText={setInput} editable={!busy} multiline placeholder="Ask ChatB2K…" placeholderTextColor="#77756F" onSubmitEditing={()=>void send()} style={{minHeight:52,maxHeight:110,color:palette.text,backgroundColor:"#0B0D10",borderColor:"#303238",borderWidth:1,borderRadius:12,padding:14,textAlignVertical:"top"}}/>
   <Action label={busy?"Please wait…":"Send message"} onPress={()=>void send()} disabled={busy||!input.trim()||!session}/>
  </Card>
  <Card>
   <SmallLabel>Structured assessment</SmallLabel>
   <Text style={{color:palette.text,fontWeight:"700"}}>Build your wellness profile</Text>
   <Text style={{color:palette.muted,lineHeight:20}}>Continue to the existing assessment and server-authoritative recommendation flow.</Text>
   <Action secondary label="Open assessment" onPress={()=>void openTrackedLink(`${destinations.chat}/chatb2k`,"mobile_assessment")}/>
  </Card>
  <Text style={{color:palette.muted,fontSize:11}}>Messages are held in this screen session only at this stage. Durable conversation history is not yet connected to a verified mobile chat-history table.</Text>
 </Screen>;
}