export interface AccessToken {
  aud: string;
  iss: string;
  iat: number;
  nbf: number;
  exp: number;
  nonce: string;
}
