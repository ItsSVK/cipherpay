import { describe, expect, test } from "bun:test";
import { address, generateKeyPairSigner } from "@solana/kit";
import { findVaultPda, getPausePayrollInstructionDataEncoder, getResumePayrollInstructionDataEncoder, VAULT_PROGRAM_ADDRESS } from "@/generated/vault/src/generated";
import { DEVNET_WUSDC_MINT } from "./constants";
import { buildPauseInstruction } from "./pause";

describe("buildPauseInstruction", () => {
  test("pause and resume are different vault instructions on the admin's own vault, signed by the admin", async () => {
    const admin = await generateKeyPairSigner();
    const [vault] = await findVaultPda({ admin: admin.address, mint: address(DEVNET_WUSDC_MINT) });
    const pause = await buildPauseInstruction({ admin, paused: true });
    const resume = await buildPauseInstruction({ admin, paused: false });

    for (const ix of [pause, resume]) {
      expect(ix.programAddress).toBe(VAULT_PROGRAM_ADDRESS);
      expect(ix.accounts!.map((a) => a.address)).toEqual([admin.address, vault]);
    }
    expect(Uint8Array.from(pause.data!)).toEqual(Uint8Array.from(getPausePayrollInstructionDataEncoder().encode({})));
    expect(Uint8Array.from(resume.data!)).toEqual(Uint8Array.from(getResumePayrollInstructionDataEncoder().encode({})));
    expect(Uint8Array.from(pause.data!)).not.toEqual(Uint8Array.from(resume.data!));
  });
});
