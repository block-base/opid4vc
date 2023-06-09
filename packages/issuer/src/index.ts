import cors from "cors";
import { randomUUID } from "crypto";
import dotenv from "dotenv";
import express from "express";
// import { auth } from "express-oauth2-jwt-bearer";
import { decode } from "jsonwebtoken";
import morgan from "morgan";
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
app.use(express.urlencoded({ extended: true }));
app.use(morgan("dev"));

// TODO: env validation
const appUrl = process.env.APP_URI || "";
const credentialIssuanceFlow = process.env.CREDENTIAL_ISSUEANCE_FLOW || "";
const credentialIssuerType = process.env.CREDENTIAL_ISSUER_TYPE || "";
const credentialType = process.env.CREDENTIAL_TYPE || "";
const credentialId = process.env.CREDENTIAL_ID || "";

const authUrl = process.env.AUTH_URL || "";
const authClientId = process.env.AUTH_CLIENT_ID || "";
const authClientSecret = process.env.AUTH_CLIENT_SECRET || "";

const callbackUri = `${appUrl}/callback`;
const credentialOfferBaseUrl = "oid4vci://?credential_offer=";

/**
 * health check
 */
app.get("/", (_, res) => {
  res.send("Issuer");
});

/**
 * This endpoint shows QR code
 */
app.get("/qr", async (req, res) => {
  const credentialOffer: CredentialOffer = {
    credential_issuer: appUrl,
    credentials: [credentialId],
  };
  if (credentialIssuanceFlow === "urn:ietf:params:oauth:grant-type:pre-authorized_code") {
    const { request_uri } = req.query;
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
  const qrCodeImage = await QRCode.toDataURL(
    `${credentialOfferBaseUrl}${encodeURIComponent(JSON.stringify(credentialOffer))}`
  );
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
    data = await mattr.getIssuerMetadata();
  } else if (credentialIssuerType === "ms") {
    data = await ms.getIssuerMetadata();
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
  console.log(checkedQuery);
  cacheStorage.set<StoredCacheWithState>(checkedQuery.state, { redirect_uri: checkedQuery.redirect_uri });
  checkedQuery.client_id = authClientId;
  checkedQuery.scope = `openid offline_access ${authClientId}`;
  checkedQuery.response_type = "code";
  checkedQuery.prompt = "login";
  checkedQuery.redirect_uri = callbackUri;

  // NOTE: temp delete for mattr wallet
  delete checkedQuery.code_challenge;
  delete checkedQuery.code_challenge_method;

  const queryString = qs.stringify(checkedQuery);
  return res.redirect(`${authUrl}/authorize?${queryString}`);
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

  const url = new URL(`${authUrl}/token`);

  const grant_type = "authorization_code";
  const client_id = authClientId;
  const client_secret = authClientSecret;
  const request_uri = callbackUri;
  const data = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id,
      client_secret,
      code,
      grant_type,
      request_uri,
    }),
  }).then((res) => res.json());
  console.log("data", data);
  return res.json(data);
});

// TODO: make it common
interface ICredentialRequest {
  format: string;
  proof: {
    proof_type: string;
    jwt: string;
  };
}

// TODO: validate access token
// app.post("/credential", jwtCheck, async (req, res) => {
app.post("/credential", async (req, res) => {
  // TODO: implement ms flow
  const bearerToken = req.headers.authorization;
  const { format, proof } = req.body as ICredentialRequest;
  if (!format || !proof) {
    res.status(400).send("format or proof is missing");
  }
  if (credentialIssuerType === "ms") {
    // 1. get authorize token
    const id_token = bearerToken;
    // 2. verify token check
    // 3. get request uri
    const issueEndpoint = ms.getCredentialEndpoint();
    const { vc } = await fetch(issueEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain",
      },
      body: proof.jwt,
    }).then(async (res) => {
      const json = await res.json();
      return json;
    });
    return res.json({ credential: vc, format });
  }

  const { protectedHeader } = await verifyJwsWithDid(proof.jwt);
  // TODO: map info from id token
  const { credential } = await mattr.createCredential(credentialId, { id: protectedHeader.kid });
  return res.json({ credential, format });
});

const port = process.env.PORT || 8000;
app.listen(port, () => console.log(`Server is running on port ${port}`));
