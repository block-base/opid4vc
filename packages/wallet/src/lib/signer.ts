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

export interface SiopV2Options {
  aud: string;
  nonce?: string;
  state?: string;
  nbf?: number;
  _vp_token?: {
    presentation_submission?: {
      id?: string;
      definition_id?: string;
      descriptor_map?: {
        path?: string;
        id?: string;
        format?: string;
        path_nested?: {
          id?: string;
          format?: string;
          path?: string;
        };
      }[];
    };
  };
}

export interface VPOptions {
  vcs: string[] | any[];
  verifierDID: string;
  nonce?: string;
}

const DID_ION_KEY_ID = "signingKey";
const SIOP_VALIDITY_IN_MINUTES = 30;

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
        exp: moment().add(SIOP_VALIDITY_IN_MINUTES, "minutes").unix(),
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

  siopV2 = async (options: SiopV2Options): Promise<string> => {
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
        exp: moment().add(SIOP_VALIDITY_IN_MINUTES, "minutes").unix(),
        sub: this.did,
        iss: "https://self-issued.me/v2/openid-vc",
        ...options,
      }
    );
  };

  createVP = async (format: "ldp_vp" | "jwt_vp_json", options: VPOptions): Promise<string | any> => {
    if (!this.privateKeyJwk) throw new Error("privateJwk is not initialized");
    if (!this.did) throw new Error("did is not initialized");
    const signer = ionjs.LocalSigner.create(this.privateKeyJwk);

    if (format === "jwt_vp_json") {
      return await signer.sign(
        {
          typ: "JWT",
          alg: "ES256K",
          kid: `${this.did}#${DID_ION_KEY_ID}`,
        },
        {
          iat: moment().unix(),
          exp: moment().add(SIOP_VALIDITY_IN_MINUTES, "minutes").unix(),
          nbf: moment().unix(),
          jti: uuidv4().toUpperCase(),
          vp: {
            "@context": ["https://www.w3.org/2018/credentials/v1"],
            type: ["VerifiablePresentation"],
            verifiableCredential: options.vcs,
          },
          iss: this.did,
          aud: options.verifierDID,
          nonce: options.nonce,
        }
      );
    }
    if (format === "ldp_vp") {
      // TODO: sign
      // create json-ld verifiable presentation
      const vp = {};
      return vp;
    }
  };
}
