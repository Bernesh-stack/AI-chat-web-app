import { json } from "express";
import OpenAI from "openai";
import type { AssistantStream } from "openai/lib/AssistantStream";
import type{Channel,Event,MessageResponse,StreamChat} from "stream-chat";

export class OpenAIResponseHandler{
    private message_text = "";
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
        private readonly onDispose:()=>void,


    ){
        this.chatClient.on("ai_indicator.stop",this.handleStopGenerating)

    }
run = async () => {
    const { cid, id: message_id } = this.messsage;
    let isCompleted = false;
    let toolOutputs = [];
    let currentStream: AssistantStream = this.assistantStream;

    try {
      while (!isCompleted) {
        for await (const event of currentStream) {
          this.handleStreamEvent(event);

          if (
            event.event === "thread.run.requires_action" &&
            event.data.required_action?.type === "submit_tool_outputs"
          ) {
            this.run_id = event.data.id;
            await this.channel.sendEvent({
              type: "ai_indicator.update",
              ai_state: "AI_STATE_EXTERNAL_SOURCES",
              cid: cid,
              message_id: message_id,
            });
            const toolCalls =
              event.data.required_action.submit_tool_outputs.tool_calls;
            toolOutputs = [];

            for (const toolCall of toolCalls) {
              if (toolCall.function.name === "web_search") {
                try {
                  const args = JSON.parse(toolCall.function.arguments);
                  const searchResult = await this.performWebSearch(args.query);
                  toolOutputs.push({
                    tool_call_id: toolCall.id,
                    output: searchResult,
                  });
                } catch (e) {
                  console.error(
                    "Error parsing tool arguments or performing web search",
                    e
                  );
                  toolOutputs.push({
                    tool_call_id: toolCall.id,
                    output: JSON.stringify({ error: "failed to call tool" }),
                  });
                }
              }
            }
            // Exit the inner loop to submit tool outputs
            break;
          }

          if (event.event === "thread.run.completed") {
            isCompleted = true;
            break; // Exit the inner loop
          }

          if (event.event === "thread.run.failed") {
            isCompleted = true;
            await this.handleError(
              new Error(event.data.last_error?.message ?? "Run failed")
            );
            break; // Exit the inner loop
          }
        }

        if (isCompleted) {
          break; // Exit the while loop
        }

        if (toolOutputs.length > 0) {
          currentStream = this.openai.beta.threads.runs.submitToolOutputsStream(
            this.openAiThread.id,
            this.run_id,
            { tool_outputs: toolOutputs }
          );
          toolOutputs = []; // Reset tool outputs
        }
      }
    } catch (error) {
      console.error("An error occurred during the run:", error);
      await this.handleError(error as Error);
    } finally {
      await this.dispose();
    }
  };

     dispose= () =>{
        if(this.is_done){
            return;
        }
        this.is_done = true;
        this.chatClient.off("ai_indicator.stop",this.handleStopGenerating)
        this.onDispose()
     }
    private handleStopGenerating = async(event:Event)=>{
        if(this.is_done|| event.message_id !== this.messsage.id){
            return;
        }
        console.log("Stopping generating for message ",this.messsage.id);
        if(!this.openai || !this.openAiThread||!this.run_id ){
            return;
        
        }
        try {
            await this.openai.beta.threads.runs.cancel(
                this.openAiThread.id,
                { run_id: this.run_id } as any,
                
            )
            
        } catch (error) {
            console.error("Failed to cancel run:",error);
            
        }
        await this.channel.sendEvent({
            type:"ai_indicator.stop",
            cid:this.messsage.cid,
            message_id:this.messsage.id
        });
        await this.dispose();
    
    }
    private handleStreamEvent = async(event:OpenAI.Beta.Assistants.AssistantStreamEvent)=>{
        const{cid,id}=this.messsage

        if(event.event === "thread.run.created"){
            this.run_id = event.data.id;

        }
        else if(event.event === "thread.message.delta"){
            const textDelta = event.data.delta.content?.[0];
            if(textDelta?.type ==="text"&&textDelta.text){
                this.messsage.text+=textDelta.text.value||"";
                const now = Date.now();
                if(now-this.last_update_time >10_000){
                    this.chatClient.partialUpdateMessage(id,{
                        set:{
                            text:this.messsage.text
                        }

                    })
                    this.last_update_time = now;

                }
                this.chunk_counter++;



        }
    }
    else if(event.event === "thread.message.completed"){
        this.chatClient.partialUpdateMessage(id,{
            set:{
                text:event.data.content[0].type ==="text"?event.data.content[0].text.value:this.message_text,
            }
        })
        this.channel.sendEvent({
            type:"ai_indicator.clear",
            cid:cid,
            message_id:id
        
        })
    }
    else if(event.event === "thread.run.step.created"){
        if(event.data.step_details.type ==="message_creation"){
            this.channel.sendEvent({
                type:"ai_indicator.update",

                message_id:id,
                ai_state:"AI_STATE_GENERATING"
            })
        }

    }
}

    private handleError = async(error:Error)=>{
        if(this.is_done){
            return ;
        }
        await this.channel.sendEvent({
            type:"ai_indicator.clear",
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
        await  this.dispose();

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