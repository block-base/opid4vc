"use client";
import { useRouter } from "next/navigation";
import qs from "querystring";
import { useEffect, useState } from "react";
import { useZxing } from "react-zxing";

import { OpenIdConfiguration } from "../../../common/types/credential";

export default function Home() {
  const router = useRouter();

  const [dataInQRCode, setDataInQRCode] = useState("");
  const [mode, setMode] = useState<"Issue" | "Verify">();
  const [dataFromOpenidCredentialIssuer, setDataFromOpenidCredentialIssuer] = useState<OpenIdConfiguration>();
  const [authorizationUrlWithQuery, setAuthorizationUrlWithQuery] = useState("");

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

    const { issuer, authorization_endpoint } = dataFromOpenidCredentialIssuer;

    // Note: The current implementation only considers the first value in the array for processing.
    // However, future development should consider handling multiple values, to accommodate potential changes or added complexity in data.
    const [scope] = dataFromOpenidCredentialIssuer.scopes_supported;
    const [response_type] = dataFromOpenidCredentialIssuer.response_types_supported;

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
    setAuthorizationUrlWithQuery(`${authorization_endpoint}?${queryString}`);
  }, [dataFromOpenidCredentialIssuer]);

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
    </main>
  );
}
