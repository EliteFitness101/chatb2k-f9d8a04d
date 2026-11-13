import {useCallback,useEffect,useState} from "react";
import {ActivityIndicator,Text} from "react-native";
import {Action,Card,Eyebrow,Heading,Screen,SmallLabel,palette} from "@/components/ui";
import {destinations,openTrackedLink} from "@/lib/links";
import {useAuth} from "@/providers/auth-provider";
import {supabase} from "@/lib/supabase";
type MediaRequest={id:string;intent:string;status:string;created_at:string;subscription_status?:string|null;subscription_plan?:string|null};
export default function StudioScreen(){
 const {session}=useAuth();const [requests,setRequests]=useState<MediaRequest[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
 const refresh=useCallback(async()=>{if(!supabase||!session)return;setBusy(true);setError("");try{const {data,error:invokeError}=await supabase.functions.invoke("elite-media-workspace",{method:"GET",headers:{Authorization:`Bearer ${session.access_token}`}});if(invokeError)throw invokeError;if(!data?.ok)throw new Error(data?.error||"Elite workspace could not be loaded.");setRequests(Array.isArray(data.requests)?data.requests:[]);}catch(e){setError(e instanceof Error?e.message:"Unable to verify the Elite workspace.");}finally{setBusy(false);}},[session]);
 useEffect(()=>{void refresh();},[refresh]);
 return <Screen><Eyebrow>Creator and automation workspace</Eyebrow><Heading subtitle="A native entry point into the existing Elite NG media and publishing services.">Create. Automate. Publish.</Heading>
  <Card><SmallLabel>Live workspace status</SmallLabel>{busy?<ActivityIndicator color={palette.gold}/>:null}{error?<Text style={{color:palette.danger,fontSize:12,lineHeight:18}}>{error}</Text>:<Text style={{color:palette.muted,lineHeight:20}}>{requests.length} media request(s) returned for the signed-in account.</Text>}<Action secondary label="Refresh workspace" onPress={()=>void refresh()} disabled={busy}/></Card>
  {requests.map((request)=><Card key={request.id}><SmallLabel>{request.intent}</SmallLabel><Text style={{color:palette.text,fontWeight:"700"}}>{request.status}</Text><Text style={{color:palette.muted,fontSize:11}}>Created {new Date(request.created_at).toLocaleDateString()}</Text>{request.subscription_plan?<Text style={{color:palette.gold,fontSize:12}}>Plan: {request.subscription_plan} · {request.subscription_status||"status unavailable"}</Text>:null}</Card>)}
  <Card><SmallLabel>01 · Media factory</SmallLabel><Text style={{color:palette.text,fontSize:19,fontWeight:"700"}}>Elite Media Studio</Text><Text style={{color:palette.muted,lineHeight:21}}>Open the existing Elite workspace for media requests, generated assets and full workflow management.</Text><Action label="Open media workspace" onPress={()=>void openTrackedLink(destinations.elite,"mobile_media_factory")}/></Card>
  <Card><SmallLabel>02 · Social distribution</SmallLabel><Text style={{color:palette.text,fontSize:19,fontWeight:"700"}}>Connected channels</Text><Text style={{color:palette.muted,lineHeight:21}}>Continue to the existing Buffer and publishing setup in Elite. Provider connection is not inferred from a successful sign-in.</Text><Action secondary label="Open publishing workspace" onPress={()=>void openTrackedLink(destinations.elite,"mobile_social_distribution")}/></Card>
  <Text style={{color:palette.muted,fontSize:11}}>Media generation and publishing actions remain in the existing Elite workspace until native entitlements, asset upload and provider-specific mobile actions are integrated.</Text>
 </Screen>;
}