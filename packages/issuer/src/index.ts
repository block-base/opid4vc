import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import NodeCache from "node-cache";
import QRCode from "qrcode";
import qs from "querystring";

import { verifyJwsWithDid } from "./lib/did";
import { formatCredential, getOpenidCredentialIssuer, signCredential } from "./lib/mattr";
import { StoredCache } from "./types/cache";

const cacheStorage = new NodeCache({ stdTTL: 600 });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const appUrl = process.env.APP_URL || "";
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
    credential_issuer: appUrl,
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
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/authorize`,
    token_endpoint: `${appUrl}/token`,
    credential_issuer: appUrl,
    credential_endpoint: `${appUrl}/credential`,
  };
  if (process.env.CREDENTIAL_ISSUER_TYPE === "mattr") {
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
  const { query } = req;
  const checkedQueryEntry = Object.entries(query).filter(([, value]) => typeof value === "string") as [
    [string, string]
  ];
  const checkedQuery = Object.fromEntries(checkedQueryEntry);
  cacheStorage.set<StoredCache>(checkedQuery.state, { redirect_uri: checkedQuery.redirect_uri });
  checkedQuery.client_id = process.env.AUTH_CLIENT_ID || "";
  checkedQuery.prompt = "login";
  checkedQuery.redirect_uri = "http://localhost:8000/callback";
  const queryString = qs.stringify(checkedQuery);
  return res.redirect(`${process.env.AUTH_URL}?${queryString}`);
});

app.get("/callback", (req, res) => {
  const { query } = req;
  const checkedQueryEntry = Object.entries(query).filter(([, value]) => typeof value === "string") as [
    [string, string]
  ];
  const checkedQuery = Object.fromEntries(checkedQueryEntry);
  const cache = cacheStorage.get<StoredCache>(checkedQuery.state);
  if (!cache) {
    throw new Error("cache is not defined");
  }
  const queryString = qs.stringify(checkedQuery);
  return res.redirect(`${cache.redirect_uri}?${queryString}`);
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
  audience: process.env.APP_URL || "aud",
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
