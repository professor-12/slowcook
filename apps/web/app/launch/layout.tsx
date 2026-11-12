import type { Metadata } from "next";
import { FACTORY, RPC } from "@/lib/near";

export const metadata: Metadata = {
  title: "Launch | SlowCook on NEAR testnet",
  description: "One launch on NEAR testnet: sealed bids, the single clearing price every winner pays, the pool at that price and the Floor Keeper treasury.",
};

// Start the one RPC call the launch name depends on while the HTML is still parsing, in parallel
// with the JS download (the name is this page's largest paint). The page picks it up via takeEarlyLaunch().
const EARLY = `(function(){try{var id=new URLSearchParams(location.search).get("id")||"0";var b=JSON.stringify({jsonrpc:"2.0",id:"early",method:"query",params:{request_type:"call_function",finality:"optimistic",account_id:${JSON.stringify(FACTORY)},method_name:"get_launch",args_base64:btoa(JSON.stringify({id:id}))}});window.__slowcookEarly={id:id,p:fetch(${JSON.stringify(RPC)},{method:"POST",headers:{"Content-Type":"application/json"},body:b}).then(function(r){return r.json()})};}catch(e){}})();`;

export default function LaunchLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script dangerouslySetInnerHTML={{ __html: EARLY }} />
      {children}
    </>
  );
}
