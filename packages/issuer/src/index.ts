import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import QRCode from "qrcode";

import { verifyJwsWithDid } from "./lib/did";
import { formatCredential,getOpenidCredentialIssuer, signCredential } from "./lib/mattr";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const issuer = process.env.ISSUER_ENDPOINT || "";
const credentialId = process.env.CREDENTIAL_ID || "";

/**
 * health check
 */
app.get("/", (_, res) => {
  res.send("OPID4VCI Wrapper Demo");
});

/**
 * This endpoint shows QR code
 */
app.get("/qr", async (_, res) => {
  const url = "openid-credential-offer://?credential_offer=";
  const params = {
    credential_issuer: issuer,
    credentials: [credentialId],
  };
  const qrCodeImage = await QRCode.toDataURL(`${url}${encodeURI(JSON.stringify(params))}`);
  const qrCodeDataBase64 = qrCodeImage.split(",")[1];
  const qrCodeDataBuffer = Buffer.from(qrCodeDataBase64, "base64");
  res.setHeader("Content-Type", "image/png");
  return res.send(qrCodeDataBuffer);
});

/**
 * used by the wallet to get the configuration of the issuer.
 */
app.get("/.well-known/openid-credential-issuer", async (_, res) => {
  const override = {
    issuer,
    authorization_endpoint: `${issuer}/authorize`,
    token_endpoint: `${issuer}/token`,
    credential_issuer: issuer,
    credential_endpoint: `${issuer}/credential`,
  };
  if (process.env.ISSUER_TYPE === "mattr") {
    const data = await getOpenidCredentialIssuer();
    return res.json({
      ...data,
      ...override,
    });
  } else {
    throw new Error("not implemented");
  }
});

app.get("/authorize", (req, res) => {
  const { scope, response_type, state, nonce, redirect_uri, code_challenge_method, code_challenge } = req.query;
  const url = new URL(process.env.AUTH_URL || "");

  if (typeof scope === "string") url.searchParams.append("scope", scope);
  if (typeof response_type === "string") url.searchParams.append("response_type", response_type);
  if (typeof state === "string") url.searchParams.append("state", state);
  if (typeof nonce === "string") url.searchParams.append("nonce", nonce);
  if (typeof redirect_uri === "string") url.searchParams.append("redirect_uri", redirect_uri);
  if (typeof code_challenge_method === "string")
    url.searchParams.append("code_challenge_method", code_challenge_method);
  if (typeof code_challenge === "string") url.searchParams.append("code_challenge", code_challenge);

  const client_id = process.env.AUTH_CLIENT_ID || "";
  url.searchParams.append("client_id", client_id);
  const prompt = "login";
  url.searchParams.append("prompt", prompt);

  const audience = process.env.ISSUER_ENDPOINT || "";
  url.searchParams.append("audience", audience);
  return res.redirect(url.toString());
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

  return res.json(await resp.json());
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
  const { protectedHeader } = await verifyJwsWithDid(proof.jwt);
  // TODO: map info from id token
  const payload = formatCredential({ id: protectedHeader.kid, name: "name" });
  const { credential } = await signCredential(payload);
  return res.json({ credential, format });
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server is running on port ${port}`));
