# ⚠️ DEVNET DEMO AUDITOR KEY — DO NOT USE FOR ANYTHING REAL

This ElGamal keypair was randomly generated on 2026-09-15 purely so
`ComplianceMintCustomizer` has *some* valid pubkey to bake into the wrapped
mint at `CreateMint` time. It is **not** derived from anyone's wallet, nobody
is safeguarding the secret half, and it should be treated as burned/public
the moment it's committed here.

Before this program is used for anything beyond a local/devnet demo:

1. Decide who the real auditor is (project owner? a designated compliance
   role? see the open question in the handoff notes).
2. Derive their ElGamal keypair the same way the rest of this project does —
   from a wallet signature (`deriveElGamalKeypairForOwnerMint`-style, per
   `PRODUCT.md` §7.2) — **not** by randomly generating one like this.
3. Replace `AUDITOR_ELGAMAL_PUBKEY_B64` in `src/mint_customizer/compliance.rs`
   with that real, wallet-derived public key.
4. Since `CreateMint` bakes the auditor key in at mint-creation time
   (immutable unless `confidential_transfer_authority` later calls
   `UpdateMint`), do this *before* creating the wrapped mint you intend to
   keep — a mint created with this demo key would need `UpdateMint` (by
   whoever holds `CONFIDENTIAL_TRANSFER_AUTHORITY`, currently your devnet
   wallet `DGDkTQ2Fziv6RTwvyTuTRbqWyrLcR8hcpbM7Ytxky6St`) to fix it later.

## The demo keypair (base64)

```
pubkey_b64 = 3r7q9NN0FJUN4qM41WNCdg4WGelodhhHsLfOtPB7hWk=
secret_b64 = BQcR8z8/68cC38HkN2p+8/nh4vGCyreXBo3Q5E0xFwg=
```

Only `pubkey_b64` is baked into the program source
(`AUDITOR_ELGAMAL_PUBKEY_B64`). `secret_b64` is recorded here only so *you*
can decrypt confidential-transfer amounts against this demo mint while
testing — nobody else has it, but also nobody is protecting it, so don't
route anything through a mint created with this key that you actually care
about keeping private.
