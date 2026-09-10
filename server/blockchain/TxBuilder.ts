/**
 * TxBuilder
 *
 * Encodes ERC-20 calldata server-side using ABIs stored in the repo (ERC20_ABI).
 * The frontend never supplies its own ABI/method — only { to, amount, token } style
 * inputs — so arbitrary contract execution cannot be requested from an untrusted client.
 */

import { Interface, parseUnits } from "ethers";
import { ERC20_ABI } from "./ERC20_ABI";

const erc20Interface = new Interface(ERC20_ABI as any);

export function encodeErc20Transfer(to: string, amountBaseUnits: bigint): string {
  return erc20Interface.encodeFunctionData("transfer", [to, amountBaseUnits]);
}

export function encodeErc20Approve(spender: string, amountBaseUnits: bigint): string {
  return erc20Interface.encodeFunctionData("approve", [spender, amountBaseUnits]);
}

export function toBaseUnits(humanAmount: string, decimals: number): bigint {
  return parseUnits(humanAmount, decimals);
}
