import { decode } from "jsonwebtoken";

import { MSManifest } from "../types/ms";

export const getIssuerMetadata = async () => {
  const manifestUrl = `https://verifiedid.did.msidentity.com/v1.0/tenants/${process.env.MS_TENANT_ID}/verifiableCredentials/contracts/${process.env.CREDENTIAL_ID}/manifest`;

  const data = await fetch(manifestUrl, {
    method: "GET",
  }).then((result) => result.json());

  const manifest = decode(data.token) as MSManifest;

  let credentialSubject = {};
  manifest.input.attestations.idTokens[0].claims.map((claim) => {
    return (credentialSubject = {
      ...credentialSubject,
      [claim.claim]: "",
    });
  });

  const credential = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", process.env.CREDENTIAL_TYPE],
    name: manifest.display.card.title,
    description: manifest.display.card.description,
    display: {
      backgroundColor: manifest.display.card.backgroundColor,
      watermarkImageUrl: manifest.display.card.logo.uri,
      contract: manifest.display.contract,
    },
    credentialSubject,
  };
  // check env values for static values
  const issuerMetadata = {
    credentials_supported: [credential],
  };
  return issuerMetadata;
};

export const getCredentialEndpoint = () => {
  return `https://beta.did.msidentity.com/v1.0/tenants/${process.env.MS_TENANT_ID}/verifiableCredentials/issue`;
};
