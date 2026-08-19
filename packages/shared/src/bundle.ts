import { z } from "zod";

export const BUNDLE_AAD_DOMAIN = "AIWF_BUNDLE_V1" as const;
export const ENVELOPE_CIPHER = "AES-256-GCM" as const;

const suiAddressInputSchema = z.string().regex(/^0x[0-9a-fA-F]{1,64}$/u);
const sha256HexInputSchema = z.string().regex(/^[0-9a-fA-F]{64}$/u);
const canonicalBase64Schema = z
  .string()
  .regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u);

export function normalizeSuiAddress(value: string): string {
  const parsed = suiAddressInputSchema.parse(value);
  return `0x${parsed.slice(2).toLowerCase().padStart(64, "0")}`;
}

export function normalizeSha256Hex(value: string): string {
  return sha256HexInputSchema.parse(value).toLowerCase();
}

export const bundleAadSchema = z.strictObject({
  domain: z.literal(BUNDLE_AAD_DOMAIN),
  rootId: z.string().regex(/^0x[0-9a-f]{64}$/u),
  version: z.string().regex(/^\d+\.\d+\.\d+$/u),
  publicManifestHash: z.string().regex(/^[0-9a-f]{64}$/u),
});

export type BundleAad = z.infer<typeof bundleAadSchema>;

export const bundleKeyIdSchema = z
  .string()
  .regex(/^root:0x[0-9a-f]{64}:release:\d+\.\d+\.\d+$/u);

export function createBundleAad(input: {
  rootId: string;
  version: string;
  publicManifestHash: string;
}): BundleAad {
  return bundleAadSchema.parse({
    domain: BUNDLE_AAD_DOMAIN,
    rootId: normalizeSuiAddress(input.rootId),
    version: input.version,
    publicManifestHash: normalizeSha256Hex(input.publicManifestHash),
  });
}

export function createBundleKeyId(aad: BundleAad): string {
  const parsed = bundleAadSchema.parse(aad);
  return `root:${parsed.rootId}:release:${parsed.version}`;
}

export const encryptedEnvelopeSchema = z.strictObject({
  envelopeVersion: z.literal(1),
  cipher: z.literal(ENVELOPE_CIPHER),
  keyId: bundleKeyIdSchema,
  nonceBase64: canonicalBase64Schema,
  tagBase64: canonicalBase64Schema,
  ciphertextBase64: canonicalBase64Schema,
  aadBase64: canonicalBase64Schema,
});

export type EncryptedEnvelope = z.infer<typeof encryptedEnvelopeSchema>;
