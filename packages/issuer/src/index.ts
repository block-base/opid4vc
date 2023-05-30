import cors from "cors";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import NodeCache from "node-cache";
import QRCode from "qrcode";
import qs from "querystring";

import { CredentialOffer } from "../../common/types/credential";
import { getCredentialFormat } from "./lib/credential";
import { verifyJwsWithDid } from "./lib/did";
import { formatCredential, getOpenidCredentialIssuer, signCredential } from "./lib/mattr";
import { StoredCacheWithState } from "./types/cache";

const cacheStorage = new NodeCache({ stdTTL: 600 });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// TODO: env validation
const appUrl = process.env.APP_URL || "";
const credentialIssuanceFlow = process.env.CREDENTIAL_ISSUEANCE_FLOW || "";
const credentialIssuerType = process.env.CREDENTIAL_ISSUER_TYPE || "";
const credentialId = process.env.CREDENTIAL_ID || "";

const authUrl = process.env.AUTH_URL || "";
const authClientId = process.env.AUTH_CLIENT_ID || "";

const callbackUri = `${appUrl}/callback`;
const credentialOfferBaseUrl = "openid-credential-offer://?credential_offer=";

/**
 * health check
 */
app.get("/", (_, res) => {
  res.send("OPID4VCI Wrapper Demo");
});

/**
 * This endpoint shows QR code
 */
app.get("/qr", async (req, res) => {
  const format = getCredentialFormat(credentialIssuerType);
  const credentialOffer: CredentialOffer = {
    credential_issuer: appUrl,
    credentials: [{ id: credentialId, format }],
  };
  if (credentialIssuanceFlow === "pre_authorized_code") {
    // TODO: replace for ms integration
    // 1. access token validation
    // 2. create request url (use query for now)
    const { request_uri } = req.query as any;
    // this should be removed
    if (!request_uri) {
      throw new Error("access token invalid");
    }

    const preAuthorizedCode = randomUUID();
    credentialOffer.grants = {
      "urn:ietf:params:oauth:grant-type:pre-authorized_code": {
        "pre-authorized_code": preAuthorizedCode,
      },
    };
    cacheStorage.set(preAuthorizedCode, request_uri);
  }
  const qrCodeImage = await QRCode.toDataURL(`${credentialOfferBaseUrl}${encodeURI(JSON.stringify(credentialOffer))}`);
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
  if (credentialIssuerType === "mattr") {
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
  cacheStorage.set<StoredCacheWithState>(checkedQuery.state, { redirect_uri: checkedQuery.redirect_uri });
  checkedQuery.client_id = authClientId;
  checkedQuery.prompt = "login";
  checkedQuery.redirect_uri = callbackUri;

  const queryString = qs.stringify(checkedQuery);
  return res.redirect(`${authUrl}?${queryString}`);
});

app.get("/callback", (req, res) => {
  const { query } = req;
  const checkedQueryEntry = Object.entries(query).filter(([, value]) => typeof value === "string") as [
    [string, string]
  ];
  const checkedQuery = Object.fromEntries(checkedQueryEntry);
  const cache = cacheStorage.get<StoredCacheWithState>(checkedQuery.state);
  if (!cache) {
    throw new Error("cache is not defined");
  }
  const queryString = qs.stringify(checkedQuery);
  return res.redirect(`${cache.redirect_uri}?${queryString}`);
});

app.post("/token", async (req, res) => {
  const { code } = req.body;
  const url = new URL(`https://dev-blockbase-mo.jp.auth0.com/oauth/token`);
  const grant_type = "authorization_code";
  const redirect_uri = callbackUri;
  const client_id = authClientId;
  const data = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id,
      code,
      grant_type,
      redirect_uri,
    }),
  }).then(async (res) => await res.json());
  return res.json(data);
});

const jwtCheck = auth({
  audience: appUrl,
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

// app.post("/credential", jwtCheck, async (req, res) => {
app.post("/credential", async (req, res) => {
  console.log("credential");
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
