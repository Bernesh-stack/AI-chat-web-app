import { StreamChat } from "stream-chat";


export const apiKey = process.env.STREAM_API_KEY;
export const apiSecret = process.env.STREAM_API_SECRET;

if(!apiKey || !apiSecret) {
    throw new Error("STREAM_API_KEY and STREAM_API_SECRET must be set");
}


export const serverClient = new StreamChat(apiKey, apiSecret);
