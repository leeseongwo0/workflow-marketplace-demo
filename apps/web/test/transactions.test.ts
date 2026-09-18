import { describe, expect, it } from "vitest";

import { bcs } from "@mysten/sui/bcs";
import { Transaction } from "@mysten/sui/transactions";

import {
  buildCreateExecutionRequestTransaction,
  buildPurchaseLicenseTransaction,
  buildRecordReceiptTransaction,
} from "../src/live/transactions";

const PACKAGE_ID = `0x${"9".repeat(64)}`;
const CONFIG_ID = `0x${"a".repeat(64)}`;
const RELEASE_ID = `0x${"b".repeat(64)}`;
const LICENSE_ID = `0x${"c".repeat(64)}`;
const VAULT_ID = `0x${"d".repeat(64)}`;
const REQUEST_ID = `0x${"e".repeat(64)}`;
const RECIPIENT = `0x${"f".repeat(64)}`;
const CLOCK_ID = `0x${"0".repeat(63)}6`;
const PRICE_MIST = 0x0102030405060708n;

type Argument =
  | { $kind: "Input"; Input: number; type?: "pure" | "object" }
  | { $kind: "NestedResult"; NestedResult: [number, number] }
  | { $kind: "Result"; Result: number };

type TransactionData = {
  inputs: Array<{
    Pure?: { bytes: string };
    UnresolvedObject?: { objectId: string };
  }>;
  commands: Array<{
    SplitCoins?: unknown;
    TransferObjects?: { objects: Argument[]; address: Argument };
    MoveCall?: {
      package: string;
      module: string;
      function: string;
      typeArguments: string[];
      arguments: Argument[];
    };
  }>;
};

function dataOf(transaction: Transaction): TransactionData {
  return transaction.getData() as unknown as TransactionData;
}

