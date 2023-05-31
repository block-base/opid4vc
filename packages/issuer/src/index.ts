import cors from "cors";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import express from "express";
import { auth } from "express-oauth2-jwt-bearer";
import { decode } from "jsonwebtoken";
import NodeCache from "node-cache";
import QRCode from "qrcode";
import qs from "querystring";

import { CredentialOffer } from "../../common/types/credential";
import { getCredentialFormat } from "./lib/credential";
import { verifyJwsWithDid } from "./lib/did";
import * as mattr from "./lib/mattr";
import * as ms from "./lib/ms";
import { StoredCacheWithState } from "./types/cache";
import { MSCredentialRequest } from "./types/ms";

const cacheStorage = new NodeCache({ stdTTL: 600 });
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// TODO: env validation
const appUrl = process.env.APP_URI || "";
const credentialIssuanceFlow = process.env.CREDENTIAL_ISSUEANCE_FLOW || "";
const credentialIssuerType = process.env.CREDENTIAL_ISSUER_TYPE || "";
const credentialType = process.env.CREDENTIAL_TYPE || "";
const credentialId = process.env.CREDENTIAL_ID || "";

const authUrl = process.env.AUTH_URL || "";
const tokenUrl = process.env.TOKEN_URL || "";
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
  if (credentialIssuanceFlow === "urn:ietf:params:oauth:grant-type:pre-authorized_code") {
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
    if (credentialIssuerType === "ms") {
      cacheStorage.set(preAuthorizedCode, request_uri);
    } else if (credentialIssuerType === "mattr") {
      throw new Error("not implemented");
    } else {
      // TODO: move validation in common logic
      throw new Error("credential issuer type is invalid");
    }
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
  let data;
  if (credentialIssuerType === "mattr") {
    data = await mattr.getOpenidCredentialIssuer();
  } else if (credentialIssuerType === "ms") {
    data = await ms.getCredentialSupported(credentialId);
  } else {
    throw new Error("not implemented");
  }
  const format = getCredentialFormat(credentialIssuerType);
  const scopes_supported = [`${format}:${credentialType}`];
  const response_types_supported = ["code"];
  const grant_types_supported = [credentialIssuanceFlow];
  return res.json({
    ...data,
    issuer: appUrl,
    authorization_endpoint: `${appUrl}/authorize`,
    token_endpoint: `${appUrl}/token`,
    credential_issuer: appUrl,
    credential_endpoint: `${appUrl}/credential`,
    scopes_supported,
    response_types_supported,
    grant_types_supported,
  });
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

  const format = getCredentialFormat(credentialIssuerType);

  if (credentialIssuanceFlow === "urn:ietf:params:oauth:grant-type:pre-authorized_code") {
    const pre_authorized_code = req.body["pre-authorized_code"];
    if (pre_authorized_code) {
      const requestUri = cacheStorage.get<string>(pre_authorized_code);
      if (!requestUri) {
        throw new Error("request uri is not defined");
      }
      const resp = await fetch(requestUri, {
        method: "GET",
      }).then((result) => result.text());
      const issueRequest = decode(resp) as MSCredentialRequest;
      cacheStorage.set(issueRequest.id_token_hint, issueRequest);
      const data = {
        access_token: issueRequest.id_token_hint,
        token_type: "Bearer",
        scope: `${format}:${credentialType}`,
      };
      return res.json(data);
    } else {
      throw new Error("not implemented");
    }
  }

  const url = new URL(tokenUrl);
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

// TODO: make it common
const jwtCheck = auth({
  audience: appUrl,
  issuerBaseURL: "https://dev-blockbase-mo.jp.auth0.com/",
  tokenSigningAlg: "RS256",
});

// TODO: make it common
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

  // TODO: implement ms flow
  const { format, proof } = req.body as ICredentialRequest;
  if (!format || !proof) {
    res.status(400).send("format or proof is missing");
  }
  if (credentialIssuerType === "ms") {
    // 1. get authorize token
    const id_token = req.body["pre-authorized_code"];
    // 2. verify token check
    // 3. get request uri
    const issueEndpoint = ms.getCredentialEndpoint();
    const { vc } = await fetch(issueEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(proof.jwt),
    }).then(async (res) => await res.json());
    return res.json({ credential: vc, format });
  }

  const { protectedHeader } = await verifyJwsWithDid(proof.jwt);
  // TODO: map info from id token
  const payload = mattr.formatCredential(credentialId, { id: protectedHeader.kid, name: "name" });
  const { credential } = await mattr.signCredential(payload);
  return res.json({ credential, format });
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server is running on port ${port}`));
