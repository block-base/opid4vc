import { Credential } from "../../../common/types/credential";

export interface MattrOAuthTokenResponse {
  token_type: string;
  access_token: string;
}

export interface MattrSignResponse {
  credential: Credential;
}
