import { createSolanaRpc, devnet } from "@solana/kit";
import { SOLANA_RPC_URL } from "./constants";

/** One shared devnet RPC client. The public endpoint rate-limits; set NEXT_PUBLIC_SOLANA_RPC_URL to a dedicated one. */
export const rpc = createSolanaRpc(devnet(SOLANA_RPC_URL));
export type AppRpc = typeof rpc;
