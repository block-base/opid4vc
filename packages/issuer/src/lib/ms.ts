export const getCredentialSupported = (credentialId: string) => {
  const manifestUrl = `https://verifiedid.did.msidentity.com/v1.0/tenants/${process.env.MS_TENANT_ID}/verifiableCredentials/contracts/${credentialId}/manifest`;
  // TODO: implement
  // 1. get manifest
  // 2. decode manifest
  // 3. mapping
  // check env values for static values
  const credentials_supported = [{}];
  return { credentials_supported };
};
