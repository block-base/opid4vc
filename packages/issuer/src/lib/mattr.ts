import { Credential, CredentialSubject, IssuerMetadata } from "../../../common/types/credential";
import { MattrOAuthTokenResponse, MattrSignResponse } from "../types/mattr";

export const getIssuerMetadata = async (): Promise<IssuerMetadata> => {
  const data = await fetch(
    `https://${process.env.MATTR_TENANT_ID}.vii.mattr.global/.well-known/openid-credential-issuer`
  ).then(async (res) => await res.json());
  return data;
};

export const getOAuthToken = async (): Promise<MattrOAuthTokenResponse> => {
  const client_id = process.env.MATTR_CLIENT_ID;
  const client_secret = process.env.MATTR_CLIENT_SECRET;
  const data = await fetch(`https://auth.mattr.global/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id,
      client_secret,
      audience: "https://vii.mattr.global",
      grant_type: "client_credentials",
    }),
  }).then(async (res) => await res.json());
  return data;
};

export const createCredential = async (
  credentialId: string,
  credentialSubject: CredentialSubject
): Promise<MattrSignResponse> => {
  const { credentials_supported } = await getIssuerMetadata();
  const foundCredentialSupported = credentials_supported.find(
    (credential: Credential) => credential.id === credentialId
  );
  if (!foundCredentialSupported) {
    throw new Error("credential supported not found");
  }
  const { type } = foundCredentialSupported;
  const payload = {
    type,
    issuer: {
      id: process.env.CREDENTIAL_ISSUER_DID,
      name: process.env.CREDENTIAL_ISSUER_NAME,
    },
    credentialSubject,
  };
  const { access_token, token_type } = await getOAuthToken();
  const data = await fetch(`https://${process.env.MATTR_TENANT_ID}.vii.mattr.global/v2/credentials/web-semantic/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${token_type} ${access_token}`,
    },
    body: JSON.stringify({
      payload,
    }),
  }).then(async (res) => await res.json());
  if (!data.credential) {
    throw new Error("create credential failed");
  }
  return data;
};
