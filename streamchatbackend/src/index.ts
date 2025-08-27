import cors from "cors";
import "dotenv";
import express from "express"
import { apiKey } from "./serverClient";

const app = express()

app.use(express.json())
app.use(cors({origin:"*"}))


app.get("/",(req,res)=>{
    res.json({
        messasge:"AI writing assistant is running",
        apiKey:apiKey,

    })
})


const port = process.env.PORT || 5000;
app.listen(port,()=>{
    console.log(`AI writing assistant is running on port ${port}`)
})



