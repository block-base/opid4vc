export type CredentialSubject = any;

export interface Grants {
  "urn:ietf:params:oauth:grant-type:pre-authorized_code": { "pre-authorized_code": string };
}

export interface Credential {
  id: string;
  type?: string[];
  format?: string;
  credentialSubject?: CredentialSubject;
  display: {
    contract: string;
  };
}

export interface CredentialOffer {
  credential_issuer: string;
  credentials: string[];
  grants?: Grants;
}

export interface IssuerMetadata {
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
