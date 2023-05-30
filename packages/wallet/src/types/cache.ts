import { Credential } from "../../../common/types/credential";

export interface StoredCacheWithState {
  token_endpoint: string;
  credential_endpoint: string;
  credential: Credential;
}
