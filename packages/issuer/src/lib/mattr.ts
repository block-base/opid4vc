import { MattrOAuthTokenResponse, MattrSignResponse } from "../types/mattr";

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

export const signCredential = async (payload: any): Promise<MattrSignResponse> => {
  const { access_token, token_type } = await getOAuthToken();
  const data = await fetch(`${process.env.MATTR_TENANT_URL}/v2/credentials/web-semantic/sign`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `${token_type} ${access_token}`,
    },
    body: JSON.stringify({
      payload,
    }),
  }).then(async (res) => await res.json());
  return data;
};
