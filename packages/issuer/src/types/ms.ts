export interface MSCredentialRequest {
  id_token_hint: string;
}

export interface MSManifest {
  display: {
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
