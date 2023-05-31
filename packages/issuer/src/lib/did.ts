import jsonwebtoken from "jsonwebtoken";
// import { jwtVerify, importJWK } from "jose";

export const verifyJwsWithDid = async (token: string) => {
  const decoded = jsonwebtoken.decode(token, {
    complete: true,
  });
  if (!decoded) {
    throw new Error("failed to decode token");
  }
  const { header } = decoded;
  if (!header.kid) {
    throw new Error("kid is undefined");
  }

  // Note: The following code block is currently commented out due to the unavailability of the Universal Resolver during development.
  // const data = await fetch(`https://dev.uniresolver.io/1.0/identifiers/${header.kid}`, {
  //   method: "GET",
  // }).then((res) => res.json());
  // const jwk = await importJWK(data.didDocument.verificationMethod[0].publicKeyJwk);
  // const { protectedHeader } = await jwtVerify(token, jwk);
  // return { protectedHeader };
  const kid = header.kid.split("#")[0];
  return { protectedHeader: { ...header, kid } };
};
