import template from "../config/credential-template.json";

export const formatCredential = (credentialSubject: any) => {
  return { ...template, credentialSubject: { ...template.credentialSubject, ...credentialSubject } };
};
