import { decode } from "jsonwebtoken";

import { MSManifest } from "../types/ms";

export const getCredentialSupported = async (credentialId: string) => {
  const manifestUrl = `https://verifiedid.did.msidentity.com/v1.0/tenants/${process.env.MS_TENANT_ID}/verifiableCredentials/contracts/${credentialId}/manifest`;

  const resp = await fetch(manifestUrl, {
    method: "GET",
  }).then((result) => result.json());

  const manifest = decode(resp.token) as MSManifest;

  let credentialSubject = {};
  manifest.input.attestations.idTokens[0].claims.map((claim: any) => {
    return (credentialSubject = {
      ...credentialSubject,
      [claim.claim]: "",
    });
  });

  const credential = {
    type: ["VerifiableCredential", process.env.CREDENTIAL_TYPE],
    name: manifest.display.card.title,
    description: manifest.display.card.description,
    credentialBranding: {
      backgroundColor: manifest.display.card.backgroundColor,
      watermarkImageUrl: manifest.display.card.logo.uri,
    },
    credentialSubject,
    "@context": ["https://www.w3.org/2018/credentials/v1"],
  };
  // check env values for static values
  const credentials_supported = [credential];
  return { credentials_supported };
};

export const getCredentialEndpoint = () => {
  return `https://beta.did.msidentity.com/v1.0/tenants/${process.env.MS_TENANT_ID}/verifiableCredentials/issue`;
};
