import * as ionjs from "@decentralized-identity/ion-sdk/dist/lib/index";
import { calculateJwkThumbprint, JWK } from "jose";
import moment from "moment";
import { v4 as uuidv4 } from "uuid";

export interface KeyPair {
  publicJwk: JWK;
  privateJwk: JWK;
}

export interface SiopOptions {
  aud: string;
  contract?: string;
  attestations?: any;
  recipient?: string;
  vc?: string;
  nonce?: string;
  state?: string;
  nbf?: number;
  presentation_submission?: {
    descriptor_map?: [
      {
        id?: string;
        path?: string;
        encoding?: string;
        format?: string;
      }?
    ];
  };
  pin?: string;
}

const DID_ION_KEY_ID = "signingKey";

export class Signer {
  did: string | undefined = undefined;

  recoveryKey: ionjs.JwkEs256k | undefined = undefined;
  updateKey: ionjs.JwkEs256k | undefined = undefined;

  privateKeyJwk: ionjs.JwkEs256k | undefined = undefined;
  publicKeyJwk: ionjs.JwkEs256k | undefined = undefined;

  init = async (publicKeyJwk: ionjs.JwkEs256k, privateKeyJwk: ionjs.JwkEs256k): Promise<void> => {
    this.privateKeyJwk = privateKeyJwk;
    this.publicKeyJwk = publicKeyJwk;

    this.recoveryKey = publicKeyJwk;
    this.updateKey = this.recoveryKey;

    const document: ionjs.IonDocumentModel = {
      publicKeys: [
        {
          id: `signingKey`,
          type: "EcdsaSecp256k1VerificationKey2019",
          publicKeyJwk: this.publicKeyJwk,
          purposes: [ionjs.IonPublicKeyPurpose.Authentication],
        },
      ],
    };

    this.did = await ionjs.IonDid.createLongFormDid({
      recoveryKey: this.recoveryKey,
      updateKey: this.updateKey,
      document,
    });
  };

  siop = async (options: SiopOptions): Promise<string> => {
    if (!this.privateKeyJwk) throw new Error("privateJwk is not initialized");
    if (!this.did) throw new Error("did is not initialized");
    const signer = ionjs.LocalSigner.create(this.privateKeyJwk);
    return await signer.sign(
      {
        typ: "JWT",
        alg: "ES256K",
        kid: `${this.did}#${DID_ION_KEY_ID}`,
      },
      {
        iat: moment().unix(),
        exp: moment().add(30, "minutes").unix(),
        did: this.did,
        jti: uuidv4().toUpperCase(),
        sub: await calculateJwkThumbprint(this.publicKeyJwk as JWK),
        sub_jwk: {
          ...this.publicKeyJwk,
          key_ops: ["verify"],
          use: "sig",
          alg: "ES256K",
          kid: `${DID_ION_KEY_ID}`,
        },
        iss: "https://self-issued.me",
        ...options,
      }
    );
  };
}
