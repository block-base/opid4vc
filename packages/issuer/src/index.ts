import dotenv from "dotenv";
import express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import QRCode from "qrcode";

import sample from "./config/well-known-openid-credential-issuer.json";
import { formatCredential } from "./lib/credential";
import { verifyToken } from "./lib/did";
import { signCredential } from "./lib/mattr";

dotenv.config();

const app = express();
app.use(express.json());

app.get("/", (_, res) => {
  res.send("OPID4VCI Wrapper Demo");
});

/**
 * This endpoint is used by the wallet to get the configuration of the issuer.
 */
app.get("/.well-known/openid-credential-issuer", (_, res) => {
  // TODO: get it from config value
  return res.json(sample);
});

/**
 * This endpoint shows QR code
 */
app.get("/qr", async (_, res) => {
  try {
    const url = "openid-credential-offer://?credential_offer=";
    const params = {
      credential_issuer: process.env.ISSUER_ENDPOINT,
      credentials: ["aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
    };
    const qrCodeImage = await QRCode.toDataURL(url + encodeURI(JSON.stringify(params)));
    res.setHeader("Content-Type", "image/png");
    res.send(Buffer.from(qrCodeImage.split(",")[1], "base64"));
  } catch (err) {
    console.error(err);
    res.status(500).send("Error generating QR Code");
  }
  return undefined;
});

app.get("/authorize", (req, res) => {
  const { scope, response_type, state, nonce, redirect_uri, code_challenge_method, code_challenge } = req.query;
  const url = new URL(`https://dev-blockbase-mo.jp.auth0.com/authorize`);
  if (typeof scope === "string") url.searchParams.append("scope", scope);
  if (typeof response_type === "string") url.searchParams.append("response_type", response_type);
  if (typeof state === "string") url.searchParams.append("state", state);
  if (typeof nonce === "string") url.searchParams.append("nonce", nonce);
  if (typeof redirect_uri === "string") url.searchParams.append("redirect_uri", redirect_uri);
  if (typeof code_challenge_method === "string")
    url.searchParams.append("code_challenge_method", code_challenge_method);
  if (typeof code_challenge === "string") url.searchParams.append("code_challenge", code_challenge);

  // /.well-known/openid-credential-issuer から取れないデータはここで追加する
  const client_id = process.env.AUTH0_CLIENT_ID as string;
  url.searchParams.append("client_id", client_id);
  const prompt = "login";
  url.searchParams.append("prompt", prompt);

  const audience = process.env.ISSUER_ENDPOINT as string;
  url.searchParams.append("audience", audience);
  res.redirect(url.toString());
});

app.post("/token", async (req, res) => {
  const { grant_type, client_id, code_verifier, code, redirect_uri } = req.body;
  const url = new URL(`https://dev-blockbase-mo.jp.auth0.com/oauth/token`);

  const resp = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      grant_type,
      client_id,
      code_verifier,
      code,
      redirect_uri,
    }),
  });

  res.json(await resp.json());
});

const jwtCheck = auth({
  audience: process.env.ISSUER_ENDPOINT || "aud",
  issuerBaseURL: "https://dev-blockbase-mo.jp.auth0.com/",
  tokenSigningAlg: "RS256",
});

interface ICredentialRequest {
  format: string;
  proof: {
    proof_type: string;
    jwt: string;
  };
}

app.post("/credential", jwtCheck, async (req, res) => {
  const { format, proof } = req.body as ICredentialRequest;
  if (!format || !proof) {
    res.status(400).send("format or proof is missing");
  }
  const { protectedHeader } = await verifyToken(proof.jwt);
  const payload = formatCredential({ id: protectedHeader.kid, name: "test" });
  const { credential } = await signCredential(payload);
  res.json({ credential, format });
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server is running on port ${port}`));
