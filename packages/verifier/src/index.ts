import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import NodeCache from "node-cache";
import QRCode from "qrcode";

import presentation_definition from "../config/presentation-definition.json";

const cacheStorage = new NodeCache({ stdTTL: 600 });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const appUrl = process.env.APP_URI || "";
const qrCodeBase = "openid4vp://?request_uri=";

app.get("/", (_, res) => {
  res.send("Verifier");
});

app.get("/qr", async (req, res) => {
  // TODO: transaction id

  const requestUri = `${appUrl}/presentationRequest`;
  const url = `${qrCodeBase}${encodeURIComponent(requestUri)}`;
  console.log(url);
  const qrCodeImage = await QRCode.toDataURL(url);
  const qrCodeDataBase64 = qrCodeImage.split(",")[1];
  const qrCodeDataBuffer = Buffer.from(qrCodeDataBase64, "base64");
  res.setHeader("Content-Type", "image/png");
  return res.send(qrCodeDataBuffer);
});

app.get("/presentationRequest", async (req, res) => {
  // TODO: state & nonce

  const redirect_uri = `${appUrl}/post`;
  const presentationRequest = {
    response_types: "vp_token",
    response_mode: "direct_post",
    scope: "openid",
    redirect_uri,
    presentation_definition,
  };
  return res.json(presentationRequest);
});

app.post("/post", async (req, res) => {
  const { presentation_submission, vp_token } = req.body;
  // TODO: state & nonce

  // TODO: verify vp_token
  console.log("vp_token", vp_token);
  // TODO: return value and integrate frontend
  console.log("presentation_submission", presentation_submission);
  return res.send("ok");
});

const port = process.env.APP_PORT || 8001;
app.listen(port, () => console.log(`Server is running on port ${port}`));
