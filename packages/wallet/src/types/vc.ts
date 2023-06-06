export interface JsonLDCredential {
  "@context": string[];
  id: string;
  type: string[];
  issuer: {
    id: string;
    name?: string;
  };
  issuanceDate: string;
  credentialSubject: Record<string, unknown>;
  proof: {
    type: string;
    verificationMethod: string;
    created: string;
  };
}

export interface JwtCredential {
  vc: {
    "@context": string[];
    id: string;
    type: string[];
    issuer: {
      id: string;
      name?: string;
    };
    issuanceDate: string;
    credentialSubject: Record<string, unknown>;
  };
  iss: string;
  sub: string;
  aud: string;
  iat: number;
  exp: number;
}

export interface storedCredential {
  id: string;
  vc: JsonLDCredential | JwtCredential;
}
