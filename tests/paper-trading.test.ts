import test from "node:test";
import assert from "node:assert/strict";
import {
  kaleidoNotImplementedBody,
  liveExecuteTradeNotImplementedBody,
  paperFilledTradeNote,
  paperTradingMeta,
  PAPER_TRADE_NOTE,
  PAPER_TRADES_EXECUTE_PATH,
  PAPER_TRADING_MODE,
  PAPER_TRADING_WARNING,
} from "../server/trading/paperTrading";

test("paper trading meta uses PAPER_TRADING and a simulated warning", () => {
  const meta = paperTradingMeta();
  assert.equal(meta.mode, PAPER_TRADING_MODE);
  assert.equal(meta.mode, "PAPER_TRADING");
  assert.equal(meta.realExecution, false);
  assert.equal(meta.warning, PAPER_TRADING_WARNING);
  assert.match(meta.warning, /simulated/i);
});

test("paper FILLED trades carry an on-chain disclaimer note", () => {
  const note = paperFilledTradeNote();
  assert.equal(note.note, PAPER_TRADE_NOTE);
  assert.match(note.note, /not settled on-chain/i);
});

test("live execute-trade payload is NOT_IMPLEMENTED and points at paper trading", () => {
  const body = liveExecuteTradeNotImplementedBody();
  assert.equal(body.ok, false);
  assert.equal(body.status, "NOT_IMPLEMENTED");
  assert.equal(body.paperTrading, PAPER_TRADES_EXECUTE_PATH);
  assert.equal(body.paperTrading, "/api/paper/trades/execute");
  assert.doesNotMatch(JSON.stringify(body), /FILLED/);
});

test("kaleido/fabric payload is unimplemented and does not imply a live portal", () => {
  const body = kaleidoNotImplementedBody();
  assert.equal(body.ok, false);
  assert.equal(body.status, "NOT_IMPLEMENTED");
  assert.match(body.note, /VITE_ENABLE_LEGACY_KALEIDO_PORTAL/);
});
