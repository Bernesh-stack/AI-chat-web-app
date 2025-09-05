import dotenv from "dotenv";
dotenv.config();

import cors from "cors";
import express from "express";
import { serverClient } from "./serverClient"; 

const app = express();

app.use(express.json());
app.use(cors({ origin: "*" }));

app.get("/", (req, res) => {
  res.json({
    message: "AI writing assistant is running",
    streamConnected: !!serverClient, 
  });
});

const port = process.env.PORT || 5000;
app.listen(port, () => {
  console.log(`AI writing assistant is running on port ${port}`);
});
