import { describe, expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { findOperatorConfigPda, findVaultPda, getSetOperatorInstructionDataDecoder, VAULT_PROGRAM_ADDRESS } from "@/generated/vault/src/generated";
import { DEVNET_WUSDC_MINT } from "./constants";
import { buildAuthorizeInstruction, buildRevokeInstruction, DEFAULT_OPERATOR_TTL_SECONDS } from "./operator";

const WUSDC = address(DEVNET_WUSDC_MINT);
const SYSTEM = address("11111111111111111111111111111111");

describe("operator instructions", () => {
  test("authorize names the helper, expires when asked, carries the payment cap, and uses the admin's vault and the operator PDA", async () => {
    const admin = await generateKeyPairSigner();
    const helper = await generateKeyPairSigner();
    const now = 1_800_000_000;
    const ix = await buildAuthorizeInstruction(admin, helper.address, { ttlSeconds: DEFAULT_OPERATOR_TTL_SECONDS, maxPayments: 7 }, now);
    const [vault] = await findVaultPda({ admin: admin.address, mint: WUSDC });
    const [config] = await findOperatorConfigPda({ vault });
    expect(ix.programAddress).toBe(VAULT_PROGRAM_ADDRESS);
    expect(ix.accounts!.map((a) => a.address)).toEqual([admin.address, vault, config, SYSTEM]);
    const data = getSetOperatorInstructionDataDecoder().decode(Uint8Array.from(ix.data!));
    expect(data.operator).toBe(helper.address);
    expect(data.expiresAt).toBe(BigInt(now + DEFAULT_OPERATOR_TTL_SECONDS));
    expect(data.maxPayments).toBe(7);
  });

  test("revoke stores the default address with no expiry", async () => {
    const admin = await generateKeyPairSigner();
    const ix = await buildRevokeInstruction(admin);
    const data = getSetOperatorInstructionDataDecoder().decode(Uint8Array.from(ix.data!));
    expect(data.operator).toBe(SYSTEM);
    expect(data.expiresAt).toBe(0n);
    expect(data.maxPayments).toBe(0);
  });
});
