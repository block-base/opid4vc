export type CredentialSubject = any;

export interface Credential {
  id: string;
  credentialSubject: CredentialSubject;
}

export interface OpenIdConfiguration {
  authorization_endpoint: string;
  code_challenge_methods_supported: string[];
  credential_endpoint: string;
  credential_issuer: string;
  credentials_supported: Credential[];
  grant_types_supported: string[];
  issuer: string;
  response_modes_supported: string[];
  response_types_supported: string[];
  scopes_supported: string[];
  token_endpoint: string;
  token_endpoint_auth_methods_supported: string[];
}