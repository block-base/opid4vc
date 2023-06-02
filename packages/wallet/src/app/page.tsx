"use client";
import * as ionjs from "@decentralized-identity/ion-sdk/dist/lib/index";
import jsonwebtoken from "jsonwebtoken";
import { useRouter, useSearchParams } from "next/navigation";
import qs from "querystring";
import { useEffect, useState } from "react";
import QRCode from "react-qr-code";
import { useZxing } from "react-zxing";
import { v4 as uuidv4 } from "uuid";

import { StoredCacheWithState } from "@/types/cache";
import { AccessToken } from "@/types/token";

import { Credential, IssuerMetadata } from "../../../common/types/credential";
import { Signer } from "../../lib/signer";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [dataInQRCode, setDataInQRCode] = useState("");
  const [mode, setMode] = useState<"Issue" | "Verify">();
  const [dataFromOpenidCredentialIssuer, setDataFromOpenidCredentialIssuer] = useState<IssuerMetadata>();
  const [authorizationUrlWithQuery, setAuthorizationUrlWithQuery] = useState("");
  const [issuingCredential, setIssuingCredential] = useState<Credential>();
  const [code, setCode] = useState("");
  const [preCode, setPreCode] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [issuedCredential, setIssuedCredential] = useState<Credential>();
  const [did, setDid] = useState("");

  const [dataFromPresentaionRequest, setDataFromPresentaionRequest] = useState<any>();
  const [availableCredential, setAvailableCredential] = useState();

  const [publicKey, setPublicKey] = useState<ionjs.JwkEs256k>();
  const [privateKey, setPrivateKey] = useState<ionjs.JwkEs256k>();

  const { ref } = useZxing({
    onResult(result) {
      const text = result.getText();
      setDataInQRCode(text);
    },
  });

  useEffect(() => {
    (async () => {
      const signer = new Signer();
      const [publicKey, privateKey] = await ionjs.IonKey.generateEs256kOperationKeyPair();
      await signer.init(publicKey, privateKey);
      setPublicKey(publicKey);
      setPrivateKey(privateKey);
      if (!signer.did) {
        throw new Error("did is not found");
      }
      setDid(signer.did);
    })();
  }, []);

  useEffect(() => {
    if (!dataInQRCode) {
      return;
    }
    const [scheme] = dataInQRCode.split("://");
    const parsedQuery = qs.parse(dataInQRCode);
    if (scheme === "opid4vci") {
      const key = "opid4vci://?credential_offer";
      if (typeof parsedQuery[key] !== "string") {
        return;
      }
      setMode("Issue");
      const credentialOffer = JSON.parse(parsedQuery[key]);

      const preAuthorizationCode =
        credentialOffer.grants["urn:ietf:params:oauth:grant-type:pre-authorized_code"]["pre-authorized_code"];
      if (preAuthorizationCode) {
        setPreCode(preAuthorizationCode);
      }

      localStorage.setItem("credentialOffer", JSON.stringify(credentialOffer));
      fetch(`${credentialOffer.credential_issuer}/.well-known/openid-credential-issuer`)
        .then((res) => res.json())
        .then((data) => {
          setDataFromOpenidCredentialIssuer(data);
        });
    } else if (scheme === "openid4vp") {
      const key = "openid4vp://?request_uri";
      if (typeof parsedQuery[key] !== "string") {
        return;
      }
      setMode("Verify");
      const requestUri = parsedQuery[key];
      fetch(requestUri)
        .then((res) => res.json())
        .then((data) => {
          setDataFromPresentaionRequest(data);
        });
    }
  }, [dataInQRCode]);

  useEffect(() => {
    if (!dataFromOpenidCredentialIssuer) {
      return;
    }
    const { authorization_endpoint, token_endpoint, credential_endpoint } = dataFromOpenidCredentialIssuer;
    const [scope] = dataFromOpenidCredentialIssuer.scopes_supported;
    const [response_type] = dataFromOpenidCredentialIssuer.response_types_supported;
    const [credential] = dataFromOpenidCredentialIssuer.credentials_supported;
    const state = "defaultState";
    const cliend_id = process.env.NEXT_PUBLIC_CLIENT_ID;
    const redirect_uri = "http://localhost:3000";
    const queryString = qs.stringify({
      scope,
      response_type,
      state,
      cliend_id,
      redirect_uri,
    });
    const cache = {
      token_endpoint,
      credential_endpoint,
      credential,
    };
    localStorage.setItem(state, JSON.stringify(cache));
    setAuthorizationUrlWithQuery(`${authorization_endpoint}?${queryString}`);
  }, [dataFromOpenidCredentialIssuer]);

  useEffect(() => {
    if (!dataFromPresentaionRequest) {
      return;
    }
    const existingCredentialsString = localStorage.getItem("credentials");
    if (!existingCredentialsString) {
      return;
    }
    const existingCredentials = JSON.parse(existingCredentialsString) as any[];
    const availableCredential = existingCredentials.find(({ vc: { type } }) =>
      type?.includes(dataFromPresentaionRequest.presentation_definition.input_descriptors[0].id)
    );
    setAvailableCredential(availableCredential);
  }, [dataFromPresentaionRequest]);

  const preAuthIssue = async () => {
    const existingCredentialOfferString = localStorage.getItem("credentialOffer");
    if (!existingCredentialOfferString) {
      throw new Error("existingCredentialOfferString is not found");
    }

    const credentialOffer = JSON.parse(existingCredentialOfferString);
    const preAuthorizationCode = preCode;
    if (!preAuthorizationCode) {
      throw new Error("preAuthorizationCode is not found");
    }
    console.log("credentialOffer", credentialOffer);
    if (!dataFromOpenidCredentialIssuer) {
      throw new Error("dataFromOpenidCredentialIssuer is not found");
    }
    const res = await fetch(`${dataFromOpenidCredentialIssuer?.token_endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        grant_type: "urn:ietf:params:oauth:grant-type:pre-authorized_code",
        "pre-authorized_code": preCode,
      }),
    });
    const { access_token } = await res.json();
    if (!access_token) {
      setAccessToken("fetch access token failed");
      throw new Error("fetch access token failed");
    } else {
      setAccessToken(access_token);
    }

    const decodedAccesstoken = jsonwebtoken.decode(access_token) as AccessToken;

    // TODO: hardcode for now
    const format = "jwt_vc_json";
    const type = "CourseCredential";

    const attestations = { idTokens: { "https://self-issued.me": access_token } };

    if (!publicKey || !privateKey) {
      throw new Error("publicKey or privateKey is not found");
    }
    const signer = new Signer();
    await signer.init(publicKey, privateKey);

    const issueRequestIdToken = await signer.siop({
      aud: decodedAccesstoken.aud,
      contract: dataFromOpenidCredentialIssuer.credentials_supported[0].display.contract,
      attestations,
      // pin: options?.pin,
    });
    console.log("issueRequestIdToken", issueRequestIdToken);

    const proof = {
      proof_type: "jwt",
      jwt: issueRequestIdToken,
    };

    const resp = await fetch(`${dataFromOpenidCredentialIssuer.credential_endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${access_token}`,
      },
      body: JSON.stringify({ format, type, proof }),
    });

    const { credential } = await resp.json();

    const id = uuidv4();
    const vc = credential;
    const existingCredentialsString = localStorage.getItem("credentials");

    let existingCredential;
    if (existingCredentialsString) {
      existingCredential = JSON.parse(existingCredentialsString);
    } else {
      existingCredential = [];
    }

    existingCredential.push({ id, vc });
    localStorage.setItem("credentials", JSON.stringify(existingCredential));
    setIssuedCredential(vc);
  };

  useEffect(() => {
    // TODO: add pre auth flow
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    if (!code || !state) {
      return;
    }
    const item = localStorage.getItem(state);
    if (!item) {
      return;
    }
    const cache = JSON.parse(item) as StoredCacheWithState;
    setMode("Issue");

    setIssuingCredential(cache.credential);

    const existingCredentialOfferString = localStorage.getItem("credentialOffer");
    if (!existingCredentialOfferString) {
      return;
    }
    setCode(code);

    console.log("cache", cache);
    fetch(`${cache.token_endpoint}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ code }),
    })
      .then((res) => res.json())
      .then(({ access_token }) => {
        if (!access_token) {
          setAccessToken("fetch access token failed");
          return;
        } else {
          setAccessToken(access_token);
        }

        // TODO: hardcode for now
        const format = "ldp_vc";
        const type = "CourseCredential";

        // TODO: siop for ms
        const proof = {
          proof_type: "jwt",
          jwt: "eyJhbGciOiJFZERTQSIsImtpZCI6ImRpZDprZXk6ejZNa3RjNU5QR3R2Mm9qUFpWOFlYUFA2NFAxVGpMTThBQjU5QnVoYkdqcDJCU2p0I3o2TWt0YzVOUEd0djJvalBaVjhZWFBQNjRQMVRqTE04QUI1OUJ1aGJHanAyQlNqdCJ9.eyJpc3MiOiJtb2JpbGV3YWxsZXQiLCJhdWQiOiJodHRwczovL2Jsb2NrYmFzZS1ncXR3bWYudmlpLm1hdHRyLmdsb2JhbCIsImlhdCI6MTY4MTk3MjMzMywianRpIjoiZTI5ZWFlODQtNjgxMS00YzgyLTg0NmItM2QyNjE4YWJhYTk2In0._pSg2-NE-nH47s6MOYpWHQA6AHpOczylfwq8Wui66w63nu3mmfs4P4ypSqgNnw9XpdLJWicuqWz3Pheds8KWCw",
        };

        fetch(`${cache.credential_endpoint}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${access_token}`,
          },
          body: JSON.stringify({ format, type, proof }),
        })
          .then((res) => res.json())
          .then((data) => {
            const id = uuidv4();
            const vc = data.credential;
            const existingCredentialsString = localStorage.getItem("credentials");
            let existingCredential;
            if (existingCredentialsString) {
              existingCredential = JSON.parse(existingCredentialsString);
            } else {
              existingCredential = [];
            }
            existingCredential.push({ id, vc });
            localStorage.setItem("credentials", JSON.stringify(existingCredential));
            setIssuedCredential(vc);
          });
      });
  }, [searchParams]);

  return (
    <main>
      <div>
        <h2>DID: {did}</h2>
      </div>
      <div>
        <h2>QRCode Reader</h2>
        <video ref={ref} />
      </div>
      <div>
        {mode && (
          <div>
            <h3>Mode:</h3>
            <p>{mode}</p>
          </div>
        )}
        {dataFromOpenidCredentialIssuer && (
          <div>
            <h3>Data from Openid Credential Issuer</h3>
            <p>{JSON.stringify(dataFromOpenidCredentialIssuer)}</p>
            <button
              disabled={!authorizationUrlWithQuery || !!preCode}
              onClick={() => {
                router.push(authorizationUrlWithQuery);
              }}
            >
              Authorization
            </button>
          </div>
        )}
        {issuingCredential && (
          <div>
            <h3>Issuing Credential</h3>
            <p>{JSON.stringify(issuingCredential)}</p>
          </div>
        )}
        {code && (
          <div>
            <h3>Code from Authorization Endpoint</h3>
            <p>{code}</p>
          </div>
        )}
        {preCode && (
          <div>
            <h3>preCode from Credential Offer Endpoint</h3>
            <p>{preCode}</p>
          </div>
        )}
        {preCode && (
          <div>
            <h3>Issue from Credential Offer Endpoint [pre-authorization flow]</h3>
            <button
              onClick={async () => {
                await preAuthIssue();
              }}
            >
              Issue
            </button>
          </div>
        )}
        {accessToken && (
          <div>
            <h3>Access Token From Token Endpoint</h3>
            <p>{accessToken}</p>
          </div>
        )}
        {issuedCredential && (
          <div>
            <h3>Issued Credential</h3>
            <p>{JSON.stringify(issuedCredential)}</p>
          </div>
        )}
        {dataFromPresentaionRequest && (
          <div>
            <h3>Data from Openid Credential Issuer</h3>
            <p>{JSON.stringify(dataFromPresentaionRequest)}</p>
          </div>
        )}
        {availableCredential && (
          <div>
            <h3>Available Credential</h3>
            <p>{JSON.stringify(availableCredential)}</p>
            <button
              onClick={() => {
                // TODO: SIOPv2
                const vp_token = availableCredential;
                // TODO: presentaion submission
                const presentation_submission = {};
                fetch(dataFromPresentaionRequest.redirect_uri, {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({ vp_token, presentation_submission }),
                });
              }}
            >
              Present
            </button>
          </div>
        )}
      </div>
      <div>
        <h2>Credential Repository Logger</h2>
        <button
          onClick={() => {
            const existingCredentialsString = localStorage.getItem("credentials");
            if (!existingCredentialsString) {
              return;
            }
            console.log("existingCredentialsString", JSON.parse(existingCredentialsString));
          }}
        >
          Console
        </button>
        <button
          onClick={() => {
            localStorage.clear();
          }}
        >
          Clear
        </button>
      </div>
    </main>
  );
}