function decodeBase64(value: string): Uint8Array {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

/*
 * Arguments are resolved through the input table rather than by hard-coded
 * index: the builder deduplicates identical pure inputs, so two `None` options
 * collapse into one entry and fixed indices would assert the wrong thing.
 */
function pureArg(data: TransactionData, argument: Argument | undefined): Uint8Array {
  if (argument?.$kind !== "Input") throw new Error("argument is not an input");
  const input = data.inputs[argument.Input];
  if (input?.Pure === undefined) throw new Error("input is not pure");
  return decodeBase64(input.Pure.bytes);
}

function objectArg(data: TransactionData, argument: Argument | undefined): string {
  if (argument?.$kind !== "Input") throw new Error("argument is not an input");
  const input = data.inputs[argument.Input];
  if (input?.UnresolvedObject === undefined) throw new Error("input is not an object");
  return input.UnresolvedObject.objectId;
}

function moveCall(data: TransactionData, index: number) {
  const call = data.commands[index]?.MoveCall;
  if (call === undefined) throw new Error(`command ${index} is not a MoveCall`);
  return call;
}

describe("web transaction builders", () => {
  it("builds buy_license with the config, release, vault, payment, uncapped options, and clock in order", () => {
    const transaction = buildPurchaseLicenseTransaction({
      packageId: PACKAGE_ID,
      marketplaceConfigId: CONFIG_ID,
      releaseId: RELEASE_ID,
      vaultId: VAULT_ID,
      priceMist: PRICE_MIST,
    });
    const data = dataOf(transaction);

    expect(data.commands[0]).toMatchObject({
      SplitCoins: {
        coin: { GasCoin: true, $kind: "GasCoin" },
      },
    });

    const call = moveCall(data, 1);
    expect(call.package).toBe(PACKAGE_ID);
    expect(call.module).toBe("marketplace");
    expect(call.function).toBe("buy_license");
    expect(call.typeArguments).toEqual([]);
    expect(call.arguments).toHaveLength(7);

    expect(objectArg(data, call.arguments[0])).toBe(CONFIG_ID);
    expect(objectArg(data, call.arguments[1])).toBe(RELEASE_ID);
    expect(objectArg(data, call.arguments[2])).toBe(VAULT_ID);
    expect(call.arguments[3]).toMatchObject({ $kind: "NestedResult", NestedResult: [0, 0] });
    // None, so the licence is neither run-capped nor time-limited.
    expect(pureArg(data, call.arguments[4])).toEqual(Uint8Array.from([0]));
    expect(pureArg(data, call.arguments[5])).toEqual(Uint8Array.from([0]));
    expect(objectArg(data, call.arguments[6])).toBe(CLOCK_ID);
  });

  it("splits exactly the license price as a little-endian u64", () => {
    const data = dataOf(buildPurchaseLicenseTransaction({
      packageId: PACKAGE_ID,
      marketplaceConfigId: CONFIG_ID,
      releaseId: RELEASE_ID,
      vaultId: VAULT_ID,
      priceMist: PRICE_MIST,
    }));
    const amount = (data.commands[0] as { SplitCoins: { amounts: Argument[] } })
      .SplitCoins.amounts[0];
    expect(pureArg(data, amount)).toEqual(bcs.u64().serialize(PRICE_MIST).toBytes());
  });

  it("rejects non-positive and overflowing license prices", () => {
    const base = {
      packageId: PACKAGE_ID,
      marketplaceConfigId: CONFIG_ID,
      releaseId: RELEASE_ID,
      vaultId: VAULT_ID,
    };
    expect(() => buildPurchaseLicenseTransaction({ ...base, priceMist: 0n })).toThrow(
      "positive u64",
    );
    expect(() => buildPurchaseLicenseTransaction({ ...base, priceMist: 1n << 64n })).toThrow(
      "positive u64",
    );
  });

  it("builds create_execution_request with the license, release, and clock", () => {
    const data = dataOf(buildCreateExecutionRequestTransaction({
      packageId: PACKAGE_ID,
      licenseId: LICENSE_ID,
      releaseId: RELEASE_ID,
    }));
    const call = moveCall(data, 0);

    expect(call.module).toBe("execution");
    expect(call.function).toBe("create_execution_request");
    expect(call.arguments).toHaveLength(3);
    expect(objectArg(data, call.arguments[0])).toBe(LICENSE_ID);
    expect(objectArg(data, call.arguments[1])).toBe(RELEASE_ID);
    expect(objectArg(data, call.arguments[2])).toBe(CLOCK_ID);
  });

  it("builds record_execution and transfers the returned receipt to the runner", () => {
    const data = dataOf(buildRecordReceiptTransaction({
      packageId: PACKAGE_ID,
      licenseId: LICENSE_ID,
      releaseId: RELEASE_ID,
      requestId: REQUEST_ID,
      recipient: RECIPIENT,
    }));
    const call = moveCall(data, 0);

    expect(call.package).toBe(PACKAGE_ID);
    expect(call.module).toBe("execution");
    expect(call.function).toBe("record_execution");
    expect(call.arguments).toHaveLength(4);
    expect(objectArg(data, call.arguments[0])).toBe(LICENSE_ID);
    expect(objectArg(data, call.arguments[1])).toBe(RELEASE_ID);
    expect(objectArg(data, call.arguments[2])).toBe(REQUEST_ID);
    expect(objectArg(data, call.arguments[3])).toBe(CLOCK_ID);

    // The receipt is returned rather than transferred by the module, so the
    // transaction has to take ownership of it. public_transfer is used instead
    // of a TransferObjects command because the demo wallet refuses to sign that
    // shape — see the builder for the detail.
    const transfer = moveCall(data, 1);
    expect(transfer.package).toBe(`0x${"0".repeat(63)}2`);
    expect(transfer.module).toBe("transfer");
    expect(transfer.function).toBe("public_transfer");
    expect(transfer.typeArguments).toEqual([`${PACKAGE_ID}::execution::ExecutionReceipt`]);
    expect(transfer.arguments[0]).toMatchObject({ $kind: "Result", Result: 0 });
    expect(pureArg(data, transfer.arguments[1])).toEqual(
      bcs.Address.serialize(RECIPIENT).toBytes(),
    );
  });
});
