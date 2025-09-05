import { json } from "express";
import OpenAI from "openai";
import type { AssistantStream } from "openai/lib/AssistantStream";
import type{Channel,Event,MessageResponse,StreamChat} from "stream-chat";

export class OpenAIResponseHandler{
    private messsage_text ="";
    private chunk_counter = 0;
    private run_id = "";
    private is_done = false;
    private last_update_time = 0;


    constructor(
        private readonly openai:OpenAI,
        private readonly openAiThread:OpenAI.Beta.Threads.Thread,
        private readonly assistantStream:AssistantStream,
        private readonly chatClient:StreamChat,
        private readonly channel:Channel,
        private readonly messsage:MessageResponse,
        private readonly onDisposel:()=>void,


    ){
        this.chatClient.on("ai_indicator.stop",this.handleStop)

    }
     run = async()=>{}
     dispose= () =>{}
    private handleStop = async(event:Event)=>{}
    private handleStreamEvent = async(event:Event)=>{}
    private handleError = async(error:Error)=>{
        if(this.is_done){
            return 
        }
        await this.channel.sendEvent({
            type:"ai_indicator.error",
            ai_state:"AI_STATE_ERROR",
            cid:this.messsage.cid,
            message_id:this.messsage.id
        })
        await this.chatClient.partialUpdateMessage(this.messsage.id,{
            set:{
                text:error.message??"Error Generating the message",
                messsage:error.toString()
            }
        })
    }
    private performWebSearch = async(query:string):Promise<string>=>{
      const TAVILIY_API_KEY =   process.env.TAVILIY_API_KEY;
      if(!TAVILIY_API_KEY){
        throw new Error("TAVILIY_API_KEY must be set");
      }
      console.log(`Performing web search for ${query}`);
    
    try{
       const response = await fetch("http://api.taviliy.com/search",{
            method:"POST",
            headers:{
                "Content-Type":"application/json",
                Authorization:`Bearer ${TAVILIY_API_KEY}`
            },
            body:JSON.stringify({
                query:query,
                search_depth:"advanced",
                max_result : 5,
                include_answer:true,
                include_raw_content:false
            })
            
        })
        if(!response.ok){
            throw new Error(`HTTP error! status:${response.status}`)
        }
        const data = await response.json();
        console.log("Traviliy search is succesfull for query :Given")
        return JSON.stringify(data)
    }
    catch(error){
        console.error("Failed to perform web search:",error)
        return JSON.stringify({
            error:"Failed to perform web search",
        })
    }

}
}