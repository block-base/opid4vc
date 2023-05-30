import { Credential, CredentialSubject } from "../../../common/types/credential";
import { MattrOAuthTokenResponse, MattrSignResponse } from "../types/mattr";

export const getOpenidCredentialIssuer = async () => {
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

export const formatCredential = async (credentialId: string, credentialSubject: CredentialSubject) => {
  const { credentials_supported } = await getOpenidCredentialIssuer();
  const credential = credentials_supported.find((credential: Credential) => credential.id === credentialId);
  // Note: The current implementation leverages the supported credential as a template for simplicity.
  // However, future enhancements should include modifications to certain fields in order to align more closely with the actual Mattr credential structure.
  credential.credentialSubject = {
    ...credential.credentialSubject,
    ...credentialSubject,
  };
  return credential;
};

export const signCredential = async (credentialSubject: any): Promise<MattrSignResponse> => {
  const { access_token, token_type } = await getOAuthToken();
  const data = await fetch(`https://${process.env.MATTR_TENANT_ID}.vii.mattr.global/v2/credentials/web-semantic/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${token_type} ${access_token}`,
    },
    body: JSON.stringify({
      payload: credentialSubject,
    }),
  }).then(async (res) => await res.json());
  return data;
};
