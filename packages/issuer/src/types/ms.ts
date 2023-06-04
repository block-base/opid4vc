export interface MSCredentialRequest {
  id_token_hint: string;
}

export interface MSManifest {
  display: {
    contract: string;
    card: {
      title: string;
      description: string;
      backgroundColor: string;

      logo: {
        uri: string;
      };
    };
  };
  input: {
    attestations: {
      idTokens: [
        {
          claims: [
            {
              claim: string;
            }
          ];
        }
      ];
    };
  };
}
