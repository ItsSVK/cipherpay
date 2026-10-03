/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/vault.json`.
 */
export type Vault = {
  "address": "ELChxVFAiE5jv1SV3v3gprWeWxmbgX7ATWingW5VcB48",
  "metadata": {
    "name": "vault",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "applyTreasuryPending",
      "discriminator": [
        38,
        137,
        204,
        53,
        216,
        172,
        139,
        194
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "expectedPendingBalanceCreditCounter",
          "type": "u64"
        },
        {
          "name": "newDecryptableAvailableBalance",
          "type": {
            "array": [
              "u8",
              36
            ]
          }
        }
      ]
    },
    {
      "name": "configureTreasuryAccount",
      "discriminator": [
        13,
        34,
        28,
        153,
        29,
        119,
        81,
        10
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasuryTokenAccount",
          "docs": [
            "same reason as `create_confidential_account`'s token account. Owned by",
            "the vault PDA (not the admin) so `pay_employee`/`batch_pay` can move",
            "funds out of it via `invoke_signed` without a human co-signing every",
            "payment."
          ],
          "writable": true
        },
        {
          "name": "instructionsSysvar",
          "docs": [
            "`elgamal_pubkey` precedes this instruction in the same transaction."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "elgamalPubkey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "decryptableZeroBalance",
          "type": {
            "array": [
              "u8",
              36
            ]
          }
        }
      ]
    },
    {
      "name": "createConfidentialAccount",
      "docs": [
        "Confidential P2P transfer primitive: sets up a confidential",
        "Token-2022 account for the caller's own wallet, on any",
        "confidential-transfer-enabled mint. No `Vault` involved -- see",
        "`PRODUCT.md` decision 9: employees' accounts are wallet-owned, set up with this."
      ],
      "discriminator": [
        66,
        126,
        211,
        203,
        95,
        183,
        138,
        161
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenAccount",
          "docs": [
            "because Anchor's `init` sugar for token accounts can't allocate",
            "Token-2022 extension space (see `ConfidentialAccountSetup`)."
          ],
          "writable": true
        },
        {
          "name": "instructionsSysvar",
          "docs": [
            "`elgamal_pubkey` precedes this instruction in the same transaction."
          ],
          "address": "Sysvar1nstructions1111111111111111111111111"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "elgamalPubkey",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "decryptableZeroBalance",
          "type": {
            "array": [
              "u8",
              36
            ]
          }
        }
      ]
    },
    {
      "name": "depositConfidential",
      "discriminator": [
        18,
        249,
        175,
        149,
        79,
        130,
        151,
        119
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "fundTreasury",
      "discriminator": [
        71,
        154,
        45,
        220,
        206,
        32,
        174,
        239
      ],
      "accounts": [
        {
          "name": "funder",
          "signer": true
        },
        {
          "name": "funderTokenAccount",
          "writable": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeVault",
      "discriminator": [
        48,
        191,
        163,
        44,
        71,
        129,
        63,
        164
      ],
      "accounts": [
        {
          "name": "admin",
          "writable": true,
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "admin"
              },
              {
                "kind": "account",
                "path": "mint"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "pausePayroll",
      "docs": [
        "UC3 (REQ11): blocks `pay_employee`; withdrawals stay open."
      ],
      "discriminator": [
        77,
        167,
        122,
        250,
        144,
        199,
        60,
        243
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.mint",
                "account": "vault"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "payEmployee",
      "docs": [
        "UC1 (REQ01 to REQ07): pays one employee from the encrypted treasury.",
        "See `instructions/pay_employee.rs`."
      ],
      "discriminator": [
        202,
        231,
        86,
        72,
        42,
        110,
        167,
        118
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "vault",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.mint",
                "account": "vault"
              }
            ]
          }
        },
        {
          "name": "mint"
        },
        {
          "name": "treasuryTokenAccount",
          "writable": true
        },
        {
          "name": "employeeTokenAccount",
          "writable": true
        },
        {
          "name": "equalityProofContext",
          "docs": [
            "account -- Token-2022 checks its ownership (must belong to the ZK",
            "ElGamal Proof program) and contents when the CPI below runs."
          ]
        },
        {
          "name": "ciphertextValidityProofContext",
          "docs": [
            "context-state account. See `equality_proof_context`."
          ]
        },
        {
          "name": "rangeProofContext",
          "docs": [
            "account. See `equality_proof_context`."
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "newSourceDecryptableAvailableBalance",
          "type": {
            "array": [
              "u8",
              36
            ]
          }
        },
        {
          "name": "transferAmountAuditorCiphertextLo",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        },
        {
          "name": "transferAmountAuditorCiphertextHi",
          "type": {
            "array": [
              "u8",
              64
            ]
          }
        }
      ]
    },
    {
      "name": "resumePayroll",
      "docs": [
        "REQ12: reverses `pause_payroll`."
      ],
      "discriminator": [
        66,
        189,
        169,
        90,
        216,
        243,
        136,
        57
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "vault.authority",
                "account": "vault"
              },
              {
                "kind": "account",
                "path": "vault.mint",
                "account": "vault"
              }
            ]
          }
        }
      ],
      "args": []
    },
    {
      "name": "unwrapConfidential",
      "docs": [
        "Reverses `wrap_confidential`. No `Vault` involved."
      ],
      "discriminator": [
        75,
        85,
        143,
        88,
        8,
        20,
        119,
        246
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "unwrappedMint",
          "docs": [
            "The real asset's mint (e.g. USDC)."
          ]
        },
        {
          "name": "ownerUnwrappedTokenAccount",
          "docs": [
            "by `amount`. Created idempotently below if this is the caller's",
            "first time holding this mint."
          ],
          "writable": true
        },
        {
          "name": "wrappedMint",
          "docs": [
            "(seeds `[\"mint\", unwrapped_mint, wrapped_token_program]`); its supply",
            "is mutated (burned) by the CPI below."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "unwrappedMint"
              },
              {
                "kind": "account",
                "path": "wrappedTokenProgram"
              }
            ],
            "program": {
              "kind": "account",
              "path": "tokenWrapProgram"
            }
          }
        },
        {
          "name": "wrappedMintAuthority",
          "docs": [
            "(seeds `[\"authority\", wrapped_mint]`) -- owner of `escrow`. Never a",
            "signer here; the program signs for it internally."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "wrappedMint"
              }
            ],
            "program": {
              "kind": "account",
              "path": "tokenWrapProgram"
            }
          }
        },
        {
          "name": "escrow",
          "docs": [
            "caller."
          ],
          "writable": true
        },
        {
          "name": "ownerWrappedTokenAccount",
          "writable": true
        },
        {
          "name": "tokenWrapProgram",
          "address": "9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV"
        },
        {
          "name": "unwrappedTokenProgram"
        },
        {
          "name": "wrappedTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "withdrawConfidential",
      "docs": [
        "Moves `amount` from a confidential available balance back into the",
        "public balance. `amount` is a plain, public argument -- the",
        "deliberate disclosure point in this design (see",
        "`instructions/withdraw_confidential.rs`)."
      ],
      "discriminator": [
        208,
        38,
        109,
        113,
        74,
        96,
        71,
        241
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenAccount",
          "writable": true
        },
        {
          "name": "equalityProofContext",
          "docs": [
            "account -- Token-2022 checks its ownership (must belong to the ZK",
            "ElGamal Proof program) and contents when the CPI below runs."
          ]
        },
        {
          "name": "rangeProofContext",
          "docs": [
            "account. See `equality_proof_context`."
          ]
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "newDecryptableAvailableBalance",
          "type": {
            "array": [
              "u8",
              36
            ]
          }
        }
      ]
    },
    {
      "name": "wrapConfidential",
      "docs": [
        "Moves a real asset (e.g. USDC) into its wrapped, confidential-",
        "transfer-capable Token-2022 representation via CPI into",
        "`native_programs/token_wrap_compliance`. No `Vault` involved -- see",
        "`PRODUCT.md` §4 (Phase 0 primitives)."
      ],
      "discriminator": [
        128,
        133,
        83,
        244,
        96,
        224,
        133,
        65
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "unwrappedMint",
          "docs": [
            "The real asset's mint (e.g. USDC). Either classic SPL Token or",
            "Token-2022 -- `token_wrap_compliance` supports both as the unwrapped",
            "side."
          ]
        },
        {
          "name": "ownerUnwrappedTokenAccount",
          "writable": true
        },
        {
          "name": "wrappedMint",
          "docs": [
            "(seeds `[\"mint\", unwrapped_mint, wrapped_token_program]`); its supply",
            "is mutated by the CPI below."
          ],
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  105,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "unwrappedMint"
              },
              {
                "kind": "account",
                "path": "wrappedTokenProgram"
              }
            ],
            "program": {
              "kind": "account",
              "path": "tokenWrapProgram"
            }
          }
        },
        {
          "name": "wrappedMintAuthority",
          "docs": [
            "(seeds `[\"authority\", wrapped_mint]`) -- mint authority for",
            "`wrapped_mint` and owner of `escrow`. Never a signer here; the",
            "program signs for it internally via its own `invoke_signed`."
          ],
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "wrappedMint"
              }
            ],
            "program": {
              "kind": "account",
              "path": "tokenWrapProgram"
            }
          }
        },
        {
          "name": "escrow",
          "docs": [
            "supply. Created idempotently below if this is the first wrap for",
            "this mint pair."
          ],
          "writable": true
        },
        {
          "name": "ownerWrappedTokenAccount",
          "docs": [
            "`amount`. Created idempotently below if this is the caller's first",
            "wrap."
          ],
          "writable": true
        },
        {
          "name": "tokenWrapProgram",
          "address": "9tbZBdds8EuGX2Yb1yBYWtnA9UyhgxjfVCmgmfV5LPwV"
        },
        {
          "name": "unwrappedTokenProgram"
        },
        {
          "name": "wrappedTokenProgram",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "applyTreasuryPendingEvent",
      "discriminator": [
        106,
        202,
        138,
        222,
        144,
        58,
        63,
        165
      ]
    },
    {
      "name": "configureTreasuryAccountEvent",
      "discriminator": [
        235,
        130,
        203,
        34,
        41,
        176,
        82,
        168
      ]
    },
    {
      "name": "createConfidentialAccountEvent",
      "discriminator": [
        71,
        252,
        169,
        242,
        138,
        47,
        74,
        211
      ]
    },
    {
      "name": "depositConfidentialEvent",
      "discriminator": [
        203,
        117,
        159,
        128,
        150,
        145,
        28,
        71
      ]
    },
    {
      "name": "fundTreasuryEvent",
      "discriminator": [
        82,
        215,
        15,
        113,
        234,
        242,
        196,
        212
      ]
    },
    {
      "name": "initializeVaultEvent",
      "discriminator": [
        179,
        75,
        50,
        161,
        191,
        28,
        245,
        107
      ]
    },
    {
      "name": "pausePayrollEvent",
      "discriminator": [
        95,
        155,
        243,
        118,
        222,
        184,
        46,
        231
      ]
    },
    {
      "name": "payEmployeeEvent",
      "discriminator": [
        57,
        194,
        139,
        91,
        218,
        6,
        116,
        242
      ]
    },
    {
      "name": "resumePayrollEvent",
      "discriminator": [
        180,
        82,
        124,
        144,
        171,
        66,
        248,
        44
      ]
    },
    {
      "name": "unwrapConfidentialEvent",
      "discriminator": [
        12,
        35,
        252,
        253,
        192,
        240,
        27,
        113
      ]
    },
    {
      "name": "withdrawConfidentialEvent",
      "discriminator": [
        207,
        99,
        72,
        95,
        186,
        134,
        217,
        229
      ]
    },
    {
      "name": "wrapConfidentialEvent",
      "discriminator": [
        20,
        62,
        207,
        123,
        186,
        80,
        202,
        123
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "unauthorized",
      "msg": "Only the vault's authority can perform this action"
    },
    {
      "code": 6001,
      "name": "treasuryAlreadyConfigured",
      "msg": "The vault's treasury account has already been configured"
    },
    {
      "code": 6002,
      "name": "treasuryNotConfigured",
      "msg": "The vault's treasury account has not been configured yet"
    },
    {
      "code": 6003,
      "name": "payrollPaused",
      "msg": "Payroll is paused for this vault"
    }
  ],
  "types": [
    {
      "name": "applyTreasuryPendingEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "configureTreasuryAccountEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "treasuryTokenAccount",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "createConfidentialAccountEvent",
      "docs": [
        "Emitted by `create_confidential_account` -- deliberately has no `vault`",
        "field, unlike every event above it. This is the P2P-transfer primitive",
        "(`PRODUCT.md` §4, Phase 0 primitives): a wallet setting up its own confidential account",
        "for a mint, with no vault/treasury/employee relationship involved at all."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "depositConfidentialEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "fundTreasuryEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "funder",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "initializeVaultEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "pausePayrollEvent",
      "docs": [
        "Emitted by `pause_payroll`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "payEmployeeEvent",
      "docs": [
        "Emitted by `pay_employee`. Deliberately has no plaintext amount: the amount",
        "appears only as its two auditor-encrypted halves (lo 16 bits, hi 32 bits),",
        "which the auditor decrypts and recombines as `lo + hi * 2^16`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "employee",
            "type": "pubkey"
          },
          {
            "name": "employeeTokenAccount",
            "type": "pubkey"
          },
          {
            "name": "auditorCiphertextLo",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          },
          {
            "name": "auditorCiphertextHi",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    },
    {
      "name": "resumePayrollEvent",
      "docs": [
        "Emitted by `resume_payroll`."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "unwrapConfidentialEvent",
      "docs": [
        "Emitted by `unwrap_confidential`. See `WrapConfidentialEvent` for why",
        "there's no `vault` field."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "unwrappedMint",
            "type": "pubkey"
          },
          {
            "name": "wrappedMint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "paused",
            "type": "bool"
          },
          {
            "name": "treasuryTokenAccount",
            "type": "pubkey"
          },
          {
            "name": "treasuryElgamalPubkey",
            "type": "pubkey"
          },
          {
            "name": "treasuryConfigured",
            "type": "bool"
          }
        ]
      }
    },
    {
      "name": "withdrawConfidentialEvent",
      "docs": [
        "Emitted by `withdraw_confidential`. Unlike `PayEmployeeEvent`,",
        "`amount` is included here on purpose -- Withdraw is the deliberate",
        "disclosure point in this design (`PRODUCT.md` §7.4), not something to",
        "obscure."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "tokenAccount",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "wrapConfidentialEvent",
      "docs": [
        "Emitted by `wrap_confidential`. `wrapped_mint`/`wrapped_token_account`",
        "are `token_wrap_compliance`'s accounts, not `vault`'s -- recorded here",
        "only for indexers, since `vault` itself keeps no bookkeeping state for",
        "wrapping (same no-vault-state posture as `CreateConfidentialAccountEvent`)."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "unwrappedMint",
            "type": "pubkey"
          },
          {
            "name": "wrappedMint",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "vaultSeed",
      "type": "bytes",
      "value": "[118, 97, 117, 108, 116]"
    }
  ]
};
