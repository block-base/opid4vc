"use client";
import { useRouter, useSearchParams } from "next/navigation";
import qs from "querystring";
import { useEffect, useState } from "react";
import { useZxing } from "react-zxing";

import { StoredCacheWithState } from "@/types/cache";

import { OpenIdConfiguration } from "../../../common/types/credential";

export default function Home() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // console.log(searchParams);

  const [dataInQRCode, setDataInQRCode] = useState("");
  const [mode, setMode] = useState<"Issue" | "Verify">();
  const [dataFromOpenidCredentialIssuer, setDataFromOpenidCredentialIssuer] = useState<OpenIdConfiguration>();
  const [authorizationUrlWithQuery, setAuthorizationUrlWithQuery] = useState("");
  const [issuingCredential, setIssuingCredential] = useState<Credential>();
  const [code, setCode] = useState("");
  const [accessToken, setAccessToken] = useState("");

  const { ref } = useZxing({
    onResult(result) {
      setDataInQRCode(result.getText());
    },
  });

  useEffect(() => {
    if (!dataInQRCode) {
      return;
    }
    const issueKey = "openid-credential-offer://?credential_offer";
    const parsedQuery = qs.parse(dataInQRCode);
    if (typeof parsedQuery[issueKey] === "string") {
      setMode("Issue");
      const credentialOffer = JSON.parse(parsedQuery[issueKey]);
      fetch(`${credentialOffer.credential_issuer}/.well-known/openid-credential-issuer`)
        .then(async (res) => await res.json())
        .then((data) => {
          setDataFromOpenidCredentialIssuer(data);
        });
    } else {
      console.log("TODO: verify");
    }
  }, [dataInQRCode]);

  useEffect(() => {
    if (!dataFromOpenidCredentialIssuer) {
      return;
    }
    const { issuer, authorization_endpoint, token_endpoint, credential_endpoint } = dataFromOpenidCredentialIssuer;

    // Note: The current implementation only considers the first value in the array for processing.
    // However, future development should consider handling multiple values, to accommodate potential changes or added complexity in data.
    const [scope] = dataFromOpenidCredentialIssuer.scopes_supported;
    const [response_type] = dataFromOpenidCredentialIssuer.response_types_supported;
    const [credential] = dataFromOpenidCredentialIssuer.credentials_supported;
    // Note: The current implementation is hardcoded for simplicity. However, future iterations should aim to calculate these values dynamically.
    const state = "xqw2Lcafhx0NIoX0";
    const nonce = "kjfhuo34hPxksklj";

    const cliendId = process.env.NEXT_PUBLIC_CLIENT_ID;
    const redirect_uri = "http://localhost:3000";
    const audience = issuer;

    const queryString = qs.stringify({
      scope,
      response_type,
      state,
      nonce,
      cliendId,
      redirect_uri,
      audience,
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
    setCode(code);
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
        } else {
          setAccessToken(access_token);
        }

        // Note: hardcode for now
        const format = "ldp_vc";
        const type = "CourseCredential";
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
          .then((data) => console.log(data));
      });
  }, [searchParams]);

  return (
    <main>
      <video ref={ref} />
      {mode && (
        <div>
          <h2>Mode:</h2>
          <p>{mode}</p>
        </div>
      )}
      {dataInQRCode && (
        <div>
          <h2>Data QR Code:</h2>
          <p>{dataInQRCode}</p>
        </div>
      )}
      {dataFromOpenidCredentialIssuer && (
        <div>
          <h2>Data from Openid Credential Issuer</h2>
          <p>{JSON.stringify(dataFromOpenidCredentialIssuer)}</p>
          <button
            disabled={!authorizationUrlWithQuery}
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
          <h2>Issuing Credential</h2>
          <p>{JSON.stringify(issuingCredential)}</p>
        </div>
      )}
      {code && (
        <div>
          <h2>Code from Authorization Endpoint</h2>
          <p>{code}</p>
        </div>
      )}
      {accessToken && (
        <div>
          <h2>Access Token From Token Endpoint</h2>
          <p>{accessToken}</p>
        </div>
      )}
    </main>
  );
}
