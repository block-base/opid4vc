interface AuthResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

export const getAccessToken = async (): Promise<AuthResponse> => {
  const client_id = process.env.MATTR_CLIENT_ID;
  const client_secret = process.env.MATTR_CLIENT_SECRET;

  const resp = await fetch(`https://auth.mattr.global/oauth/token`, {
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
  });
  return await (resp.json() as Promise<AuthResponse>);
};
