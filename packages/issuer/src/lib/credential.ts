export const getCredentialFormat = (type: string) => {
  if (type === "mattr") {
    return "ldp_vc";
  } else if (type === "ms") {
    return "jwt_vc_json";
  } else {
    throw new Error("not implemented");
  }
};
