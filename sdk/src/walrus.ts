import * as fs from "node:fs";

const PUBLISHER_URL = "https://publisher.walrus-testnet.walrus.space";
const AGGREGATOR_URL = "https://aggregator.walrus-testnet.walrus.space";

export async function uploadToWalrus(filePath: string): Promise<string> {
  const data = fs.readFileSync(filePath);
  return uploadBytesToWalrus(data);
}

export async function uploadBytesToWalrus(data: Uint8Array): Promise<string> {
  const response = await fetch(`${PUBLISHER_URL}/v1/blobs`, {
    method: "PUT",
    headers: { "Content-Type": "application/octet-stream" },
    body: data,
  });
  if (!response.ok) {
    throw new Error(`Walrus upload failed: ${response.statusText}`);
  }

  const result: any = await response.json();
  const blobId =
    result.newlyCreated?.blobObject?.blobId ??
    result.alreadyCertified?.blobId;
  if (!blobId) {
    throw new Error("Failed to extract blob ID from Walrus response");
  }
  return blobId;
}

export async function downloadFromWalrus(blobId: string): Promise<Buffer> {
  const response = await fetch(`${AGGREGATOR_URL}/v1/blobs/${blobId}`);
  if (!response.ok) {
    throw new Error(`Walrus download failed: ${response.statusText}`);
  }
  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
