import {useState} from "react";
import {ActivityIndicator,Text,TextInput,View} from "react-native";
import {Action,Card,Eyebrow,Heading,Screen,SmallLabel,palette} from "@/components/ui";
import {destinations,openTrackedLink,getRsid} from "@/lib/links";
import {useAuth} from "@/providers/auth-provider";
import {supabase} from "@/lib/supabase";
type Offer={id:string;sku:string;handle:string;title:string;product_type:string;score:number;image?:string|null};
export default function DiscoverScreen(){
 const {session}=useAuth();const [query,setQuery]=useState("");const [offers,setOffers]=useState<Offer[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState("");const [searched,setSearched]=useState(false);
 async function search(){if(!supabase||!session)return;const q=query.trim();if(!q)return;setBusy(true);setError("");setSearched(true);
  try{const rsid=await getRsid();const {data,error:invokeError}=await supabase.functions.invoke("chatb2k-recommend",{body:{query:q,user_id:session.user.id,rsid,limit:8}});if(invokeError)throw invokeError;setOffers(Array.isArray(data?.recommendations)?data.recommendations:[]);}
  catch(e){setOffers([]);setError(e instanceof Error?e.message:"Recommendation search failed.");}
  finally{setBusy(false);}
 }
 return <Screen><Eyebrow>ResoFit marketplace</Eyebrow><Heading subtitle="Search the live first-party catalog through ChatB2K's server-side recommendation engine.">Find your next solution.</Heading>
  <Card><SmallLabel>Personalized product discovery</SmallLabel><TextInput value={query} onChangeText={setQuery} onSubmitEditing={()=>void search()} placeholder="What are you looking for?" placeholderTextColor="#77756F" returnKeyType="search" style={{backgroundColor:"#0B0D10",borderColor:"#303238",borderWidth:1,borderRadius:12,padding:14,color:palette.text}}/><Action label={busy?"Searching…":"Find recommendations"} onPress={()=>void search()} disabled={busy||!query.trim()}/>{busy?<ActivityIndicator color={palette.gold}/>:null}{error?<Text style={{color:palette.danger,fontSize:12}}>{error}</Text>:null}</Card>
  {offers.map((offer,i)=><Card key={offer.id||offer.sku}><SmallLabel>Match {i+1} · {offer.product_type||"ResoFit product"}</SmallLabel><Text style={{color:palette.text,fontSize:17,fontWeight:"700"}}>{offer.title}</Text><Text style={{color:palette.muted,fontSize:11}}>SKU {offer.sku} · Recommendation fit {Math.round(offer.score||0)}%</Text><Action secondary label="View product" onPress={()=>void openTrackedLink(`${destinations.resofit}/products/${encodeURIComponent(offer.handle)}`,"mobile_recommendation")}/></Card>)}
  {searched&&!busy&&offers.length===0&&!error?<Text style={{color:palette.muted,fontSize:12}}>No matching in-stock first-party recommendations were returned for that search.</Text>:null}
  <Text style={{color:palette.muted,fontSize:11}}>Recommendations come from the live catalog endpoint. Final price, stock and checkout authority remain on the ResoFit server.</Text>
 </Screen>;
}